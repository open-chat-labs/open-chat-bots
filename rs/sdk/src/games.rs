//! Helpers for games played in MiniApp messages.
//!
//! Games must never involve wagering tokens, or anything else of value: that's gambling, which
//! OpenChat isn't licensed for.

use crate::types::{MessageButton, MessageButtonStyle, MiniAppContent, UserId};
use serde::{Deserialize, Serialize};
use std::fmt::{Display, Formatter};

/// Players gathering for a game, which the bot keeps, eg. keyed by the message showing it. OpenChat
/// only stores the message, [rendered](Lobby::render) from it.
///
/// The host, who posted it, is its first player, and starts the game once enough have joined.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Lobby {
    pub host: UserId,
    /// In the order they joined, the host first
    pub players: Vec<UserId>,
    pub min_players: usize,
    pub max_players: usize,
    pub state: LobbyState,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum LobbyState {
    #[default]
    Open,
    Started,
}

/// Why a player can't join, leave or start the game, worded for them, eg. for an
/// [`ActionResponse::reply`](crate::api::action::ActionResponse::reply)
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LobbyError {
    AlreadyStarted,
    AlreadyJoined,
    Full,
    NotAPlayer,
    /// The host can't leave, as they start the game
    HostCantLeave,
    NotTheHost,
    TooFewPlayers,
}

impl Display for LobbyError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            LobbyError::AlreadyStarted => "The game has already started",
            LobbyError::AlreadyJoined => "You've already joined",
            LobbyError::Full => "The game is full",
            LobbyError::NotAPlayer => "You haven't joined",
            LobbyError::HostCantLeave => "You're the host, so you can't leave",
            LobbyError::NotTheHost => "Only the host can start the game",
            LobbyError::TooFewPlayers => "There aren't enough players yet",
        })
    }
}

impl std::error::Error for LobbyError {}

impl Lobby {
    /// The ids of the buttons [`Lobby::render`] shows
    pub const JOIN: &'static str = "join";
    pub const LEAVE: &'static str = "leave";
    pub const START: &'static str = "start";

    /// An open lobby whose only player is its host. `min_players` must be at least 1 and at most
    /// `max_players`.
    pub fn new(host: UserId, min_players: usize, max_players: usize) -> Self {
        assert!(
            (1..=max_players).contains(&min_players),
            "A lobby needs 1 <= min_players <= max_players"
        );

        Lobby {
            host,
            players: vec![host],
            min_players,
            max_players,
            state: LobbyState::Open,
        }
    }

    pub fn is_player(&self, user: UserId) -> bool {
        self.players.contains(&user)
    }

    pub fn join(&mut self, user: UserId) -> Result<(), LobbyError> {
        self.check_open()?;
        if self.is_player(user) {
            Err(LobbyError::AlreadyJoined)
        } else if self.players.len() >= self.max_players {
            Err(LobbyError::Full)
        } else {
            self.players.push(user);
            Ok(())
        }
    }

    pub fn leave(&mut self, user: UserId) -> Result<(), LobbyError> {
        self.check_open()?;
        if user == self.host {
            Err(LobbyError::HostCantLeave)
        } else if !self.is_player(user) {
            Err(LobbyError::NotAPlayer)
        } else {
            self.players.retain(|p| *p != user);
            Ok(())
        }
    }

    /// Starts the game, if `user` is the host and enough players have joined
    pub fn start(&mut self, user: UserId) -> Result<(), LobbyError> {
        self.check_open()?;
        if user != self.host {
            Err(LobbyError::NotTheHost)
        } else if self.players.len() < self.min_players {
            Err(LobbyError::TooFewPlayers)
        } else {
            self.state = LobbyState::Started;
            Ok(())
        }
    }

    /// The lobby as a MiniApp message: its title, players and what it's waiting for, with Join and
    /// Leave buttons for everyone and a Start button for the host, until it's started. Each player
    /// is mentioned, as `@UserId(<id>)`, which OpenChat shows as their name. The text fits within
    /// OpenChat's limit for up to 40 players.
    pub fn render(&self, title: &str) -> MiniAppContent {
        let players = self
            .players
            .iter()
            .map(|player| {
                if *player == self.host {
                    format!("@UserId({player}) (host)")
                } else {
                    format!("@UserId({player})")
                }
            })
            .collect::<Vec<_>>()
            .join(", ");

        let status = match self.state {
            LobbyState::Started => "The game has started".to_string(),
            LobbyState::Open if self.players.len() < self.min_players => {
                let needed = self.min_players - self.players.len();
                let plural = if needed == 1 { "" } else { "s" };
                format!("Waiting for {needed} more player{plural}")
            }
            LobbyState::Open => format!("Waiting for @UserId({}) to start", self.host),
        };

        let text = format!(
            "**{title}**\nPlayers ({} of {}): {players}\n{status}",
            self.players.len(),
            self.max_players
        );

        let button_rows = match self.state {
            LobbyState::Started => Vec::new(),
            LobbyState::Open => vec![vec![
                button(Self::JOIN, "Join", MessageButtonStyle::Primary, None),
                button(Self::LEAVE, "Leave", MessageButtonStyle::Secondary, None),
                button(
                    Self::START,
                    "Start",
                    MessageButtonStyle::Primary,
                    Some(vec![self.host]),
                ),
            ]],
        };

        MiniAppContent { text, button_rows }
    }

    fn check_open(&self) -> Result<(), LobbyError> {
        match self.state {
            LobbyState::Open => Ok(()),
            LobbyState::Started => Err(LobbyError::AlreadyStarted),
        }
    }
}

fn button(
    id: &str,
    label: &str,
    style: MessageButtonStyle,
    visible_to: Option<Vec<UserId>>,
) -> MessageButton {
    MessageButton {
        id: id.to_string(),
        label: label.to_string(),
        style,
        visible_to,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ic_principal::Principal;

    fn user(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    // A lobby for 2 to 3 players, hosted by user 1
    fn lobby() -> Lobby {
        Lobby::new(user(1), 2, 3)
    }

    #[test]
    fn the_host_is_the_first_player() {
        let lobby = lobby();

        assert_eq!(lobby.players, [user(1)]);
        assert_eq!(lobby.state, LobbyState::Open);
    }

    #[test]
    fn players_join_until_its_full() {
        let mut lobby = lobby();

        assert_eq!(lobby.join(user(2)), Ok(()));
        assert_eq!(lobby.join(user(2)), Err(LobbyError::AlreadyJoined));
        assert_eq!(lobby.join(user(1)), Err(LobbyError::AlreadyJoined));
        assert_eq!(lobby.join(user(3)), Ok(()));
        assert_eq!(lobby.join(user(4)), Err(LobbyError::Full));
        assert_eq!(lobby.players, [user(1), user(2), user(3)]);
    }

    #[test]
    fn players_but_not_the_host_can_leave() {
        let mut lobby = lobby();
        lobby.join(user(2)).unwrap();
        lobby.join(user(3)).unwrap();

        assert_eq!(lobby.leave(user(2)), Ok(()));
        assert_eq!(lobby.leave(user(2)), Err(LobbyError::NotAPlayer));
        assert_eq!(lobby.leave(user(4)), Err(LobbyError::NotAPlayer));
        assert_eq!(lobby.leave(user(1)), Err(LobbyError::HostCantLeave));
        assert_eq!(lobby.players, [user(1), user(3)]);
    }

    #[test]
    fn only_the_host_starts_it_once_enough_have_joined() {
        let mut lobby = lobby();

        assert_eq!(lobby.start(user(1)), Err(LobbyError::TooFewPlayers));
        lobby.join(user(2)).unwrap();
        assert_eq!(lobby.start(user(2)), Err(LobbyError::NotTheHost));
        assert_eq!(lobby.start(user(3)), Err(LobbyError::NotTheHost));
        assert_eq!(lobby.state, LobbyState::Open);
        assert_eq!(lobby.start(user(1)), Ok(()));
        assert_eq!(lobby.state, LobbyState::Started);
    }

    #[test]
    fn nothing_changes_once_its_started() {
        let mut lobby = lobby();
        lobby.join(user(2)).unwrap();
        lobby.start(user(1)).unwrap();

        assert_eq!(lobby.join(user(3)), Err(LobbyError::AlreadyStarted));
        assert_eq!(lobby.leave(user(2)), Err(LobbyError::AlreadyStarted));
        assert_eq!(lobby.start(user(1)), Err(LobbyError::AlreadyStarted));
        assert_eq!(lobby.players, [user(1), user(2)]);
    }

    #[test]
    #[should_panic]
    fn a_lobby_needs_at_least_one_player() {
        Lobby::new(user(1), 0, 2);
    }

    #[test]
    #[should_panic]
    fn a_lobby_needs_room_for_its_minimum() {
        Lobby::new(user(1), 3, 2);
    }

    #[test]
    fn an_open_lobby_shows_its_players_and_buttons() {
        let mut lobby = lobby();
        let host = user(1);
        let content = lobby.render("Tic-tac-toe");

        assert_eq!(
            content.text,
            format!(
                "**Tic-tac-toe**\nPlayers (1 of 3): @UserId({host}) (host)\nWaiting for 1 more player"
            )
        );
        let [row] = &content.button_rows[..] else {
            panic!("Expected one row, got {:?}", content.button_rows);
        };
        let ids: Vec<_> = row.iter().map(|b| b.id.as_str()).collect();
        assert_eq!(ids, [Lobby::JOIN, Lobby::LEAVE, Lobby::START]);
        assert_eq!(row[0].visible_to, None);
        assert_eq!(row[1].visible_to, None);
        assert_eq!(row[2].visible_to, Some(vec![host]));
        assert_eq!(content.validate(), Ok(()));

        lobby.join(user(2)).unwrap();
        assert_eq!(
            lobby.render("Tic-tac-toe").text,
            format!(
                "**Tic-tac-toe**\nPlayers (2 of 3): @UserId({host}) (host), @UserId({})\nWaiting for @UserId({host}) to start",
                user(2)
            )
        );
    }

    #[test]
    fn a_started_lobby_has_no_buttons() {
        let mut lobby = Lobby::new(user(1), 3, 4);
        assert!(
            lobby
                .render("Uno")
                .text
                .ends_with("Waiting for 2 more players")
        );

        lobby.join(user(2)).unwrap();
        lobby.join(user(3)).unwrap();
        lobby.start(user(1)).unwrap();
        let content = lobby.render("Uno");

        assert!(content.text.ends_with("\nThe game has started"));
        assert!(content.button_rows.is_empty());
        assert_eq!(content.validate(), Ok(()));
    }

    // User ids are canister ids, of 10 bytes
    #[test]
    fn a_lobby_of_40_is_within_the_limits() {
        let id = |i: u8| Principal::from_slice(&[i; 10]).into();
        let mut lobby = Lobby::new(id(1), 2, 40);
        for i in 2..=40 {
            lobby.join(id(i)).unwrap();
        }

        assert_eq!(lobby.render(&"x".repeat(100)).validate(), Ok(()));
    }
}
