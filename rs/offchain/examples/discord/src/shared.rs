use oc_bots_sdk::types::AuthToken;
use oc_bots_sdk::types::{ActionScope, BotApiKeyContext, Chat, TokenError};
use oc_bots_sdk::types::{
    BotActionChatDetails, BotActionCommunityDetails, BotCommandContext, BotCommandScope,
};
use poise::serenity_prelude::ChannelId;
use serde::{Deserialize, Serialize};

/// Used to identify OC channels from the provided contexts, bot or api key
/// contexts currently.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct OcChannelKey(pub String);

impl OcChannelKey {
    /// Get a unique key for an OC channel!
    ///
    /// Key consists of the available identifiers for a specific OC channel
    /// available from its API key. Since this key should be the same when
    /// calculated from the API key or a JWT, it should allow us to make a
    /// two way connection between Discord and OC.
    ///
    /// Plus, this function will reject the API key if it's not correct,
    /// therefore validating it.
    pub fn from_api_key(api_key: String) -> Result<Self, TokenError> {
        let BotApiKeyContext { scope, .. } = BotApiKeyContext::parse_api_key(api_key)?;
        let key = match scope {
            ActionScope::Chat(Chat::Direct(canister_id)) => canister_id.to_string(),
            ActionScope::Chat(Chat::Group(canister_id)) => canister_id.to_string(),
            ActionScope::Chat(Chat::Channel(canister_id, channel_id)) => {
                format!("{}_{}", canister_id, channel_id)
            }
            ActionScope::Community(canister_id) => canister_id.to_string(),
        };

        Ok(Self(key))
    }

    /// Construct the key from the bot context!
    pub fn from_bot_context(ctx: &BotCommandContext) -> Self {
        Self(match &ctx.scope {
            BotCommandScope::Chat(BotActionChatDetails { chat, .. }) => match chat {
                Chat::Direct(principal) => principal.to_string(),
                Chat::Group(principal) => principal.to_string(),
                Chat::Channel(principal, channel) => {
                    format!("{}_{}", principal, channel)
                }
            },
            BotCommandScope::Community(BotActionCommunityDetails { community_id }) => {
                community_id.to_string()
            }
        })
    }

    #[cfg(test)]
    pub fn new(key: String) -> Self {
        Self(key)
    }
}

/// Token to link Discord and OpenChat channels!
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RelayLink {
    pub ds_channel_id: ChannelId,
    // Note that this key can be retrieved from the token, but we are basically
    // caching it to simplify the code.
    pub oc_channel_key: OcChannelKey,
    pub oc_auth_token: AuthToken,
    pub error: Option<String>,
}

impl RelayLink {
    pub fn new(ds_channel_id: ChannelId, oc_channel_key: OcChannelKey, api_key: String) -> Self {
        Self {
            ds_channel_id,
            oc_channel_key,
            oc_auth_token: AuthToken::ApiKey(api_key),
            error: None,
        }
    }

    pub fn set_error(self, error: String) -> Self {
        Self {
            error: Some(error),
            ..self
        }
    }

    pub fn clear_error(self) -> Self {
        Self {
            error: None,
            ..self
        }
    }
}
