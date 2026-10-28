use crate::board::{Board, CELL, Outcome};
use oc_bots_sdk::games::{Lobby, LobbyState};
use oc_bots_sdk::types::{MessageId, MiniAppContent, UserId};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

const TITLE: &str = "Tic-tac-toe";

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

/// The games being played, by the id of the message each is in. Each game has its own lock, held
/// from a press until the message is edited, so that the edits land in the order of the moves.
#[derive(Default)]
pub struct Games {
    games: Mutex<HashMap<MessageId, Arc<tokio::sync::Mutex<Game>>>>,
}

impl Games {
    pub fn insert(&self, message_id: MessageId, game: Game) {
        self.games
            .lock()
            .unwrap()
            .insert(message_id, Arc::new(tokio::sync::Mutex::new(game)));
    }

    pub fn get(&self, message_id: MessageId) -> Option<Arc<tokio::sync::Mutex<Game>>> {
        self.games.lock().unwrap().get(&message_id).cloned()
    }

    pub fn remove(&self, message_id: MessageId) {
        self.games.lock().unwrap().remove(&message_id);
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
        for button_id in [Lobby::JOIN, "cell-", "cell-x", "cell--1", "cell-9"] {
            let result = game.press(user(1), button_id);
            assert_eq!(result, Err(PressError::InvalidButton), "{button_id}");
        }
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
