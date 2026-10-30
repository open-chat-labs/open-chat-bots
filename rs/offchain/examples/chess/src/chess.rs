//! One game of chess, with its clock. The rules are shakmaty's. Each side has ten minutes for the
//! whole game, with no increment, and the game ends by itself on checkmate, stalemate,
//! insufficient material, threefold repetition, the fifty-move rule, or a flag falling. Who plays
//! each side is the bot's business: this knows only White and Black.
use oc_bots_sdk::types::TimestampMillis;
use serde::Serialize;
use shakmaty::fen::{Epd, Fen};
use shakmaty::san::SanPlus;
use shakmaty::uci::UciMove;
use shakmaty::{Chess, Color, EnPassantMode, Position};
use std::collections::HashMap;

/// Each side's time for the whole game
pub const TIME_PER_SIDE_MS: u64 = 10 * 60 * 1000;

pub struct Match {
    position: Chess,
    /// Every move so far, in standard algebraic notation, eg. "Nf3", "O-O", "e8=Q+"
    moves: Vec<String>,
    last_move: Option<LastMove>,
    /// How often each position has come up, by its placement, side to move, castling rights and
    /// en passant square, for the threefold repetition rule
    repetitions: HashMap<String, u32>,
    clock: Clock,
    draw_offer: Option<Color>,
    ending: Option<Ending>,
}

struct Clock {
    /// What each side had left when its clock last stopped
    white_ms: u64,
    black_ms: u64,
    /// When the side to move's clock started running. Once the game's over, nothing runs.
    since: TimestampMillis,
}

impl Clock {
    fn left(&self, color: Color) -> u64 {
        color.fold_wb(self.white_ms, self.black_ms)
    }

    fn left_mut(&mut self, color: Color) -> &mut u64 {
        match color {
            Color::White => &mut self.white_ms,
            Color::Black => &mut self.black_ms,
        }
    }
}

/// How a game ended, with the winner where there is one
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ending {
    Checkmate(Color),
    Resignation(Color),
    Timeout(Color),
    Stalemate,
    InsufficientMaterial,
    Repetition,
    FiftyMoves,
    Agreement,
    /// A flag fell, but the other side couldn't have mated, so no one wins
    TimeoutDraw,
}

impl Ending {
    /// The result as the card shows it, eg. "White won by checkmate"
    pub fn describe(self) -> String {
        match self {
            Ending::Checkmate(winner) => format!("{} won by checkmate", side_name(winner)),
            Ending::Resignation(winner) => format!("{} won by resignation", side_name(winner)),
            Ending::Timeout(winner) => format!("{} won on time", side_name(winner)),
            Ending::Stalemate => "Draw by stalemate".to_string(),
            Ending::InsufficientMaterial => "Draw by insufficient material".to_string(),
            Ending::Repetition => "Draw by threefold repetition".to_string(),
            Ending::FiftyMoves => "Draw by the fifty-move rule".to_string(),
            Ending::Agreement => "Draw by agreement".to_string(),
            Ending::TimeoutDraw => "Draw: time ran out against insufficient material".to_string(),
        }
    }
}

impl Match {
    /// The starting position, with White's clock running from `now`
    pub fn new(now: TimestampMillis) -> Self {
        Self::from_position(Chess::default(), now)
    }

    fn from_position(position: Chess, now: TimestampMillis) -> Self {
        let mut repetitions = HashMap::new();
        repetitions.insert(epd(&position), 1);
        Match {
            position,
            moves: Vec::new(),
            last_move: None,
            repetitions,
            clock: Clock {
                white_ms: TIME_PER_SIDE_MS,
                black_ms: TIME_PER_SIDE_MS,
                since: now,
            },
            draw_offer: None,
            ending: None,
        }
    }

    /// Whose move it is. Once the game's over, whose move it would have been.
    pub fn turn(&self) -> Color {
        self.position.turn()
    }

    pub fn ending(&self) -> Option<Ending> {
        self.ending
    }

    pub fn is_over(&self) -> bool {
        self.ending.is_some()
    }

    /// How long the side has left, as its clock runs
    pub fn time_left(&self, color: Color, now: TimestampMillis) -> u64 {
        let left = self.clock.left(color);
        if self.is_over() || color != self.turn() {
            left
        } else {
            left.saturating_sub(now.saturating_sub(self.clock.since))
        }
    }

    /// When the side to move's flag falls, unless it moves first
    pub fn deadline(&self) -> Option<TimestampMillis> {
        (!self.is_over()).then(|| self.clock.since + self.clock.left(self.turn()))
    }

    /// Plays the side's move, given as UCI: the squares it's from and to, eg. "e2e4", "e1g1" to
    /// castle, with the piece to promote to on the end, eg. "e7e8q". The side's clock stops and
    /// the other's starts, an offer of a draw by the other side lapses, and the game ends if the
    /// move ends it.
    pub fn play(&mut self, color: Color, uci: &str, now: TimestampMillis) -> Result<(), String> {
        if self.is_over() {
            return Err("The game has finished".to_string());
        }
        if color != self.turn() {
            return Err("It's not your turn".to_string());
        }
        if self.time_left(color, now) == 0 {
            return Err("Your time ran out".to_string());
        }
        // `to_move` only gives a legal move
        let m = uci
            .parse::<UciMove>()
            .map_err(|_| format!("'{uci}' isn't a move"))?
            .to_move(&self.position)
            .map_err(|_| format!("{uci} isn't a legal move"))?;

        let from = m
            .from()
            .map(|square| square.to_string())
            .unwrap_or_default();
        let to = m.to().to_string();
        let san = SanPlus::from_move_and_play_unchecked(&mut self.position, m);
        self.moves.push(san.to_string());
        self.last_move = Some(LastMove { from, to });

        let elapsed = now.saturating_sub(self.clock.since);
        let left = self.clock.left_mut(color);
        *left = left.saturating_sub(elapsed);
        self.clock.since = now;

        // Moving declines the other side's offer
        if self.draw_offer == Some(color.other()) {
            self.draw_offer = None;
        }

        let repetitions = self.repetitions.entry(epd(&self.position)).or_insert(0);
        *repetitions += 1;
        let repetitions = *repetitions;

        let ending = if self.position.is_checkmate() {
            Some(Ending::Checkmate(color))
        } else if self.position.is_stalemate() {
            Some(Ending::Stalemate)
        } else if self.position.is_insufficient_material() {
            Some(Ending::InsufficientMaterial)
        } else if repetitions >= 3 {
            Some(Ending::Repetition)
        } else if self.position.halfmoves() >= 100 {
            Some(Ending::FiftyMoves)
        } else {
            None
        };
        if let Some(ending) = ending {
            self.end(ending, now);
        }
        Ok(())
    }

    /// Ends the game if the side to move's flag has fallen, giving whether it did. The other side
    /// wins, unless it hasn't the material to mate with, when it's a draw.
    pub fn flag(&mut self, now: TimestampMillis) -> bool {
        if self.is_over() {
            return false;
        }
        let turn = self.turn();
        if self.time_left(turn, now) > 0 {
            return false;
        }
        let ending = if self.position.has_insufficient_material(turn.other()) {
            Ending::TimeoutDraw
        } else {
            Ending::Timeout(turn.other())
        };
        self.end(ending, now);
        true
    }

    /// The side gives up, whoever's turn it is
    pub fn resign(&mut self, color: Color, now: TimestampMillis) -> Result<(), String> {
        if self.is_over() {
            return Err("The game has finished".to_string());
        }
        self.end(Ending::Resignation(color.other()), now);
        Ok(())
    }

    /// The side offers a draw, which stands until the other side moves, or accepts the other
    /// side's offer if it stands, which ends the game
    pub fn offer_draw(&mut self, color: Color, now: TimestampMillis) -> Result<(), String> {
        if self.is_over() {
            return Err("The game has finished".to_string());
        }
        if self.draw_offer == Some(color.other()) {
            self.end(Ending::Agreement, now);
        } else {
            self.draw_offer = Some(color);
        }
        Ok(())
    }

    // Stops the clocks and records how the game ended
    fn end(&mut self, ending: Ending, now: TimestampMillis) {
        let turn = self.turn();
        *self.clock.left_mut(turn) = self.time_left(turn, now);
        self.clock.since = now;
        self.draw_offer = None;
        self.ending = Some(ending);
    }

    /// The game as the app shows it, with each side's time left at `now`
    pub fn snapshot(&self, now: TimestampMillis) -> Snapshot {
        let legal_moves = if self.is_over() {
            Vec::new()
        } else {
            self.position
                .legal_moves()
                .iter()
                .map(|m| UciMove::from_standard(*m).to_string())
                .collect()
        };
        Snapshot {
            fen: Fen::from_position(&self.position, EnPassantMode::Legal).to_string(),
            turn: side(self.turn()),
            moves: self.moves.clone(),
            last_move: self.last_move.clone(),
            check: self.position.is_check(),
            legal_moves,
            clock: ClockSnapshot {
                at: now,
                white_ms: self.time_left(Color::White, now),
                black_ms: self.time_left(Color::Black, now),
                running: (!self.is_over()).then(|| side(self.turn())),
            },
            draw_offer: self.draw_offer.map(side),
            result: self.ending.map(Ending::describe),
        }
    }
}

/// A game as the app shows it. Nothing's private: both sides and every spectator see the same.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Snapshot {
    pub fen: String,
    pub turn: &'static str,
    pub moves: Vec<String>,
    pub last_move: Option<LastMove>,
    /// Whether the side to move is in check
    pub check: bool,
    /// The side to move's moves, as UCI, so the app can show them, or none once the game's over
    pub legal_moves: Vec<String>,
    pub clock: ClockSnapshot,
    pub draw_offer: Option<&'static str>,
    pub result: Option<String>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct LastMove {
    pub from: String,
    pub to: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct ClockSnapshot {
    /// When the snapshot was taken, by the bot's clock. The app counts the running side's clock down
    /// from it, since a state can reach the app long after it was published: the service sends the
    /// latest state to whoever opens the game.
    pub at: TimestampMillis,
    /// What each side has left, at the time of the snapshot
    pub white_ms: u64,
    pub black_ms: u64,
    /// Whose clock is running, if the game's on
    pub running: Option<&'static str>,
}

/// A side as the state names it
pub fn side(color: Color) -> &'static str {
    color.fold_wb("white", "black")
}

fn side_name(color: Color) -> &'static str {
    color.fold_wb("White", "Black")
}

// The position without its move counters, so that the same position is the same key
fn epd(position: &Chess) -> String {
    Epd::from_position(position, EnPassantMode::Legal).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use shakmaty::CastlingMode;

    const START: TimestampMillis = 1_000_000;

    fn from_fen(fen: &str) -> Match {
        let position = fen
            .parse::<Fen>()
            .unwrap()
            .into_position::<Chess>(CastlingMode::Standard)
            .unwrap();
        Match::from_position(position, START)
    }

    // Plays each move a second after the last
    fn play_all(game: &mut Match, moves: &[&str]) -> TimestampMillis {
        let mut now = START;
        for (i, uci) in moves.iter().enumerate() {
            now += 1000;
            let color = if i % 2 == 0 {
                Color::White
            } else {
                Color::Black
            };
            game.play(color, uci, now)
                .unwrap_or_else(|e| panic!("{uci}: {e}"));
        }
        now
    }

    #[test]
    fn a_game_is_recorded_in_algebraic_notation_and_ends_in_checkmate() {
        let mut game = Match::new(START);

        let now = play_all(&mut game, &["f2f3", "e7e5", "g2g4", "d8h4"]);

        assert_eq!(game.ending(), Some(Ending::Checkmate(Color::Black)));
        let snapshot = game.snapshot(now);
        assert_eq!(snapshot.moves, ["f3", "e5", "g4", "Qh4#"]);
        assert_eq!(snapshot.result.as_deref(), Some("Black won by checkmate"));
        assert!(snapshot.check);
        assert!(snapshot.legal_moves.is_empty());
        assert_eq!(snapshot.clock.running, None);
        assert_eq!(
            snapshot.last_move,
            Some(LastMove {
                from: "d8".to_string(),
                to: "h4".to_string()
            })
        );
        assert_eq!(
            snapshot.fen,
            "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
        );
        assert_eq!(
            game.play(Color::White, "e1f2", now + 1000),
            Err("The game has finished".to_string())
        );
        assert_eq!(game.deadline(), None);
    }

    #[test]
    fn castling_and_promotion_are_played_from_their_squares() {
        let mut game = from_fen("4k2r/P7/8/8/8/8/8/R3K2R w KQk - 0 1");
        assert!(
            game.snapshot(START)
                .legal_moves
                .contains(&"e1c1".to_string())
        );
        assert!(
            game.snapshot(START)
                .legal_moves
                .contains(&"a7a8q".to_string())
        );

        play_all(&mut game, &["e1c1", "e8g8", "a7a8q"]);

        assert_eq!(game.snapshot(START).moves, ["O-O-O", "O-O", "a8=Q"]);
        assert_eq!(
            game.snapshot(START).fen,
            "Q4rk1/8/8/8/8/8/8/2KR3R b - - 0 2"
        );
    }

    #[test]
    fn a_move_must_be_legal_and_in_turn() {
        let mut game = Match::new(START);

        assert_eq!(
            game.play(Color::Black, "e7e5", START),
            Err("It's not your turn".to_string())
        );
        assert_eq!(
            game.play(Color::White, "e2e5", START),
            Err("e2e5 isn't a legal move".to_string())
        );
        assert_eq!(
            game.play(Color::White, "e7e5", START),
            Err("e7e5 isn't a legal move".to_string())
        );
        assert_eq!(
            game.play(Color::White, "hello", START),
            Err("'hello' isn't a move".to_string())
        );
        assert_eq!(game.snapshot(START).moves, Vec::<String>::new());
        assert_eq!(game.play(Color::White, "e2e4", START), Ok(()));
    }

    #[test]
    fn each_side_s_clock_runs_while_it_is_to_move() {
        let mut game = Match::new(START);
        assert_eq!(game.deadline(), Some(START + TIME_PER_SIDE_MS));
        assert_eq!(
            game.time_left(Color::White, START + 4000),
            TIME_PER_SIDE_MS - 4000
        );
        assert_eq!(game.time_left(Color::Black, START + 4000), TIME_PER_SIDE_MS);

        game.play(Color::White, "e2e4", START + 5000).unwrap();

        let snapshot = game.snapshot(START + 7000);
        assert_eq!(snapshot.clock.white_ms, TIME_PER_SIDE_MS - 5000);
        assert_eq!(snapshot.clock.black_ms, TIME_PER_SIDE_MS - 2000);
        assert_eq!(snapshot.clock.running, Some("black"));
        assert_eq!(game.deadline(), Some(START + 5000 + TIME_PER_SIDE_MS));
    }

    #[test]
    fn a_flag_falls_when_the_side_to_move_runs_out_of_time() {
        let mut game = Match::new(START);
        game.play(Color::White, "e2e4", START + 1000).unwrap();
        let deadline = game.deadline().unwrap();

        assert!(!game.flag(deadline - 1));
        assert!(!game.is_over());
        assert_eq!(
            game.play(Color::Black, "e7e5", deadline),
            Err("Your time ran out".to_string())
        );
        assert!(game.flag(deadline + 500));

        assert_eq!(game.ending(), Some(Ending::Timeout(Color::White)));
        let snapshot = game.snapshot(deadline + 60_000);
        assert_eq!(snapshot.result.as_deref(), Some("White won on time"));
        assert_eq!(snapshot.clock.black_ms, 0);
        // White's clock stopped when it moved
        assert_eq!(snapshot.clock.white_ms, TIME_PER_SIDE_MS - 1000);
        assert!(!game.flag(deadline + 1000));
    }

    #[test]
    fn a_flag_against_a_bare_king_is_a_draw() {
        let mut game = from_fen("k6r/8/8/8/8/8/8/K7 b - - 0 1");

        assert!(game.flag(START + TIME_PER_SIDE_MS));

        assert_eq!(game.ending(), Some(Ending::TimeoutDraw));
    }

    #[test]
    fn the_game_is_drawn_by_repetition_stalemate_material_and_the_fifty_move_rule() {
        let mut game = Match::new(START);
        play_all(
            &mut game,
            &[
                "g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8",
            ],
        );
        assert_eq!(game.ending(), Some(Ending::Repetition));

        let mut game = from_fen("k7/8/1Q6/8/8/8/8/K7 w - - 0 1");
        play_all(&mut game, &["b6b7"]);
        assert_eq!(game.ending(), None);
        let mut game = from_fen("k7/8/1Q6/8/8/8/8/K7 w - - 0 1");
        play_all(&mut game, &["b6c7"]);
        assert_eq!(game.ending(), Some(Ending::Stalemate));

        // The knight takes the rook, leaving no one able to mate
        let mut game = from_fen("k7/8/1n6/3R4/8/8/8/K7 w - - 0 1");
        play_all(&mut game, &["a1a2", "b6d5"]);
        assert_eq!(game.ending(), Some(Ending::InsufficientMaterial));

        let mut game = from_fen("k7/8/8/8/8/8/8/K6R w - - 99 80");
        play_all(&mut game, &["h1h2"]);
        assert_eq!(game.ending(), Some(Ending::FiftyMoves));
        assert_eq!(
            game.snapshot(START).result.as_deref(),
            Some("Draw by the fifty-move rule")
        );
    }

    #[test]
    fn a_side_can_resign_whoever_is_to_move() {
        let mut game = Match::new(START);

        assert_eq!(game.resign(Color::Black, START + 1000), Ok(()));

        assert_eq!(game.ending(), Some(Ending::Resignation(Color::White)));
        assert_eq!(
            game.resign(Color::White, START + 2000),
            Err("The game has finished".to_string())
        );
        // The clock stopped when the game ended
        assert_eq!(
            game.snapshot(START + 9000).clock.white_ms,
            TIME_PER_SIDE_MS - 1000
        );
    }

    #[test]
    fn a_draw_offer_stands_until_the_other_side_moves_or_accepts() {
        let mut game = Match::new(START);

        assert_eq!(game.offer_draw(Color::White, START), Ok(()));
        assert_eq!(game.snapshot(START).draw_offer, Some("white"));
        // Offering again changes nothing
        assert_eq!(game.offer_draw(Color::White, START), Ok(()));
        assert_eq!(game.snapshot(START).draw_offer, Some("white"));
        // Moving on with the game declines it
        game.play(Color::White, "e2e4", START + 1000).unwrap();
        assert_eq!(game.snapshot(START).draw_offer, Some("white"));
        game.play(Color::Black, "e7e5", START + 2000).unwrap();
        assert_eq!(game.snapshot(START).draw_offer, None);

        assert_eq!(game.offer_draw(Color::Black, START + 3000), Ok(()));
        assert_eq!(game.snapshot(START).draw_offer, Some("black"));
        assert_eq!(game.offer_draw(Color::White, START + 4000), Ok(()));

        assert_eq!(game.ending(), Some(Ending::Agreement));
        let snapshot = game.snapshot(START + 4000);
        assert_eq!(snapshot.draw_offer, None);
        assert_eq!(snapshot.result.as_deref(), Some("Draw by agreement"));
    }
}
