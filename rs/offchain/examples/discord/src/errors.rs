use aes_gcm::aead;
use poise::serenity_prelude as serenity;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BotError {
    #[error("Failed to read config file :: {0}")]
    ConfigFileError(std::io::Error),

    #[error("Could not parse config :: {0}")]
    ConfigParseError(#[from] toml::de::Error),

    #[error("Could not initialise Discord client :: {0}")]
    FailedDiscordClientInit(#[from] serenity::Error),

    #[error("Could not initialise OpenChat client :: {0}")]
    FailedOpenChatClientInit(tokio::io::Error),

    #[error("Could not start OpenChat bot server :: {0}")]
    FailedToStartOcServer(tokio::io::Error),

    #[error("Could not serialise state :: {0}")]
    FailedToSerialiseState(serde_json::Error),

    #[error("Could not deserialise state :: {0}")]
    FailedToDeserialiseState(serde_json::Error),

    #[error("Failed to create path for the state persist file :: {0}")]
    FailedToCreateStoreFilePath(std::io::Error),

    #[error("Failed to open file to persist state :: {0}")]
    FailedToOpenStoreFile(std::io::Error),

    #[error("Failed to write state to file :: {0}")]
    FailedToWriteState(std::io::Error),

    #[error("Failed to read existing state from file :: {0}")]
    FailedToReadState(std::io::Error),

    #[error("Failed to encrypt state while saving :: {0}")]
    FailedToEncryptState(aead::Error),

    #[error("Failed to decrypt state :: {0}")]
    FailedToDecryptState(aead::Error),
}
