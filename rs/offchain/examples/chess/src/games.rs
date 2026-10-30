use crate::chess::{Ending, LastMove, Match, Snapshot};
use oc_bots_sdk::types::{MiniAppGame, TimestampMillis, UserId};
use oc_bots_sdk_offchain::mini_app::{GameState, GameUpdate};
use serde::Serialize;
use serde_json::Value;
use shakmaty::Color;
use std::collections::HashMap;
use std::sync::Mutex;

// How long a game is kept once it's over, so a late request is told it's finished rather than
// unknown, and how long one which never started is kept: the service ends those after a day
const KEEP_FINISHED_MS: u64 = 60 * 60 * 1000;
const KEEP_UNSTARTED_MS: u64 = 25 * 60 * 60 * 1000;

/// The most the service takes for how a game ended, serialized
const MAX_END_STATE_BYTES: usize = 16 * 1024;

/// The bot's games, in memory, so they're lost when the bot is restarted: who's joined each, and
/// once it's started, who's White, who's Black and the board. The service names a game by its card.
#[derive(Default)]
pub struct Games {
    games: Mutex<HashMap<MiniAppGame, Game>>,
}

#[derive(Default)]
struct Game {
    /// Who's joined, in order, as the service told the bot. Once the game starts: White, then Black.
    players: Vec<UserId>,
    /// Of the last state sent, which the next must go above. It's taken from the clock, so that
    /// after a restart the bot's states still go above the service's last.
    seq: u64,
    /// When the game last changed
    updated: TimestampMillis,
    play: Option<Play>,
}

struct Play {
    white: UserId,
    black: UserId,
    board: Match,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Open,
    Active,
    Finished,
}

/// What a game looks like after something happened to it: the state for everyone with it open,
/// whose move it is if that's what changed, how it ended if it has, and when the side to move's
/// flag falls
pub struct Change {
    pub state: GameState,
    /// Whose move it is, when the change is to that: the start, or a move. Otherwise the card
    /// keeps what it has, so that a change which arrives late doesn't put back an earlier turn.
    pub waiting_for: Option<Vec<UserId>>,
    pub result: Option<String>,
    /// With the result: the game as it ended, for the card to keep and hand to the app, so anyone
    /// can look at the final position and step through the moves
    pub end_state: Option<Value>,
    pub deadline: Option<TimestampMillis>,
}

impl Change {
    /// The update which tells the service: the state, and whose turn it is, or that the game is
    /// over and how it ended
    pub fn into_update(self, game: MiniAppGame) -> GameUpdate {
        let update = GameUpdate::new(game).with_state(self.state);
        match (self.result, self.waiting_for) {
            (Some(result), _) => {
                let update = update.finished().with_result(result);
                match self.end_state {
                    Some(end_state) => update.with_end_state(end_state),
                    None => update,
                }
            }
            (None, Some(waiting_for)) => update.with_waiting_for(waiting_for),
            (None, None) => update,
        }
    }
}

/// How a game ended, as the card keeps it: the result, who played, the moves, and the position
/// before the first and after each, so an app can step through the game. If the whole game won't
/// fit in what the service takes, only the final position is kept, and `truncated` says so.
#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct EndState {
    /// Of this format, so an app knows what it's reading
    pub version: u32,
    pub result: Option<String>,
    pub white: UserId,
    pub black: UserId,
    /// In standard algebraic notation, as the state's
    pub moves: Vec<String>,
    /// One more than `moves`, the last being the final position, or only the final position if
    /// `truncated`
    pub fens: Vec<String>,
    pub last_move: Option<LastMove>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub truncated: bool,
}

impl EndState {
    /// The end state as JSON, within what the service takes: a very long game keeps only its final
    /// position
    pub fn into_json(mut self) -> Value {
        let serialized = |state: &EndState| {
            serde_json::to_vec(state)
                .expect("The end state serializes")
                .len()
        };
        if serialized(&self) > MAX_END_STATE_BYTES {
            self.fens = self.fens.pop().into_iter().collect();
            self.truncated = true;
        }
        serde_json::to_value(self).expect("The end state serializes")
    }
}

impl Games {
    pub fn posted(&self, game: MiniAppGame, now: TimestampMillis) {
        self.games
            .lock()
            .unwrap()
            .entry(game)
            .or_insert_with(|| Game::new(now));
    }

    /// Takes a player, up to two, until the game starts
    pub fn join(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        now: TimestampMillis,
    ) -> Result<(), String> {
        let mut games = self.games.lock().unwrap();
        let game = games.entry(game).or_insert_with(|| Game::new(now));
        if game.play.is_some() {
            return Err("The game has started".to_string());
        }
        if game.players.contains(&user_id) {
            return Ok(());
        }
        if game.players.len() >= 2 {
            return Err("This game already has two players".to_string());
        }
        game.players.push(user_id);
        game.updated = now;
        Ok(())
    }

    /// The service says the user isn't in the game: before the start, they left, and everyone with
    /// the game open sees who's left; after it, they're a player the service couldn't keep, eg.
    /// one the bot named at the start who hadn't joined through OpenChat, so the game can't go on
    /// and the other side wins. Gives the change, if the game is known and it changed.
    pub fn leave(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        now: TimestampMillis,
    ) -> Option<Change> {
        let mut games = self.games.lock().unwrap();
        let game = games.get_mut(&game)?;
        match &mut game.play {
            None => {
                let before = game.players.len();
                game.players.retain(|player| *player != user_id);
                (game.players.len() < before).then(|| game.lobby_change(now))
            }
            Some(play) => {
                let color = play.color_of(user_id)?;
                play.board.resign(color, now).ok()?;
                Some(game.change(now))
            }
        }
    }

    /// The game as it stands before it starts, so everyone with it open sees who's joined, or
    /// nothing if it's started or unknown
    pub fn lobby(&self, game: MiniAppGame, now: TimestampMillis) -> Option<Change> {
        let mut games = self.games.lock().unwrap();
        let game = games.get_mut(&game)?;
        game.play.is_none().then(|| game.lobby_change(now))
    }

    /// Starts the game, between the two who've joined, with the first to join as White if
    /// `first_is_white`, giving its players, White then Black, and its first state. Asked again
    /// for a game it's started, eg. as the service's first try failed on its side, it gives the
    /// players and the state as they are.
    pub fn start(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        now: TimestampMillis,
        first_is_white: bool,
    ) -> Result<(Vec<UserId>, Change), String> {
        let mut games = self.games.lock().unwrap();
        let game = games.entry(game).or_insert_with(|| Game::new(now));
        if let Some(play) = &game.play {
            if play.color_of(user_id).is_none() {
                return Err("You're not in this game".to_string());
            }
            return Ok((game.players.clone(), game.change(now)));
        }
        // Whoever asks is a player, even if the bot missed their join, eg. as it was restarted
        if !game.players.contains(&user_id) {
            if game.players.len() >= 2 {
                return Err("You're not in this game".to_string());
            }
            game.players.push(user_id);
        }
        let [first, second] = game.players[..] else {
            return Err("Chess needs two players".to_string());
        };
        let (white, black) = if first_is_white {
            (first, second)
        } else {
            (second, first)
        };
        game.players = vec![white, black];
        game.play = Some(Play {
            white,
            black,
            board: Match::new(now),
        });
        Ok((game.players.clone(), game.change(now)))
    }

    /// Plays the user's move, given as UCI, eg. "e2e4", giving the new state, or why it wasn't
    /// played
    pub fn play_move(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        uci: &str,
        now: TimestampMillis,
    ) -> Result<Change, String> {
        self.act(game, user_id, now, |board, color| {
            board.play(color, uci, now)
        })
    }

    pub fn resign(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        now: TimestampMillis,
    ) -> Result<Change, String> {
        self.act(game, user_id, now, |board, color| board.resign(color, now))
    }

    /// Offers the other player a draw, or accepts theirs if it stands. An offer doesn't change
    /// whose move it is, so the change doesn't say.
    pub fn offer_draw(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        now: TimestampMillis,
    ) -> Result<Change, String> {
        let mut change = self.act(game, user_id, now, |board, color| {
            board.offer_draw(color, now)
        })?;
        if change.result.is_none() {
            change.waiting_for = None;
        }
        Ok(change)
    }

    /// Ends the game on time if the side to move's flag has fallen, giving the finished state if
    /// it did
    pub fn flag(&self, game: MiniAppGame, now: TimestampMillis) -> Option<Change> {
        let mut games = self.games.lock().unwrap();
        let game = games.get_mut(&game)?;
        let play = game.play.as_mut()?;
        play.board.flag(now).then(|| game.change(now))
    }

    /// The game as it stands, as a new change, eg. to send again after the service didn't take
    /// one, or nothing if the game's unknown
    pub fn latest(&self, game: MiniAppGame, now: TimestampMillis) -> Option<Change> {
        let mut games = self.games.lock().unwrap();
        let game = games.get_mut(&game)?;
        Some(if game.play.is_some() {
            game.change(now)
        } else {
            game.lobby_change(now)
        })
    }

    /// Forgets games which are long over, or never started
    pub fn prune(&self, now: TimestampMillis) {
        self.games.lock().unwrap().retain(|_, game| {
            let keep_for = match game.status() {
                Status::Finished => KEEP_FINISHED_MS,
                Status::Open => KEEP_UNSTARTED_MS,
                Status::Active => return true,
            };
            now <= game.updated + keep_for
        });
    }

    // Something the user does to the board as the side they play
    fn act(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        now: TimestampMillis,
        action: impl FnOnce(&mut Match, Color) -> Result<(), String>,
    ) -> Result<Change, String> {
        let mut games = self.games.lock().unwrap();
        let game = games
            .get_mut(&game)
            .ok_or("The bot doesn't know this game")?;
        let Some(play) = &mut game.play else {
            return Err(if game.players.contains(&user_id) {
                "Start the game first".to_string()
            } else {
                "You're not playing".to_string()
            });
        };
        // The service's rules say to check the bot's own player list on every request, as a
        // player token outlives a removal
        let color = play.color_of(user_id).ok_or("You're not playing")?;
        action(&mut play.board, color)?;
        Ok(game.change(now))
    }
}

impl Game {
    fn new(now: TimestampMillis) -> Self {
        Game {
            updated: now,
            ..Game::default()
        }
    }

    fn status(&self) -> Status {
        match &self.play {
            None => Status::Open,
            Some(play) if play.board.is_over() => Status::Finished,
            Some(_) => Status::Active,
        }
    }

    // The game after something happened to it, as the next state, saying whose move it is
    fn change(&mut self, now: TimestampMillis) -> Change {
        self.seq = (self.seq + 1).max(now);
        self.updated = now;
        let play = self.play.as_ref();
        Change {
            state: GameState {
                seq: self.seq,
                shared: serde_json::to_value(self.shared(now)).expect("The state serializes"),
                private: HashMap::new(),
            },
            waiting_for: play
                .filter(|play| !play.board.is_over())
                .map(|play| vec![play.player(play.board.turn())]),
            result: play
                .and_then(|play| play.board.ending())
                .map(Ending::describe),
            end_state: play
                .filter(|play| play.board.is_over())
                .map(|play| play.end_state(now).into_json()),
            deadline: play.and_then(|play| play.board.deadline()),
        }
    }

    // The game before it starts, as the next state: the card has no one to wait for
    fn lobby_change(&mut self, now: TimestampMillis) -> Change {
        let mut change = self.change(now);
        change.waiting_for = None;
        change
    }

    fn shared(&self, now: TimestampMillis) -> Shared<'_> {
        let play = self.play.as_ref();
        Shared {
            status: self.status(),
            players: &self.players,
            white: play.map(|play| play.white),
            black: play.map(|play| play.black),
            board: play.map(|play| play.board.snapshot(now)),
        }
    }
}

impl Play {
    fn player(&self, color: Color) -> UserId {
        color.fold_wb(self.white, self.black)
    }

    fn color_of(&self, user_id: UserId) -> Option<Color> {
        if user_id == self.white {
            Some(Color::White)
        } else if user_id == self.black {
            Some(Color::Black)
        } else {
            None
        }
    }

    // The game as it ended, for the card to keep
    fn end_state(&self, now: TimestampMillis) -> EndState {
        let snapshot = self.board.snapshot(now);
        EndState {
            version: 1,
            result: snapshot.result,
            white: self.white,
            black: self.black,
            moves: snapshot.moves,
            fens: self.board.fens().to_vec(),
            last_move: snapshot.last_move,
            truncated: false,
        }
    }
}

// The state everyone with the game open sees: who's in it, and the board once it's started
#[derive(Serialize)]
struct Shared<'a> {
    status: Status,
    players: &'a [UserId],
    white: Option<UserId>,
    black: Option<UserId>,
    #[serde(flatten)]
    board: Option<Snapshot>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chess::TIME_PER_SIDE_MS;
    use ic_principal::Principal;
    use oc_bots_sdk::types::Chat;
    use oc_bots_sdk_offchain::mini_app::GameStatus;
    use serde_json::json;

    const START: TimestampMillis = 1_000_000;

    fn user(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    fn game(message_id: u64) -> MiniAppGame {
        MiniAppGame {
            chat: Chat::Group(user(200)),
            thread: None,
            message_id: message_id.into(),
        }
    }

    // A game between users 1 (White) and 2 (Black), started at START
    fn started() -> Games {
        let games = Games::default();
        games.posted(game(1), START - 2000);
        games.join(game(1), user(1), START - 2000).unwrap();
        games.join(game(1), user(2), START - 1000).unwrap();
        games.start(game(1), user(1), START, true).unwrap();
        games
    }

    #[test]
    fn two_players_join_and_the_coin_says_who_is_white() {
        let games = Games::default();
        games.posted(game(1), START);
        assert_eq!(games.join(game(1), user(1), START), Ok(()));
        assert_eq!(games.join(game(1), user(1), START), Ok(()));
        assert_eq!(games.join(game(1), user(3), START), Ok(()));
        assert!(games.leave(game(1), user(3), START).is_some());
        assert!(games.leave(game(1), user(3), START).is_none());
        assert_eq!(games.join(game(1), user(2), START), Ok(()));
        assert_eq!(
            games.join(game(1), user(3), START),
            Err("This game already has two players".to_string())
        );
        assert_eq!(
            games.play_move(game(1), user(1), "e2e4", START).err(),
            Some("Start the game first".to_string())
        );
        assert_eq!(
            games.play_move(game(1), user(3), "e2e4", START).err(),
            Some("You're not playing".to_string())
        );

        let (players, change) = games.start(game(1), user(2), START, false).unwrap();

        assert_eq!(players, [user(2), user(1)]);
        assert_eq!(change.waiting_for, Some(vec![user(2)]));
        assert_eq!(change.result, None);
        assert_eq!(change.deadline, Some(START + TIME_PER_SIDE_MS));
        assert!(change.state.private.is_empty());
        let shared = &change.state.shared;
        assert_eq!(shared["status"], "Active");
        assert_eq!(shared["players"], json!([user(2), user(1)]));
        assert_eq!(shared["white"], json!(user(2)));
        assert_eq!(shared["black"], json!(user(1)));
        assert_eq!(shared["turn"], "white");
        assert_eq!(shared["clock"]["running"], "white");
        assert_eq!(shared["clock"]["white_ms"], TIME_PER_SIDE_MS);
        assert_eq!(shared["legal_moves"].as_array().unwrap().len(), 20);
        assert_eq!(shared["result"], json!(null));

        // Once started, no one else gets in
        assert_eq!(
            games.join(game(1), user(3), START),
            Err("The game has started".to_string())
        );
        assert!(games.play_move(game(1), user(2), "e2e4", START).is_ok());
    }

    // The service asks again when its first try at starting fails on its side
    #[test]
    fn a_started_game_is_started_again_as_it_is() {
        let games = started();
        games
            .play_move(game(1), user(1), "e2e4", START + 1000)
            .unwrap();

        let (players, change) = games.start(game(1), user(2), START + 2000, false).unwrap();

        assert_eq!(players, [user(1), user(2)]);
        assert_eq!(change.waiting_for, Some(vec![user(2)]));
        assert_eq!(change.state.shared["moves"], json!(["e4"]));
        assert_eq!(
            games.start(game(1), user(3), START + 2000, true).err(),
            Some("You're not in this game".to_string())
        );
    }

    #[test]
    fn a_game_needs_two_players_to_start() {
        let games = Games::default();
        games.posted(game(1), START);

        assert_eq!(
            games.start(game(1), user(1), START, true).err(),
            Some("Chess needs two players".to_string())
        );
        // The starter counts as joined, so a second joiner completes the game
        games.join(game(1), user(2), START).unwrap();
        let (players, _) = games.start(game(1), user(1), START, true).unwrap();
        assert_eq!(players, [user(1), user(2)]);

        // A third person can't start someone else's game
        let games = Games::default();
        games.join(game(1), user(1), START).unwrap();
        games.join(game(1), user(2), START).unwrap();
        assert_eq!(
            games.start(game(1), user(3), START, true).err(),
            Some("You're not in this game".to_string())
        );
    }

    #[test]
    fn moves_are_played_as_the_side_each_user_has() {
        let games = started();

        assert_eq!(
            games
                .play_move(game(1), user(2), "e7e5", START + 1000)
                .err(),
            Some("It's not your turn".to_string())
        );
        let change = games
            .play_move(game(1), user(1), "e2e4", START + 1000)
            .unwrap();
        assert_eq!(change.waiting_for, Some(vec![user(2)]));
        assert_eq!(change.deadline, Some(START + 1000 + TIME_PER_SIDE_MS));
        assert_eq!(change.state.seq, START + 1000);
        assert_eq!(change.state.shared["moves"], json!(["e4"]));
        assert_eq!(change.state.shared["turn"], "black");

        let change = games
            .play_move(game(1), user(2), "e7e5", START + 3000)
            .unwrap();
        assert_eq!(change.waiting_for, Some(vec![user(1)]));
        assert_eq!(
            change.state.shared["clock"],
            json!({ "at": START + 3000, "white_ms": TIME_PER_SIDE_MS - 1000, "black_ms": TIME_PER_SIDE_MS - 2000, "running": "white" })
        );

        // The update tells the service whose turn it is
        let update = change.into_update(game(1));
        assert_eq!(update.waiting_for, Some(vec![user(1)]));
        assert_eq!(update.status, None);
        assert_eq!(update.result, None);
        assert_eq!(update.state.unwrap().seq, START + 3000);

        assert_eq!(
            games
                .play_move(game(1), user(3), "a2a3", START + 4000)
                .err(),
            Some("You're not playing".to_string())
        );
        assert_eq!(
            games
                .play_move(game(2), user(1), "a2a3", START + 4000)
                .err(),
            Some("The bot doesn't know this game".to_string())
        );
    }

    // Seqs come from the clock, so after a restart they still go above the service's last, and
    // they always go up
    #[test]
    fn seqs_follow_the_clock_and_always_go_up() {
        let games = started();

        let a = games.play_move(game(1), user(1), "e2e4", START).unwrap();
        let b = games.play_move(game(1), user(2), "e7e5", START).unwrap();
        let c = games
            .play_move(game(1), user(1), "g1f3", START + 5)
            .unwrap();

        assert_eq!(a.state.seq, START + 1);
        assert_eq!(b.state.seq, START + 2);
        assert_eq!(c.state.seq, START + 5);
    }

    #[test]
    fn a_finished_game_s_update_carries_its_result() {
        let games = started();
        games.play_move(game(1), user(1), "f2f3", START).unwrap();
        games.play_move(game(1), user(2), "e7e5", START).unwrap();
        games.play_move(game(1), user(1), "g2g4", START).unwrap();

        let change = games
            .play_move(game(1), user(2), "d8h4", START + 1000)
            .unwrap();

        assert_eq!(change.waiting_for, None);
        assert_eq!(change.result.as_deref(), Some("Black won by checkmate"));
        assert_eq!(change.deadline, None);
        assert_eq!(change.state.shared["status"], "Finished");
        let final_fen = change.state.shared["fen"].clone();
        let update = change.into_update(game(1));
        assert_eq!(update.status, Some(GameStatus::Finished));
        assert_eq!(update.result.as_deref(), Some("Black won by checkmate"));
        assert_eq!(update.waiting_for, None);
        // The card keeps the whole game: the position before each move and after the last
        let end_state = update.end_state.unwrap();
        assert_eq!(end_state["version"], 1);
        assert_eq!(end_state["result"], "Black won by checkmate");
        assert_eq!(end_state["white"], json!(user(1)));
        assert_eq!(end_state["black"], json!(user(2)));
        assert_eq!(end_state["moves"], json!(["f3", "e5", "g4", "Qh4#"]));
        assert_eq!(end_state["last_move"], json!({ "from": "d8", "to": "h4" }));
        assert_eq!(end_state.get("truncated"), None);
        let fens = end_state["fens"].as_array().unwrap();
        assert_eq!(fens.len(), 5);
        assert_eq!(
            fens[0],
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        );
        assert_eq!(fens[4], final_fen);
        assert_eq!(
            games
                .play_move(game(1), user(1), "e1f2", START + 2000)
                .err(),
            Some("The game has finished".to_string())
        );
    }

    // An end state is at most 16 KB, so a very long game keeps only its final position
    #[test]
    fn a_very_long_game_s_end_state_keeps_only_the_final_position() {
        let start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1".to_string();
        let end_state = |plies: usize| EndState {
            version: 1,
            result: Some("Draw by agreement".to_string()),
            white: user(1),
            black: user(2),
            moves: (0..plies)
                .map(|ply| if ply % 2 == 0 { "Nf3" } else { "Nf6" }.to_string())
                .collect(),
            fens: (0..=plies).map(|ply| format!("{start} {ply}")).collect(),
            last_move: Some(LastMove {
                from: "g8".to_string(),
                to: "f6".to_string(),
            }),
            truncated: false,
        };

        let short = end_state(40).into_json();
        assert_eq!(short["fens"].as_array().unwrap().len(), 41);
        assert_eq!(short.get("truncated"), None);
        assert!(serde_json::to_vec(&short).unwrap().len() <= MAX_END_STATE_BYTES);

        let long = end_state(600).into_json();
        assert_eq!(long["truncated"], true);
        assert_eq!(long["fens"], json!([format!("{start} 600")]));
        assert_eq!(long["moves"].as_array().unwrap().len(), 600);
        assert_eq!(long["result"], "Draw by agreement");
        assert!(serde_json::to_vec(&long).unwrap().len() <= MAX_END_STATE_BYTES);
    }

    #[test]
    fn the_flag_falls_for_whoever_is_to_move() {
        let games = started();
        games
            .play_move(game(1), user(1), "e2e4", START + 1000)
            .unwrap();
        let deadline = START + 1000 + TIME_PER_SIDE_MS;

        assert!(games.flag(game(1), deadline - 1).is_none());
        assert!(games.flag(game(2), deadline).is_none());
        let change = games.flag(game(1), deadline).unwrap();

        assert_eq!(change.result.as_deref(), Some("White won on time"));
        assert_eq!(change.state.shared["clock"]["black_ms"], 0);
        assert!(games.flag(game(1), deadline + 1).is_none());
    }

    #[test]
    fn a_player_can_resign_or_agree_a_draw() {
        let games = started();
        let change = games.offer_draw(game(1), user(2), START).unwrap();
        assert_eq!(change.state.shared["draw_offer"], "black");
        assert_eq!(change.result, None);
        // An offer doesn't change whose move it is, so the card isn't told
        assert_eq!(change.waiting_for, None);
        assert_eq!(change.into_update(game(1)).waiting_for, None);
        let change = games.offer_draw(game(1), user(1), START).unwrap();
        assert_eq!(change.result.as_deref(), Some("Draw by agreement"));
        assert_eq!(
            games.resign(game(1), user(1), START).err(),
            Some("The game has finished".to_string())
        );

        let games = started();
        let change = games.resign(game(1), user(1), START + 1000).unwrap();
        assert_eq!(change.result.as_deref(), Some("Black won by resignation"));
        assert_eq!(
            games.offer_draw(game(1), user(2), START).err(),
            Some("The game has finished".to_string())
        );
        assert_eq!(
            games.resign(game(1), user(3), START).err(),
            Some("You're not playing".to_string())
        );
    }

    #[test]
    fn an_open_game_s_state_lists_who_has_joined() {
        let games = Games::default();
        assert!(games.lobby(game(1), START).is_none());
        games.join(game(1), user(1), START).unwrap();
        let change = games.lobby(game(1), START).unwrap();

        assert_eq!(
            change.state.shared,
            json!({ "status": "Open", "players": [user(1)], "white": null, "black": null })
        );
        assert_eq!(change.state.seq, START);
        assert_eq!(change.waiting_for, None);
        assert_eq!(change.result, None);
        assert_eq!(change.deadline, None);
        // The update carries only the state
        let update = change.into_update(game(1));
        assert_eq!(update.status, None);
        assert_eq!(update.waiting_for, None);

        games.join(game(1), user(2), START).unwrap();
        games.start(game(1), user(1), START, true).unwrap();
        assert!(games.lobby(game(1), START).is_none());
    }

    // The service tells the bot a player isn't in a started game after all
    #[test]
    fn a_player_who_leaves_a_started_game_loses_it() {
        let games = started();

        assert!(games.leave(game(1), user(3), START + 1000).is_none());
        let change = games.leave(game(1), user(2), START + 1000).unwrap();

        assert_eq!(change.result.as_deref(), Some("White won by resignation"));
        assert!(games.leave(game(1), user(1), START + 2000).is_none());
    }

    #[test]
    fn the_latest_state_can_be_sent_again() {
        let games = started();
        games.play_move(game(1), user(1), "e2e4", START).unwrap();

        let change = games.latest(game(1), START + 1000).unwrap();

        assert_eq!(change.state.seq, START + 1000);
        assert_eq!(change.waiting_for, Some(vec![user(2)]));
        assert_eq!(change.state.shared["moves"], json!(["e4"]));
        assert!(games.latest(game(2), START).is_none());

        let games = Games::default();
        games.join(game(1), user(1), START).unwrap();
        let change = games.latest(game(1), START).unwrap();
        assert_eq!(change.waiting_for, None);
        assert_eq!(change.state.shared["status"], "Open");
    }

    #[test]
    fn old_games_are_forgotten() {
        let games = Games::default();
        games.posted(game(1), START);
        games.join(game(2), user(1), START).unwrap();
        games.join(game(2), user(2), START).unwrap();
        games.start(game(2), user(1), START, true).unwrap();
        games.join(game(3), user(1), START).unwrap();
        games.join(game(3), user(2), START).unwrap();
        games.start(game(3), user(1), START, true).unwrap();
        games.resign(game(3), user(1), START).unwrap();

        // The finished one is kept an hour, the open one a day, and the active one until it ends
        games.prune(START + KEEP_FINISHED_MS);
        assert!(games.latest(game(3), START).is_some());
        games.prune(START + KEEP_FINISHED_MS + 1);
        assert!(games.latest(game(3), START).is_none());
        assert!(games.latest(game(1), START).is_some());
        games.prune(START + KEEP_UNSTARTED_MS + 1);
        assert!(games.latest(game(1), START).is_none());
        assert!(games.latest(game(2), START).is_some());
    }
}
