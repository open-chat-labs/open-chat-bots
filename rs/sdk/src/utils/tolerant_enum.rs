use serde::de::{self, Deserializer, IgnoredAny, MapAccess, Visitor};
use std::fmt;
use std::marker::PhantomData;

/// For the enums OpenChat adds variants to, eg. new kinds of message content, so that a bot built
/// with this SDK decodes a variant it doesn't know as `unknown`, rather than failing to decode the
/// whole response or notification. OpenChat encodes them externally tagged: a unit variant as its
/// name, and any other as a map from its name to its value.
pub(crate) trait TolerantEnum: Sized {
    const EXPECTING: &'static str;

    /// Decodes the value of the variant `tag`, or returns `None` if it isn't a known variant with a
    /// value
    fn variant<'de, A: MapAccess<'de>>(tag: &str, map: &mut A) -> Result<Option<Self>, A::Error>;

    fn unit_variant(tag: &str) -> Option<Self>;

    fn unknown(tag: String) -> Self;
}

pub(crate) fn deserialize_tolerant<'de, D: Deserializer<'de>, T: TolerantEnum>(
    deserializer: D,
) -> Result<T, D::Error> {
    deserializer.deserialize_any(TolerantVisitor(PhantomData))
}

struct TolerantVisitor<T>(PhantomData<T>);

impl<'de, T: TolerantEnum> Visitor<'de> for TolerantVisitor<T> {
    type Value = T;

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str(T::EXPECTING)
    }

    fn visit_str<E: de::Error>(self, tag: &str) -> Result<T, E> {
        Ok(T::unit_variant(tag).unwrap_or_else(|| T::unknown(tag.to_string())))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<T, A::Error> {
        let tag: String = map
            .next_key()?
            .ok_or_else(|| de::Error::invalid_length(0, &self))?;

        if let Some(value) = T::variant(&tag, &mut map)? {
            return Ok(value);
        }
        map.next_value::<IgnoredAny>()?;
        Ok(T::unit_variant(&tag).unwrap_or_else(|| T::unknown(tag)))
    }
}

/// Implements `TolerantEnum` and `Deserialize` for an enum, given its variants with values, its
/// unit variants, and how to build the value for an unknown variant from its name
macro_rules! tolerant_enum {
    (
        $name:ident,
        variants: [$($variant:ident),* $(,)?],
        units: [$($unit:ident),* $(,)?],
        unknown: |$tag:ident| $unknown:expr $(,)?
    ) => {
        impl $crate::utils::TolerantEnum for $name {
            const EXPECTING: &'static str = concat!("a ", stringify!($name));

            fn variant<'de, A: serde::de::MapAccess<'de>>(
                tag: &str,
                map: &mut A,
            ) -> Result<Option<Self>, A::Error> {
                Ok(Some(match tag {
                    $(stringify!($variant) => $name::$variant(map.next_value()?),)*
                    _ => return Ok(None),
                }))
            }

            fn unit_variant(tag: &str) -> Option<Self> {
                match tag {
                    $(stringify!($unit) => Some($name::$unit),)*
                    _ => None,
                }
            }

            fn unknown($tag: String) -> Self {
                $unknown
            }
        }

        impl<'de> serde::Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                $crate::utils::deserialize_tolerant(deserializer)
            }
        }

        // Fails to compile if a variant is missing from the lists above, which would otherwise
        // decode as unknown
        const _: fn(&$name) = |value| match value {
            $($name::$variant(_) => {})*
            $($name::$unit => {})*
        };
    };
}

pub(crate) use tolerant_enum;

#[cfg(test)]
mod tests {
    use crate::msgpack;
    use crate::types::{
        AccessGate, BridgedUserId, ChatEvent, CryptoTransaction, MessageContent, P2PSwapStatus,
        PendingCryptoTransaction, PollConfig, PollContent, SenderContext, TextContent,
    };
    use crate::utils::tolerant_enum::tests::backend::*;
    use serde::Serialize;
    use serde::de::DeserializeOwned;

    // Stand-ins for OpenChat's own types, which have variants this SDK doesn't know
    mod backend {
        use serde::Serialize;

        #[derive(Serialize)]
        pub enum MessageContent {
            Text(super::TextContent),
            SomethingNew(SomethingNewContent),
        }

        #[derive(Serialize)]
        pub struct SomethingNewContent {
            pub recipient: String,
            pub amount: u128,
        }

        #[derive(Serialize)]
        pub enum CryptoTransaction {
            Pending(PendingCryptoTransaction),
        }

        #[derive(Serialize)]
        pub enum PendingCryptoTransaction {
            SomethingNew(SomethingNewContent),
        }

        #[derive(Serialize)]
        pub enum P2PSwapStatus {
            SomethingNew(SomethingNewContent),
            SomethingNewWithoutData,
        }

        #[derive(Serialize)]
        pub enum ChatEvent {
            Empty,
            HistoryDeleted(HistoryDeleted),
            SomethingNew(HistoryDeleted),
            SomethingNewWithoutData,
        }

        #[derive(Serialize)]
        pub struct HistoryDeleted {
            pub before: u64,
            pub deleted_by: String,
        }

        #[derive(Serialize)]
        pub enum AccessGate {
            DiamondMember,
            TotalChitEarned(ChitEarnedGate),
            SomethingNew(ChitEarnedGate),
        }

        #[derive(Serialize)]
        pub struct ChitEarnedGate {
            pub min_chit_earned: u32,
        }

        #[derive(Serialize)]
        pub enum SenderContext {
            Bot(BotMessageContext),
            Webhook,
        }

        #[derive(Serialize)]
        pub struct BotMessageContext {
            pub command: Option<()>,
            pub finalised: bool,
            pub bridged_from: Option<BridgedUserId>,
        }

        #[derive(Serialize)]
        pub enum BridgedUserId {
            Discord(u64),
        }
    }

    fn decode<T: DeserializeOwned>(value: impl Serialize) -> T {
        let bytes = msgpack::serialize_then_unwrap(value);
        msgpack::deserialize_owned_then_unwrap(bytes)
    }

    #[test]
    fn unknown_message_content_decodes_as_unsupported() {
        let text: MessageContent = decode(backend::MessageContent::Text(TextContent {
            text: "hello".to_string(),
        }));
        assert!(matches!(text, MessageContent::Text(t) if t.text == "hello"));

        let new: MessageContent =
            decode(backend::MessageContent::SomethingNew(SomethingNewContent {
                recipient: "abc".to_string(),
                amount: 1_000_000_000_000_000_000_000,
            }));
        assert!(matches!(new, MessageContent::Unsupported(u) if u.kind == "SomethingNew"));
    }

    // So unknown content in a list doesn't stop the items after it decoding
    #[test]
    fn unknown_message_content_in_a_list() {
        let contents: Vec<MessageContent> = decode(vec![
            backend::MessageContent::SomethingNew(SomethingNewContent {
                recipient: "abc".to_string(),
                amount: 1,
            }),
            backend::MessageContent::Text(TextContent {
                text: "after".to_string(),
            }),
        ]);
        assert!(matches!(&contents[0], MessageContent::Unsupported(_)));
        assert!(matches!(&contents[1], MessageContent::Text(t) if t.text == "after"));
    }

    #[test]
    fn unknown_chat_events_decode_as_unsupported() {
        let history_deleted = backend::HistoryDeleted {
            before: 5,
            deleted_by: "2vxsx-fae".to_string(),
        };

        assert!(matches!(
            decode::<ChatEvent>(backend::ChatEvent::Empty),
            ChatEvent::Empty
        ));
        assert!(matches!(
            decode::<ChatEvent>(backend::ChatEvent::HistoryDeleted(history_deleted)),
            ChatEvent::HistoryDeleted(h) if h.before == 5
        ));
        assert!(matches!(
            decode::<ChatEvent>(backend::ChatEvent::SomethingNew(backend::HistoryDeleted {
                before: 5,
                deleted_by: "2vxsx-fae".to_string(),
            })),
            ChatEvent::Unsupported(tag) if tag == "SomethingNew"
        ));
        assert!(matches!(
            decode::<ChatEvent>(backend::ChatEvent::SomethingNewWithoutData),
            ChatEvent::Unsupported(tag) if tag == "SomethingNewWithoutData"
        ));
    }

    #[test]
    fn unknown_access_gates_decode_as_unsupported() {
        assert_eq!(
            decode::<AccessGate>(backend::AccessGate::DiamondMember),
            AccessGate::DiamondMember
        );
        assert!(matches!(
            decode::<AccessGate>(backend::AccessGate::TotalChitEarned(ChitEarnedGate {
                min_chit_earned: 10
            })),
            AccessGate::TotalChitEarned(g) if g.min_chit_earned == 10
        ));
        assert_eq!(
            decode::<AccessGate>(backend::AccessGate::SomethingNew(ChitEarnedGate {
                min_chit_earned: 10
            })),
            AccessGate::Unsupported("SomethingNew".to_string())
        );
    }

    // So a transfer on a new kind of ledger, or a swap in a new state, doesn't stop the message
    // it's in decoding
    #[test]
    fn unknown_kinds_within_message_content_decode_as_unsupported() {
        let transaction: CryptoTransaction = decode(backend::CryptoTransaction::Pending(
            backend::PendingCryptoTransaction::SomethingNew(SomethingNewContent {
                recipient: "abc".to_string(),
                amount: 1,
            }),
        ));
        assert!(matches!(
            &transaction,
            CryptoTransaction::Pending(PendingCryptoTransaction::Unsupported(kind)) if kind == "SomethingNew"
        ));
        assert_eq!(transaction.ledger_canister_id(), None);

        assert!(matches!(
            decode::<P2PSwapStatus>(backend::P2PSwapStatus::SomethingNew(SomethingNewContent {
                recipient: "abc".to_string(),
                amount: 1,
            })),
            P2PSwapStatus::Unsupported(kind) if kind == "SomethingNew"
        ));
        assert!(matches!(
            decode::<P2PSwapStatus>(backend::P2PSwapStatus::SomethingNewWithoutData),
            P2PSwapStatus::Unsupported(kind) if kind == "SomethingNewWithoutData"
        ));
    }

    #[test]
    fn sender_context_with_a_bridged_author() {
        let context: SenderContext = decode(backend::SenderContext::Bot(BotMessageContext {
            command: None,
            finalised: true,
            bridged_from: Some(backend::BridgedUserId::Discord(80351110224678912)),
        }));
        let SenderContext::Bot(context) = context else {
            panic!("Expected a bot context");
        };
        assert_eq!(
            context.bridged_from,
            Some(BridgedUserId::Discord(80351110224678912))
        );

        assert!(matches!(
            decode::<SenderContext>(backend::SenderContext::Webhook),
            SenderContext::Webhook
        ));
    }

    // Round trips, as bots also store and pass these on
    #[test]
    fn sdk_values_round_trip() {
        let content: MessageContent = decode(MessageContent::Unsupported(
            crate::types::UnsupportedContent {
                kind: "SomethingNew".to_string(),
            },
        ));
        assert!(matches!(content, MessageContent::Unsupported(u) if u.kind == "SomethingNew"));

        let event: ChatEvent = decode(ChatEvent::Unsupported("SomethingNew".to_string()));
        assert!(matches!(event, ChatEvent::Unsupported(tag) if tag == "SomethingNew"));
    }

    // OpenChat requires a poll's votes and whether it has ended, even on a new poll
    #[test]
    fn a_new_poll_includes_votes_and_ended() {
        let poll: PollContent = PollConfig {
            text: None,
            options: vec!["Yes".to_string(), "No".to_string()],
            end_date: None,
            anonymous: false,
            show_votes_before_end_date: true,
            allow_multiple_votes_per_user: false,
            allow_user_to_change_vote: true,
        }
        .into();

        let value: serde_json::Value = serde_json::to_value(&poll).unwrap();
        assert_eq!(value["ended"], false);
        assert_eq!(value["votes"]["user"], serde_json::json!([]));
    }
}
