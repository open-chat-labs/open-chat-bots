use super::{Chat, MessageId, MessageIndex, TimestampMillis, TokenError, UserId};
use crate::jwt;
use serde::{Deserialize, Serialize, Serializer};

/// A game, which is played from one of a bot's MiniApp cards: the card's chat, thread and message
/// id, as a message id is only unique within its chat and thread. OpenChat's MiniApp service names
/// games by it, so a bot can key its games by it too.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct MiniAppGame {
    pub chat: Chat,
    /// The thread's root message index, if the card is in a thread
    pub thread: Option<MessageIndex>,
    #[serde(serialize_with = "serialize_message_id")]
    pub message_id: MessageId,
}

/// The `claim_type` of the token the MiniApp service sends with its `POST <endpoint>/mini_app/join`
pub const CLAIM_TYPE_MINI_APP_JOIN: &str = "MiniAppJoin";

/// The `claim_type` of the token the MiniApp service sends with its `POST <endpoint>/mini_app/leave`
pub const CLAIM_TYPE_MINI_APP_LEAVE: &str = "MiniAppLeave";

/// The `claim_type` of the token the MiniApp service gives a player's app, which the app sends with
/// each request to the bot
pub const CLAIM_TYPE_MINI_APP_PLAYER: &str = "MiniAppPlayer";

/// The tokens the MiniApp service signs, each for one purpose
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MiniAppTokenType {
    /// A user asks to join a game, which the bot accepts or refuses
    Join,
    /// A player has left a game, or isn't playing after all
    Leave,
    /// A user is a player in a game, sent by their app with each request to the bot
    Player,
}

impl MiniAppTokenType {
    pub fn claim_type(self) -> &'static str {
        match self {
            MiniAppTokenType::Join => CLAIM_TYPE_MINI_APP_JOIN,
            MiniAppTokenType::Leave => CLAIM_TYPE_MINI_APP_LEAVE,
            MiniAppTokenType::Player => CLAIM_TYPE_MINI_APP_PLAYER,
        }
    }
}

/// What the MiniApp service vouches for in each of its tokens: a user, and one of this bot's games
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct MiniAppPlayerClaims {
    pub bot: UserId,
    pub game: MiniAppGame,
    pub user_id: UserId,
}

impl MiniAppPlayerClaims {
    /// Verifies a token the MiniApp service signed: that it signed it, with `service_public_key`,
    /// the PEM from its `GET /public_key`, that it's of the type expected, that it's for this bot,
    /// `bot_id`, and that it hasn't expired. A token for another bot is refused, as otherwise one
    /// bot's server could replay a user's token to another bot.
    ///
    /// `bot_id` is the user id OpenChat gave the bot when it was registered, which isn't the bot's
    /// principal. An offchain bot can fetch it from the UserIndex, with
    /// `installation_events().size(0)`.
    pub fn parse(
        jwt: &str,
        service_public_key: &str,
        token_type: MiniAppTokenType,
        bot_id: UserId,
        now: TimestampMillis,
    ) -> Result<Self, TokenError> {
        let claims: MiniAppPlayerClaims =
            jwt::verify_claims(jwt, service_public_key, token_type.claim_type(), now)?;

        if claims.bot != bot_id {
            return Err(TokenError::Invalid(format!(
                "The token is for the bot {}, not this one, {bot_id}",
                claims.bot
            )));
        }

        Ok(claims)
    }
}

// As OpenChat writes a message id: as a string in JSON, as a number this size loses digits in
// JavaScript
fn serialize_message_id<S: Serializer>(
    message_id: &MessageId,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    if serializer.is_human_readable() {
        serializer.collect_str(message_id)
    } else {
        serializer.serialize_u64(**message_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::jwt::test_tokens::{other_signing_key, public_key_pem, sign, signing_key};
    use ic_principal::Principal;
    use serde_json::json;

    const NOW: TimestampMillis = 1_800_000_000_000;

    fn id(byte: u8) -> UserId {
        Principal::from_slice(&[byte]).into()
    }

    #[test]
    fn a_game_is_written_as_openchat_writes_it() {
        let group = MiniAppGame {
            chat: Chat::Group(id(1)),
            thread: None,
            message_id: 5.into(),
        };
        let channel = MiniAppGame {
            chat: Chat::Channel(id(1), 7),
            thread: Some(3),
            message_id: u64::MAX.into(),
        };

        for (game, expected) in [
            (
                group,
                json!({ "chat": { "Group": id(1).to_string() }, "thread": null, "message_id": "5" }),
            ),
            (
                channel,
                json!({
                    "chat": { "Channel": [id(1).to_string(), 7] },
                    "thread": 3,
                    "message_id": "18446744073709551615",
                }),
            ),
        ] {
            assert_eq!(serde_json::to_value(game).unwrap(), expected);
            assert_eq!(
                serde_json::from_value::<MiniAppGame>(expected).unwrap(),
                game
            );
        }
    }

    // As the service writes the claims: ids as text, and the message id as a string
    fn claims_json(claim_type: &str, bot: UserId, exp_seconds: u64) -> String {
        format!(
            r#"{{"exp":{exp_seconds},"claim_type":"{claim_type}","bot":"{bot}","game":{{"chat":{{"Channel":["{}",7]}},"thread":3,"message_id":"18446744073709551615"}},"user_id":"{}"}}"#,
            id(3),
            id(4),
        )
    }

    fn token(claim_type: &str, bot: UserId, exp_seconds: u64) -> String {
        sign(&signing_key(), &claims_json(claim_type, bot, exp_seconds))
    }

    fn parse(jwt: &str, token_type: MiniAppTokenType) -> Result<MiniAppPlayerClaims, TokenError> {
        MiniAppPlayerClaims::parse(jwt, &public_key_pem(), token_type, id(2), NOW)
    }

    const TOKEN_TYPES: [(MiniAppTokenType, &str); 3] = [
        (MiniAppTokenType::Join, "MiniAppJoin"),
        (MiniAppTokenType::Leave, "MiniAppLeave"),
        (MiniAppTokenType::Player, "MiniAppPlayer"),
    ];

    #[test]
    fn each_of_the_service_s_tokens_parses_as_its_type() {
        for (token_type, claim_type) in TOKEN_TYPES {
            let claims = parse(&token(claim_type, id(2), NOW / 1000 + 60), token_type).unwrap();

            assert_eq!(
                claims,
                MiniAppPlayerClaims {
                    bot: id(2),
                    game: MiniAppGame {
                        chat: Chat::Channel(id(3), 7),
                        thread: Some(3),
                        message_id: u64::MAX.into(),
                    },
                    user_id: id(4),
                }
            );
        }
    }

    #[test]
    fn a_service_token_of_another_type_is_refused() {
        for (token_type, _) in TOKEN_TYPES {
            for (_, claim_type) in TOKEN_TYPES
                .into_iter()
                .filter(|(other, _)| *other != token_type)
                .chain([(token_type, "BotActionByCommand")])
            {
                let result = parse(&token(claim_type, id(2), NOW / 1000 + 60), token_type);

                assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
            }
        }
    }

    #[test]
    fn an_expired_service_token_is_refused_as_expired() {
        for (token_type, claim_type) in TOKEN_TYPES {
            let result = parse(&token(claim_type, id(2), NOW / 1000), token_type);

            assert!(matches!(result, Err(TokenError::Expired)), "{result:?}");
        }
    }

    #[test]
    fn a_service_token_for_another_bot_is_refused() {
        for (token_type, claim_type) in TOKEN_TYPES {
            let result = parse(&token(claim_type, id(9), NOW / 1000 + 60), token_type);

            assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
        }
    }

    #[test]
    fn a_service_token_signed_with_another_key_is_refused() {
        for (token_type, claim_type) in TOKEN_TYPES {
            let claims = claims_json(claim_type, id(2), NOW / 1000 + 60);

            let result = parse(&sign(&other_signing_key(), &claims), token_type);

            assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
        }
    }

    #[test]
    fn a_malformed_service_token_is_refused() {
        for jwt in ["", "a.b", "a.b.c"] {
            let result = parse(jwt, MiniAppTokenType::Player);

            assert!(matches!(result, Err(TokenError::Invalid(_))), "{result:?}");
        }
    }
}
