use thiserror::Error;

#[derive(Error, Debug)]
pub enum BotError {
    #[error("Failed to read config file :: {0}")]
    ConfigFileError(std::io::Error),

    #[error("Could not parse config :: {0}")]
    ConfigParseError(#[from] toml::de::Error),
}
