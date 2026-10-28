use crate::board::{Board, CELL, Outcome};
use oc_bots_sdk::games::{Lobby, LobbyError, LobbyState};
use oc_bots_sdk::types::{
    Chat, MessageId, MessageIndex, Milliseconds, MiniAppContent, TimestampMillis, UserId,
};
use std::collections::HashMap;
use std::collections::hash_map::Entry;
use std::sync::{Arc, Mutex};

const TITLE: &str = "Tic-tac-toe";

/// A game is dropped once no one's pressed its buttons for this long
const MAX_IDLE: Milliseconds = 24 * 60 * 60 * 1000;

/// Where a game is played: the chat, the thread if it's in one, and the id of its message. A message
/// id is only unique within its chat and thread, and the user who runs the command chooses it, so a
/// game is never looked up by its message id alone.
pub type GameKey = (Chat, Option<MessageIndex>, MessageId);

/// A game, from its lobby, where its host waits for an opponent, to its last move
#[derive(Clone, Debug)]
pub enum Game {
    Lobby(Lobby),
    Playing(Board),
}

/// Why a press did nothing
#[derive(Debug, PartialEq, Eq)]
pub enum PressError {
    /// Something to tell the user who pressed the button, eg. that it's not their turn
    Reply(String),
    /// A button the game doesn't show now
    InvalidButton,
}

impl Game {
    /// A lobby for 2, hosted by the user who posted it, who plays X
    pub fn new(host: UserId) -> Self {
        Game::Lobby(Lobby::new(host, 2, 2))
    }

    pub fn render(&self) -> MiniAppContent {
        match self {
            Game::Lobby(lobby) => lobby.render(TITLE),
            Game::Playing(board) => board.render(),
        }
    }

    pub fn is_over(&self) -> bool {
        matches!(self, Game::Playing(board) if board.outcome() != Outcome::Playing)
    }

    pub fn press(&mut self, user: UserId, button_id: &str) -> Result<(), PressError> {
        match self {
            Game::Lobby(lobby) => {
                match button_id {
                    Lobby::JOIN => lobby.join(user),
                    Lobby::LEAVE => lobby.leave(user),
                    Lobby::START => lobby.start(user),
                    _ => return Err(PressError::InvalidButton),
                }
                .map_err(|error| PressError::Reply(error.to_string()))?;

                if lobby.state == LobbyState::Started {
                    *self = Game::Playing(Board::new(lobby.players[0], lobby.players[1]));
                }
                Ok(())
            }
            // Eg. Start pressed twice, or Join pressed on a lobby the user hadn't seen start
            Game::Playing(_) if [Lobby::JOIN, Lobby::LEAVE, Lobby::START].contains(&button_id) => {
                Err(PressError::Reply(LobbyError::AlreadyStarted.to_string()))
            }
            Game::Playing(board) => {
                let cell = button_id
                    .strip_prefix(CELL)
                    .and_then(|cell| cell.parse().ok())
                    .filter(|cell| *cell < 9)
                    .ok_or(PressError::InvalidButton)?;

                board
                    .play(user, cell)
                    .map_err(|error| PressError::Reply(error.reply().to_string()))
            }
        }
    }
}

/// The games being played, by where each is played. Each game has its own lock, held from a press
/// until the message is edited, so that the edits land in the order of the moves.
#[derive(Default)]
pub struct Games {
    games: Mutex<HashMap<GameKey, Played>>,
}

struct Played {
    game: Arc<tokio::sync::Mutex<Game>>,
    last_pressed: TimestampMillis,
}

impl Games {
    /// Adds the game, unless there's one in that message already. Games no one's played for a day
    /// are dropped first.
    pub fn insert(&self, key: GameKey, game: Game, now: TimestampMillis) -> bool {
        let mut games = self.games.lock().unwrap();
        games.retain(|_, played| now.saturating_sub(played.last_pressed) < MAX_IDLE);

        match games.entry(key) {
            Entry::Occupied(_) => false,
            Entry::Vacant(entry) => {
                entry.insert(Played {
                    game: Arc::new(tokio::sync::Mutex::new(game)),
                    last_pressed: now,
                });
                true
            }
        }
    }

    pub fn get(
        &self,
        key: &GameKey,
        now: TimestampMillis,
    ) -> Option<Arc<tokio::sync::Mutex<Game>>> {
        let mut games = self.games.lock().unwrap();
        let played = games.get_mut(key)?;
        played.last_pressed = now;
        Some(played.game.clone())
    }

    pub fn remove(&self, key: &GameKey) {
        self.games.lock().unwrap().remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ic_principal::Principal;

    fn user(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    fn reply(text: &str) -> Result<(), PressError> {
        Err(PressError::Reply(text.to_string()))
    }

    #[test]
    fn the_host_starts_once_an_opponent_joins() {
        let mut game = Game::new(user(1));

        assert_eq!(
            game.press(user(1), Lobby::START),
            reply("There aren't enough players yet")
        );
        assert_eq!(game.press(user(2), Lobby::JOIN), Ok(()));
        assert_eq!(game.press(user(3), Lobby::JOIN), reply("The game is full"));
        assert_eq!(
            game.press(user(2), Lobby::START),
            reply("Only the host can start the game")
        );
        assert!(matches!(game, Game::Lobby(_)));

        assert_eq!(game.press(user(1), Lobby::START), Ok(()));
        let Game::Playing(board) = &game else {
            panic!("Expected the game to have started, got {game:?}");
        };
        assert!(
            board
                .render()
                .text
                .ends_with(&format!("\n@UserId({})'s turn", user(1)))
        );
    }

    #[test]
    fn a_cell_is_played_in_turn() {
        let mut game = Game::new(user(1));
        game.press(user(2), Lobby::JOIN).unwrap();
        game.press(user(1), Lobby::START).unwrap();

        assert_eq!(game.press(user(2), "cell-4"), reply("It's not your turn"));
        assert_eq!(game.press(user(1), "cell-4"), Ok(()));
        assert_eq!(game.press(user(2), "cell-4"), reply("That square's taken"));
        assert_eq!(
            game.press(user(3), "cell-0"),
            reply("You're not playing in this game")
        );
        assert_eq!(game.press(user(2), "cell-0"), Ok(()));
        assert!(!game.is_over());
    }

    #[test]
    fn a_button_the_game_doesnt_show_is_invalid() {
        let mut game = Game::new(user(1));
        assert_eq!(
            game.press(user(2), "cell-4"),
            Err(PressError::InvalidButton)
        );

        game.press(user(2), Lobby::JOIN).unwrap();
        game.press(user(1), Lobby::START).unwrap();
        for button_id in ["cell-", "cell-x", "cell--1", "cell-9", "rematch"] {
            let result = game.press(user(1), button_id);
            assert_eq!(result, Err(PressError::InvalidButton), "{button_id}");
        }
    }

    #[test]
    fn a_lobby_button_once_its_started_is_answered() {
        let mut game = Game::new(user(1));
        game.press(user(2), Lobby::JOIN).unwrap();
        game.press(user(1), Lobby::START).unwrap();

        for (user_id, button_id) in [(1, Lobby::START), (3, Lobby::JOIN), (2, Lobby::LEAVE)] {
            assert_eq!(
                game.press(user(user_id), button_id),
                reply("The game has already started")
            );
        }
        assert!(matches!(game, Game::Playing(_)));
    }

    fn key(chat: u8, thread: Option<MessageIndex>, message_id: u64) -> GameKey {
        (Chat::Group(user(chat)), thread, message_id.into())
    }

    #[test]
    fn a_game_is_found_only_where_its_played() {
        let games = Games::default();
        assert!(games.insert(key(1, None, 5), Game::new(user(1)), 0));

        assert!(games.get(&key(1, None, 5), 0).is_some());
        assert!(games.get(&key(2, None, 5), 0).is_none());
        assert!(games.get(&key(1, Some(3), 5), 0).is_none());
        assert!(games.get(&key(1, None, 6), 0).is_none());
    }

    #[test]
    fn a_game_isnt_replaced() {
        let games = Games::default();
        assert!(games.insert(key(1, None, 5), Game::new(user(1)), 0));

        assert!(!games.insert(key(1, None, 5), Game::new(user(2)), 0));
        let game = games.get(&key(1, None, 5), 0).unwrap();
        let Game::Lobby(lobby) = &*game.try_lock().unwrap() else {
            panic!("Expected a lobby");
        };
        assert_eq!(lobby.host, user(1));
    }

    #[test]
    fn a_game_no_one_plays_for_a_day_is_dropped() {
        let games = Games::default();
        games.insert(key(1, None, 1), Game::new(user(1)), 0);
        games.insert(key(1, None, 2), Game::new(user(1)), 0);
        // Pressed an hour later
        games.get(&key(1, None, 2), 3_600_000);

        games.insert(key(1, None, 3), Game::new(user(1)), MAX_IDLE);

        assert!(games.get(&key(1, None, 1), MAX_IDLE).is_none());
        assert!(games.get(&key(1, None, 2), MAX_IDLE).is_some());
        assert!(games.get(&key(1, None, 3), MAX_IDLE).is_some());
    }

    #[test]
    fn its_over_once_someone_wins() {
        let mut game = Game::new(user(1));
        game.press(user(2), Lobby::JOIN).unwrap();
        game.press(user(1), Lobby::START).unwrap();

        for (player, cell) in [(1, 0), (2, 3), (1, 1), (2, 4), (1, 2)] {
            assert!(!game.is_over());
            game.press(user(player), &format!("cell-{cell}")).unwrap();
        }

        assert!(game.is_over());
        assert!(
            game.render()
                .text
                .ends_with(&format!("\n@UserId({}) won", user(1)))
        );
        assert_eq!(game.press(user(2), "cell-5"), reply("The game is over"));
    }
}
