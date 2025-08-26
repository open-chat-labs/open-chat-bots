use crate::games::GAMES;
use rand::rngs::StdRng;
use rand::SeedableRng;
use rustyknife_z::{Continuation, ZMachine};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default)]
pub struct GameEngine {
    seed: [u8; 32],
    game: String,
    #[serde(default)]
    inputs: Vec<String>,
}

impl GameEngine {
    pub fn new(game: String, seed: [u8; 32]) -> Self {
        GameEngine {
            seed,
            game,
            inputs: Vec::new(),
        }
    }

    pub fn start(&mut self) -> String {
        self.inputs.clear();
        self.run().unwrap()
    }

    pub fn input(&mut self, text: String) -> Option<String> {
        self.inputs.push(text.clone());
        self.run()
    }

    pub fn status(&self) -> Option<(String, usize)> {
        Some((self.game.clone(), self.inputs.len()))
    }

    fn run(&self) -> Option<String> {
        let name = self.game.as_str();
        let data = GAMES.get(name).unwrap();
        let mut rng = StdRng::from_seed(self.seed);
        let mut zmachine = ZMachine::new_with_rng(data.to_vec(), &mut rng).unwrap();
        let mut input = self.inputs.iter();
        let mut output = String::new();
        let mut continuation = zmachine.start();

        loop {
            match continuation {
                Ok(cont) => match cont {
                    Continuation::Step(next) => {
                        continuation = next();
                    }
                    Continuation::UpdateStatusLine(_status_line, next) => {
                        continuation = next();
                    }
                    Continuation::Print(string, next) => {
                        output += &string;
                        continuation = next();
                    }
                    Continuation::ReadLine(next) => {
                        if let Some(line) = input.next() {
                            continuation = next(line);
                            output = String::new();
                        } else {
                            break;
                        }
                    }
                    Continuation::Quit => {
                        return None;
                    }
                },
                Err(err) => {
                    panic!(
                        "Z-machine generated a runtime error: {}\nOutput so far:\n{}",
                        err, output
                    );
                }
            }
        }

        Some(output)
    }
}
