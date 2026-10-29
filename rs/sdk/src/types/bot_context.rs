use crate::api::command::Command;
use crate::jwt;
use crate::types::{
    ActionContext, ActionScope, BotActionByCommandClaims, BotCommandScope, BotPermissions,
    CLAIM_TYPE_BOT_ACTION_BY_COMMAND, CanisterId, MessageId, MessageIndex, TimestampMillis,
    TokenError, UserId,
};

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
        // All of OpenChat's tokens are signed with the same key, so a token for another purpose
        // must not be taken for a command's
        let claims: BotActionByCommandClaims =
            jwt::verify_claims(&jwt, public_key, CLAIM_TYPE_BOT_ACTION_BY_COMMAND, now)?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jwt::Claims;
    use crate::jwt::test_tokens::{public_key_pem, sign, signing_key};
    use crate::types::{BotActionChatDetails, Chat};
    use ic_principal::Principal;

    const NOW: TimestampMillis = 1_800_000_000_000;

    fn id(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    fn command_token(claim_type: &str, expires: TimestampMillis) -> String {
        let claims = Claims::new(
            expires,
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
        let parse = |jwt| BotCommandContext::parse(jwt, &public_key_pem(), NOW);

        let command = parse(command_token("BotActionByCommand", NOW + 3_600_000)).unwrap();
        assert_eq!(command.bot_id, id(2));
        assert_eq!(command.api_gateway, id(1));

        for claim_type in ["MiniAppChat", "StartVideoCall"] {
            let result = parse(command_token(claim_type, NOW + 3_600_000));
            assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
        }

        let result = parse(command_token("BotActionByCommand", NOW));
        assert!(matches!(result, Err(TokenError::Expired)), "{result:?}");
    }
}
