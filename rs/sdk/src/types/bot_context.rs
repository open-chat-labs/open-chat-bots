use crate::api::command::{Command, CommandMeta};
use crate::jwt;
use crate::jwt::Claims;
use crate::types::{
    ActionContext, ActionScope, BotActionByCommandClaims, BotCommandScope, BotMessageSessionClaims,
    BotPermissions, CLAIM_TYPE_BOT_ACTION_BY_COMMAND, CLAIM_TYPE_BOT_MESSAGE_SESSION, CanisterId,
    Chat, MessageId, MessageIndex, TimestampMillis, TokenError, UserId,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug)]
pub struct BotCommandContext {
    pub jwt: String,
    pub bot_id: UserId,
    pub api_gateway: CanisterId,
    pub command: Command,
    pub scope: BotCommandScope,
    pub granted_permissions: BotPermissions,
}

impl BotCommandContext {
    pub fn parse(jwt: String, public_key: &str, now: TimestampMillis) -> Result<Self, TokenError> {
        let claims = jwt::verify::<Claims<BotActionByCommandClaims>>(&jwt, public_key)
            .map_err(|error| TokenError::Invalid(error.to_string()))?;

        // All of OpenChat's tokens are signed with the same key, so a token for another purpose
        // must not be taken for a command's
        if claims.claim_type() != CLAIM_TYPE_BOT_ACTION_BY_COMMAND {
            return Err(TokenError::Invalid(format!(
                "Expected a {CLAIM_TYPE_BOT_ACTION_BY_COMMAND} token, got {}",
                claims.claim_type()
            )));
        }

        if claims.exp_ms() <= now {
            return Err(TokenError::Expired);
        }

        let claims = claims.into_custom();

        Ok(BotCommandContext {
            jwt,
            bot_id: claims.bot,
            command: claims.command,
            scope: claims.scope,
            granted_permissions: claims.granted_permissions,
            api_gateway: claims.bot_api_gateway,
        })
    }
}

impl ActionContext for BotCommandContext {
    fn api_gateway(&self) -> CanisterId {
        self.api_gateway
    }

    fn scope(&self) -> ActionScope {
        self.scope.clone().into()
    }

    fn message_id(&self) -> Option<MessageId> {
        if let BotCommandScope::Chat(chat) = &self.scope {
            Some(chat.message_id)
        } else {
            None
        }
    }

    fn thread(&self) -> Option<MessageIndex> {
        if let BotCommandScope::Chat(chat) = &self.scope {
            chat.thread
        } else {
            None
        }
    }

    fn jwt(&self) -> Option<String> {
        Some(self.jwt.clone())
    }
}

#[derive(Clone, Debug)]
pub struct AutonomousContext {
    pub api_gateway: CanisterId,
    pub scope: ActionScope,
}

impl ActionContext for AutonomousContext {
    fn api_gateway(&self) -> CanisterId {
        self.api_gateway
    }

    fn scope(&self) -> ActionScope {
        self.scope
    }

    fn message_id(&self) -> Option<MessageId> {
        None
    }

    fn thread(&self) -> Option<MessageIndex> {
        None
    }

    fn jwt(&self) -> Option<String> {
        None
    }
}

/// A user of the app a bot opens from one of its MiniApp cards, as OpenChat vouches for in the
/// `BotMessageSession` token it gives the app. OpenChat gives one to a member of the chat, for one
/// card, and it's valid for 15 minutes; the app asks OpenChat for a new one when it runs out. The app
/// sends it to the bot's server, which verifies it with [`Self::parse`] and keys the app's state,
/// eg. a game, by [`Self::card`], with [`Self::user_id`] as the player.
///
/// It only vouches for who the user is: OpenChat's bot endpoints refuse it. To post in the chat,
/// eg. a game's result, the bot acts autonomously, with [`Self::autonomous_context`].
#[derive(Clone, Debug)]
pub struct BotMessageSession {
    /// The user id OpenChat gave the bot when it was registered
    pub bot_id: UserId,
    /// The LocalUserIndex which signed the token, through which the bot can act in the chat
    pub api_gateway: CanisterId,
    pub chat: Chat,
    /// The thread the card is in, if any
    pub thread: Option<MessageIndex>,
    /// The card's message id
    pub message_id: MessageId,
    /// The user using the app
    pub user_id: UserId,
    pub meta: Option<CommandMeta>,
}

/// A MiniApp card: its chat, thread and message id together, as a message id is only unique within
/// its chat and thread
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct MiniAppCard {
    pub chat: Chat,
    pub thread: Option<MessageIndex>,
    pub message_id: MessageId,
}

impl BotMessageSession {
    /// Verifies a `BotMessageSession` token: that OpenChat signed it, with `public_key`, that it's a
    /// session token, for this bot, `bot_id`, and that it hasn't expired. A token for another bot is
    /// refused, as otherwise one bot's server could replay a user's token to another bot.
    ///
    /// `bot_id` is the user id OpenChat gave the bot when it was registered, which isn't the bot's
    /// principal. An offchain bot can fetch it from the UserIndex, with
    /// `installation_events().size(0)`, and a canister bot is told it when it's registered.
    pub fn parse(
        jwt: &str,
        public_key: &str,
        bot_id: UserId,
        now: TimestampMillis,
    ) -> Result<Self, TokenError> {
        let claims = jwt::verify::<Claims<BotMessageSessionClaims>>(jwt, public_key)
            .map_err(|error| TokenError::Invalid(error.to_string()))?;

        if claims.claim_type() != CLAIM_TYPE_BOT_MESSAGE_SESSION {
            return Err(TokenError::Invalid(format!(
                "Expected a {CLAIM_TYPE_BOT_MESSAGE_SESSION} token, got {}",
                claims.claim_type()
            )));
        }

        let expired = claims.exp_ms() <= now;
        let claims = claims.into_custom();

        if claims.bot != bot_id {
            return Err(TokenError::Invalid(format!(
                "The token is for the bot {}, not this one, {bot_id}",
                claims.bot
            )));
        }
        if expired {
            return Err(TokenError::Expired);
        }

        Ok(BotMessageSession {
            bot_id: claims.bot,
            api_gateway: claims.bot_api_gateway,
            chat: claims.chat,
            thread: claims.thread,
            message_id: claims.message_id,
            user_id: claims.user_id,
            meta: claims.meta,
        })
    }

    /// The card the app was opened from, by which to key its state
    pub fn card(&self) -> MiniAppCard {
        MiniAppCard {
            chat: self.chat,
            thread: self.thread,
            message_id: self.message_id,
        }
    }

    /// For a client acting autonomously in the card's chat, eg. to post a game's result there. The
    /// bot needs the autonomous permissions for what it does, eg. `MessagePermission::Text`. Pass
    /// [`Self::thread`] to the message builder's `in_thread` to post in the card's thread.
    pub fn autonomous_context(&self) -> AutonomousContext {
        AutonomousContext {
            api_gateway: self.api_gateway,
            scope: ActionScope::Chat(self.chat),
        }
    }

    /// The user's IANA timezone, eg. "Europe/London", or "UTC" if OpenChat didn't give one
    pub fn timezone(&self) -> &str {
        self.meta
            .as_ref()
            .map(|meta| meta.timezone.as_str())
            .unwrap_or("UTC")
    }

    /// The language the user has chosen in OpenChat, eg. "en", or "en" if OpenChat didn't give one
    pub fn language(&self) -> &str {
        self.meta
            .as_ref()
            .map(|meta| meta.language.as_str())
            .unwrap_or("en")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jwt::test_tokens::{other_signing_key, public_key_pem, sign, signing_key};
    use ic_principal::Principal;

    const NOW: TimestampMillis = 1_800_000_000_000;

    fn id(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    // As OpenChat writes the claims: ids as text, the message id as a string, and each `None` as null
    fn claims_json(claim_type: &str, bot: UserId, exp_seconds: u64) -> String {
        format!(
            r#"{{"exp":{exp_seconds},"claim_type":"{claim_type}","bot_api_gateway":"{}","bot":"{bot}","chat":{{"Channel":["{}",7]}},"thread":3,"message_id":"18446744073709551615","user_id":"{}","meta":{{"timezone":"Europe/London","language":"fr"}}}}"#,
            id(1),
            id(3),
            id(4),
        )
    }

    fn token(claim_type: &str, bot: UserId, exp_seconds: u64) -> String {
        sign(&signing_key(), &claims_json(claim_type, bot, exp_seconds))
    }

    fn parse(jwt: &str) -> Result<BotMessageSession, TokenError> {
        BotMessageSession::parse(jwt, &public_key_pem(), id(2), NOW)
    }

    #[test]
    fn a_token_openchat_signed_for_the_bot_parses() {
        let session = parse(&token("BotMessageSession", id(2), NOW / 1000 + 900)).unwrap();

        assert_eq!(session.bot_id, id(2));
        assert_eq!(session.api_gateway, id(1));
        assert_eq!(session.chat, Chat::Channel(id(3), 7));
        assert_eq!(session.thread, Some(3));
        assert_eq!(session.message_id, MessageId::from(u64::MAX));
        assert_eq!(session.user_id, id(4));
        assert_eq!(session.timezone(), "Europe/London");
        assert_eq!(session.language(), "fr");
        assert_eq!(
            session.card(),
            MiniAppCard {
                chat: Chat::Channel(id(3), 7),
                thread: Some(3),
                message_id: MessageId::from(u64::MAX),
            }
        );

        let context = session.autonomous_context();
        assert_eq!(context.api_gateway, id(1));
        assert!(matches!(context.scope, ActionScope::Chat(Chat::Channel(c, 7)) if c == id(3)));
    }

    #[test]
    fn a_token_without_a_thread_or_meta_parses() {
        let claims = format!(
            r#"{{"exp":{},"claim_type":"BotMessageSession","bot_api_gateway":"{}","bot":"{}","chat":{{"Group":"{}"}},"thread":null,"message_id":"5","user_id":"{}","meta":null}}"#,
            NOW / 1000 + 1,
            id(1),
            id(2),
            id(3),
            id(4),
        );

        let session = parse(&sign(&signing_key(), &claims)).unwrap();

        assert_eq!(session.chat, Chat::Group(id(3)));
        assert_eq!(session.thread, None);
        assert_eq!(session.message_id, MessageId::from(5));
        assert_eq!(session.timezone(), "UTC");
        assert_eq!(session.language(), "en");
    }

    #[test]
    fn an_expired_token_is_refused_as_expired() {
        let result = parse(&token("BotMessageSession", id(2), NOW / 1000));

        assert!(matches!(result, Err(TokenError::Expired)), "{result:?}");
    }

    #[test]
    fn a_token_for_another_bot_is_refused() {
        // Even once it's expired, as it'll never be valid here
        for exp_seconds in [NOW / 1000 + 900, NOW / 1000 - 1] {
            let result = parse(&token("BotMessageSession", id(9), exp_seconds));

            assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
        }
    }

    #[test]
    fn a_token_of_another_type_is_refused() {
        let result = parse(&token("BotActionByCommand", id(2), NOW / 1000 + 900));

        assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
    }

    #[test]
    fn a_token_signed_with_another_key_is_refused() {
        let claims = claims_json("BotMessageSession", id(2), NOW / 1000 + 900);
        let result = parse(&sign(&other_signing_key(), &claims));

        assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
    }

    #[test]
    fn a_token_whose_claims_were_changed_is_refused() {
        let jwt = token("BotMessageSession", id(2), NOW / 1000 + 900);
        let other = token("BotMessageSession", id(2), NOW / 1000 + 7200);
        let mut parts: Vec<_> = jwt.split('.').collect();
        parts[1] = other.split('.').nth(1).unwrap();

        let result = parse(&parts.join("."));

        assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
    }

    #[test]
    fn a_malformed_token_is_refused() {
        for jwt in ["", "a.b", "a.b.c"] {
            assert!(matches!(parse(jwt), Err(TokenError::Invalid(_))));
        }
    }

    fn command_token(claim_type: &str) -> String {
        use crate::types::BotActionChatDetails;

        let claims = Claims::new(
            NOW + 3_600_000,
            claim_type.to_string(),
            BotActionByCommandClaims {
                bot_api_gateway: id(1),
                bot: id(2),
                scope: BotCommandScope::Chat(BotActionChatDetails {
                    chat: Chat::Group(id(3)),
                    thread: None,
                    message_id: 1.into(),
                    user_message_id: None,
                }),
                granted_permissions: BotPermissions::text_only(),
                command: Command {
                    name: "roll".to_string(),
                    args: Vec::new(),
                    initiator: id(4),
                    meta: None,
                },
            },
        );
        sign(&signing_key(), &serde_json::to_string(&claims).unwrap())
    }

    #[test]
    fn only_a_command_token_parses_as_a_command() {
        let command =
            BotCommandContext::parse(command_token("BotActionByCommand"), &public_key_pem(), NOW);
        assert!(command.is_ok(), "{command:?}");

        for claim_type in ["BotMessageSession", "StartVideoCall"] {
            let result =
                BotCommandContext::parse(command_token(claim_type), &public_key_pem(), NOW);
            assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
        }
    }
}
