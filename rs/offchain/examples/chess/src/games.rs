use crate::chess::{DrawOffer, Ending, Match, Snapshot};
use oc_bots_sdk::types::{MiniAppGame, TimestampMillis, UserId};
use oc_bots_sdk_offchain::mini_app::{GameState, GameUpdate};
use serde::Serialize;
use shakmaty::Color;
use std::collections::HashMap;
use std::sync::Mutex;

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
    /// Of the last state sent, which the next must go above
    seq: u64,
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
/// whose move it is, how it ended if it has, and when the side to move's flag falls
pub struct Change {
    pub state: GameState,
    pub waiting_for: Vec<UserId>,
    pub result: Option<String>,
    pub deadline: Option<TimestampMillis>,
}

impl Change {
    /// The update which tells the service: the state, and whose turn it is, or that the game is
    /// over and how it ended
    pub fn into_update(self, game: MiniAppGame) -> GameUpdate {
        let update = GameUpdate::new(game).with_state(self.state);
        match self.result {
            Some(result) => update.finished().with_result(result),
            None => update.with_waiting_for(self.waiting_for),
        }
    }
}

impl Games {
    pub fn posted(&self, game: MiniAppGame) {
        self.games.lock().unwrap().entry(game).or_default();
    }

    /// Takes a player, up to two, until the game starts
    pub fn join(&self, game: MiniAppGame, user_id: UserId) -> Result<(), String> {
        let mut games = self.games.lock().unwrap();
        let game = games.entry(game).or_default();
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
        Ok(())
    }

    /// Before the game starts, a player can leave. After, they resign.
    pub fn leave(&self, game: MiniAppGame, user_id: UserId) {
        if let Some(game) = self.games.lock().unwrap().get_mut(&game)
            && game.play.is_none()
        {
            game.players.retain(|player| *player != user_id);
        }
    }

    /// Starts the game, between the two who've joined, with the first to join as White if
    /// `first_is_white`, giving its players, White then Black, and its first state
    pub fn start(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        now: TimestampMillis,
        first_is_white: bool,
    ) -> Result<(Vec<UserId>, Change), String> {
        let mut games = self.games.lock().unwrap();
        let game = games.entry(game).or_default();
        if game.play.is_some() {
            return Err("The game has started".to_string());
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

    /// Offers the other player a draw, or accepts theirs if it stands
    pub fn offer_draw(
        &self,
        game: MiniAppGame,
        user_id: UserId,
        now: TimestampMillis,
    ) -> Result<(DrawOffer, Change), String> {
        let mut games = self.games.lock().unwrap();
        let (game, color) = playing(&mut games, game, user_id)?;
        let offer = game.play.as_mut().unwrap().board.offer_draw(color, now)?;
        Ok((offer, game.change(now)))
    }

    /// Ends the game on time if the side to move's flag has fallen, giving the finished state if
    /// it did
    pub fn flag(&self, game: MiniAppGame, now: TimestampMillis) -> Option<Change> {
        let mut games = self.games.lock().unwrap();
        let game = games.get_mut(&game)?;
        let play = game.play.as_mut()?;
        play.board.flag(now).then(|| game.change(now))
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
        let (game, color) = playing(&mut games, game, user_id)?;
        action(&mut game.play.as_mut().unwrap().board, color)?;
        Ok(game.change(now))
    }
}

// The game, if it's started and the user plays in it, and the side they play. The service's rules
// say to check the bot's own player list on every request, as a player token outlives a removal.
fn playing(
    games: &mut HashMap<MiniAppGame, Game>,
    game: MiniAppGame,
    user_id: UserId,
) -> Result<(&mut Game, Color), String> {
    let game = games
        .get_mut(&game)
        .ok_or("The bot doesn't know this game")?;
    let Some(play) = &game.play else {
        return Err(if game.players.contains(&user_id) {
            "Start the game first".to_string()
        } else {
            "You're not playing".to_string()
        });
    };
    let color = play.color_of(user_id).ok_or("You're not playing")?;
    Ok((game, color))
}

impl Game {
    fn status(&self) -> Status {
        match &self.play {
            None => Status::Open,
            Some(play) if play.board.is_over() => Status::Finished,
            Some(_) => Status::Active,
        }
    }

    // The game after something happened to it, as the next state
    fn change(&mut self, now: TimestampMillis) -> Change {
        self.seq += 1;
        let play = self.play.as_ref();
        Change {
            state: GameState {
                seq: self.seq,
                shared: serde_json::to_value(self.shared(now)).expect("The state serializes"),
                private: HashMap::new(),
            },
            waiting_for: play
                .filter(|play| !play.board.is_over())
                .map(|play| vec![play.player(play.board.turn())])
                .unwrap_or_default(),
            result: play
                .and_then(|play| play.board.ending())
                .map(Ending::describe),
            deadline: play.and_then(|play| play.board.deadline()),
        }
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
        games.posted(game(1));
        games.join(game(1), user(1)).unwrap();
        games.join(game(1), user(2)).unwrap();
        games.start(game(1), user(1), START, true).unwrap();
        games
    }

    #[test]
    fn two_players_join_and_the_coin_says_who_is_white() {
        let games = Games::default();
        games.posted(game(1));
        assert_eq!(games.join(game(1), user(1)), Ok(()));
        assert_eq!(games.join(game(1), user(1)), Ok(()));
        assert_eq!(games.join(game(1), user(3)), Ok(()));
        games.leave(game(1), user(3));
        assert_eq!(games.join(game(1), user(2)), Ok(()));
        assert_eq!(
            games.join(game(1), user(3)),
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
        assert_eq!(change.waiting_for, [user(2)]);
        assert_eq!(change.result, None);
        assert_eq!(change.deadline, Some(START + TIME_PER_SIDE_MS));
        assert_eq!(change.state.seq, 1);
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

        // Once started, no one else gets in, and leaving does nothing
        assert_eq!(
            games.join(game(1), user(3)),
            Err("The game has started".to_string())
        );
        games.leave(game(1), user(1));
        assert_eq!(
            games.start(game(1), user(2), START, true).err(),
            Some("The game has started".to_string())
        );
        assert!(games.play_move(game(1), user(2), "e2e4", START).is_ok());
    }

    #[test]
    fn a_game_needs_two_players_to_start() {
        let games = Games::default();
        games.posted(game(1));

        assert_eq!(
            games.start(game(1), user(1), START, true).err(),
            Some("Chess needs two players".to_string())
        );
        // The starter counts as joined, so a second joiner completes the game
        games.join(game(1), user(2)).unwrap();
        let (players, _) = games.start(game(1), user(1), START, true).unwrap();
        assert_eq!(players, [user(1), user(2)]);

        // A third person can't start someone else's game
        let games = Games::default();
        games.join(game(1), user(1)).unwrap();
        games.join(game(1), user(2)).unwrap();
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
        assert_eq!(change.waiting_for, [user(2)]);
        assert_eq!(change.deadline, Some(START + 1000 + TIME_PER_SIDE_MS));
        assert_eq!(change.state.seq, 2);
        assert_eq!(change.state.shared["moves"], json!(["e4"]));
        assert_eq!(change.state.shared["turn"], "black");

        let change = games
            .play_move(game(1), user(2), "e7e5", START + 3000)
            .unwrap();
        assert_eq!(change.waiting_for, [user(1)]);
        assert_eq!(
            change.state.shared["clock"],
            json!({ "white_ms": TIME_PER_SIDE_MS - 1000, "black_ms": TIME_PER_SIDE_MS - 2000, "running": "white" })
        );

        // The update tells the service whose turn it is
        let update = change.into_update(game(1));
        assert_eq!(update.waiting_for, Some(vec![user(1)]));
        assert_eq!(update.status, None);
        assert_eq!(update.result, None);
        assert_eq!(update.state.unwrap().seq, 3);

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

    #[test]
    fn a_finished_game_s_update_carries_its_result() {
        let games = started();
        games.play_move(game(1), user(1), "f2f3", START).unwrap();
        games.play_move(game(1), user(2), "e7e5", START).unwrap();
        games.play_move(game(1), user(1), "g2g4", START).unwrap();

        let change = games
            .play_move(game(1), user(2), "d8h4", START + 1000)
            .unwrap();

        assert_eq!(change.waiting_for, Vec::<UserId>::new());
        assert_eq!(change.result.as_deref(), Some("Black won by checkmate"));
        assert_eq!(change.deadline, None);
        assert_eq!(change.state.shared["status"], "Finished");
        let update = change.into_update(game(1));
        assert_eq!(update.status, Some(GameStatus::Finished));
        assert_eq!(update.result.as_deref(), Some("Black won by checkmate"));
        assert_eq!(update.waiting_for, None);
        assert_eq!(
            games
                .play_move(game(1), user(1), "e1f2", START + 2000)
                .err(),
            Some("The game has finished".to_string())
        );
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
        let (offer, change) = games.offer_draw(game(1), user(2), START).unwrap();
        assert_eq!(offer, DrawOffer::Offered);
        assert_eq!(change.state.shared["draw_offer"], "black");
        assert_eq!(change.result, None);
        let (offer, change) = games.offer_draw(game(1), user(1), START).unwrap();
        assert_eq!(offer, DrawOffer::Accepted);
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
    fn an_open_game_s_state_has_no_board() {
        let games = Games::default();
        games.join(game(1), user(1)).unwrap();
        let mut game_state = games.games.lock().unwrap();
        let change = game_state.get_mut(&game(1)).unwrap().change(START);

        assert_eq!(
            change.state.shared,
            json!({ "status": "Open", "players": [user(1)], "white": null, "black": null })
        );
        assert_eq!(change.waiting_for, Vec::<UserId>::new());
        assert_eq!(change.deadline, None);
    }
}
