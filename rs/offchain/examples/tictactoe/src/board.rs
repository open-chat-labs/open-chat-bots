use oc_bots_sdk::types::{MessageButton, MessageButtonStyle, MiniAppContent, UserId};

const LINES: [[usize; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

/// The prefix of each cell's button id, followed by its index, 0 to 8, row by row
pub const CELL: &str = "cell-";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mark {
    X,
    O,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Playing,
    Won(UserId),
    Draw,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MoveError {
    NotAPlayer,
    NotYourTurn,
    NoSuchSquare,
    Taken,
    Over,
}

impl MoveError {
    pub fn reply(&self) -> &'static str {
        match self {
            MoveError::NotAPlayer => "You're not playing in this game",
            MoveError::NotYourTurn => "It's not your turn",
            MoveError::NoSuchSquare => "There's no such square",
            MoveError::Taken => "That square's taken",
            MoveError::Over => "The game is over",
        }
    }
}

/// A game between two players, X, who moves first, and O
#[derive(Clone, Debug)]
pub struct Board {
    x: UserId,
    o: UserId,
    cells: [Option<Mark>; 9],
}

impl Board {
    pub fn new(x: UserId, o: UserId) -> Self {
        Board {
            x,
            o,
            cells: [None; 9],
        }
    }

    /// Plays the user's mark on the cell, 0 to 8, row by row
    pub fn play(&mut self, user: UserId, cell: usize) -> Result<(), MoveError> {
        let mark = self.mark_of(user).ok_or(MoveError::NotAPlayer)?;
        if self.outcome() != Outcome::Playing {
            return Err(MoveError::Over);
        }
        if mark != self.turn() {
            return Err(MoveError::NotYourTurn);
        }
        let cell = self.cells.get_mut(cell).ok_or(MoveError::NoSuchSquare)?;
        if cell.is_some() {
            return Err(MoveError::Taken);
        }
        *cell = Some(mark);
        Ok(())
    }

    pub fn outcome(&self) -> Outcome {
        let winner = LINES.iter().find_map(|&[a, b, c]| {
            let mark = self.cells[a]?;
            (self.cells[b] == Some(mark) && self.cells[c] == Some(mark)).then_some(mark)
        });

        match winner {
            Some(mark) => Outcome::Won(self.player(mark)),
            None if self.cells.iter().all(Option::is_some) => Outcome::Draw,
            None => Outcome::Playing,
        }
    }

    /// The players, the status ("@UserId(..)'s turn", "@UserId(..) won" or "Draw") and the board,
    /// as 3 rows of buttons
    pub fn render(&self) -> MiniAppContent {
        let status = match self.outcome() {
            Outcome::Playing => format!("@UserId({})'s turn", self.player(self.turn())),
            Outcome::Won(winner) => format!("@UserId({winner}) won"),
            Outcome::Draw => "Draw".to_string(),
        };
        let text = format!(
            "**Tic-tac-toe** · X @UserId({}) vs O @UserId({})\n{status}",
            self.x, self.o
        );

        let button_rows = self
            .cells
            .chunks(3)
            .enumerate()
            .map(|(row, cells)| {
                cells
                    .iter()
                    .enumerate()
                    .map(|(column, cell)| {
                        let (label, style) = match cell {
                            None => ("·", MessageButtonStyle::Secondary),
                            Some(Mark::X) => ("X", MessageButtonStyle::Primary),
                            Some(Mark::O) => ("O", MessageButtonStyle::Danger),
                        };
                        MessageButton {
                            id: format!("{CELL}{}", row * 3 + column),
                            label: label.to_string(),
                            style,
                            // Everyone sees the board, and only the players can play
                            visible_to: None,
                        }
                    })
                    .collect()
            })
            .collect();

        MiniAppContent { text, button_rows }
    }

    fn turn(&self) -> Mark {
        let moves = self.cells.iter().filter(|c| c.is_some()).count();
        if moves % 2 == 0 { Mark::X } else { Mark::O }
    }

    fn mark_of(&self, user: UserId) -> Option<Mark> {
        if user == self.x {
            Some(Mark::X)
        } else if user == self.o {
            Some(Mark::O)
        } else {
            None
        }
    }

    fn player(&self, mark: Mark) -> UserId {
        match mark {
            Mark::X => self.x,
            Mark::O => self.o,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ic_principal::Principal;

    fn user(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    // X is user 1 and O user 2
    fn play(cells: &[usize]) -> Board {
        let mut board = Board::new(user(1), user(2));
        for (i, &cell) in cells.iter().enumerate() {
            let player = if i % 2 == 0 { user(1) } else { user(2) };
            board.play(player, cell).unwrap();
        }
        board
    }

    #[test]
    fn players_take_turns_x_first() {
        let mut board = Board::new(user(1), user(2));

        assert_eq!(board.play(user(2), 0), Err(MoveError::NotYourTurn));
        assert_eq!(board.play(user(1), 0), Ok(()));
        assert_eq!(board.play(user(1), 1), Err(MoveError::NotYourTurn));
        assert_eq!(board.play(user(2), 1), Ok(()));
        assert_eq!(board.outcome(), Outcome::Playing);
    }

    #[test]
    fn only_the_players_play_on_empty_squares() {
        let mut board = play(&[4]);

        assert_eq!(board.play(user(3), 0), Err(MoveError::NotAPlayer));
        assert_eq!(board.play(user(2), 4), Err(MoveError::Taken));
        assert_eq!(board.play(user(2), 9), Err(MoveError::NoSuchSquare));
        assert_eq!(board.play(user(2), 0), Ok(()));
    }

    #[test]
    fn three_in_a_line_wins() {
        // A row, a column and each diagonal
        for (moves, winner) in [
            (vec![0, 3, 1, 4, 2], user(1)),
            (vec![0, 1, 3, 4, 8, 7], user(2)),
            (vec![0, 1, 4, 2, 8], user(1)),
            (vec![0, 2, 1, 4, 3, 6], user(2)),
        ] {
            let board = play(&moves);
            assert_eq!(board.outcome(), Outcome::Won(winner), "{moves:?}");
        }
    }

    #[test]
    fn no_one_plays_once_its_won() {
        let mut board = play(&[0, 3, 1, 4, 2]);

        assert_eq!(board.play(user(2), 5), Err(MoveError::Over));
        assert_eq!(board.play(user(3), 5), Err(MoveError::NotAPlayer));
    }

    #[test]
    fn a_full_board_without_a_line_is_a_draw() {
        // X O X
        // X O O
        // O X X
        let board = play(&[0, 1, 2, 4, 3, 5, 7, 6, 8]);

        assert_eq!(board.outcome(), Outcome::Draw);
        assert!(board.render().text.ends_with("\nDraw"));
    }

    #[test]
    fn a_win_on_the_last_square_isnt_a_draw() {
        // X O X
        // O X O
        // X O X
        let board = play(&[0, 1, 2, 3, 6, 5, 8, 7, 4]);

        assert_eq!(board.outcome(), Outcome::Won(user(1)));
    }

    #[test]
    fn the_board_shows_each_square_and_whose_turn_it_is() {
        let board = play(&[4, 0]);
        let content = board.render();

        assert_eq!(
            content.text,
            format!(
                "**Tic-tac-toe** · X @UserId({}) vs O @UserId({})\n@UserId({})'s turn",
                user(1),
                user(2),
                user(1)
            )
        );
        let ids: Vec<_> = content
            .button_rows
            .concat()
            .into_iter()
            .map(|b| b.id)
            .collect();
        assert_eq!(ids, (0..9).map(|i| format!("cell-{i}")).collect::<Vec<_>>());
        let labels: Vec<_> = content
            .button_rows
            .iter()
            .map(|row| row.iter().map(|b| b.label.as_str()).collect::<String>())
            .collect();
        assert_eq!(labels, ["O··", "·X·", "···"]);
        assert_eq!(content.validate(), Ok(()));
    }

    #[test]
    fn a_won_board_says_who_won() {
        let board = play(&[0, 3, 1, 4, 2]);

        assert!(
            board
                .render()
                .text
                .ends_with(&format!("\n@UserId({}) won", user(1)))
        );
    }
}
