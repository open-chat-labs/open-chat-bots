use crate::bridge::{Bridge, NotificationOutcome};
use crate::platform::Platform;
use axum::Router;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use oc_bots_sdk::api::command::{BadRequest, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::{
    AutonomousConfig, BotCommandDefinition, BotCommandParam, BotCommandParamType, BotDefinition,
    BotSubscriptions, StringParam,
};
use oc_bots_sdk::types::{
    BotCommandContext, BotCommandScope, BotPermissions, Chat, ChatEventType, ChatPermission,
    ChatRole, InstallationLocationType, MessageContentInitial, MessagePermission, TokenError,
};
use oc_bots_sdk_offchain::env;
use std::collections::HashSet;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::warn;

/// The routes OpenChat calls: the bot's definition, its commands, and its notifications. A bridge
/// adds its platform's own routes to them.
pub fn router<P: Platform>(bridge: Arc<Bridge<P>>) -> Router {
    Router::new()
        .route("/", get(bot_definition::<P>))
        .route("/bot_definition", get(bot_definition::<P>))
        .route("/execute_command", post(execute_command::<P>))
        .route("/notify", post(notify::<P>))
        // The website fetches the definition and runs commands from the browser
        .layer(CorsLayer::permissive())
        .with_state(bridge)
}

async fn bot_definition<P: Platform>() -> Json<BotDefinition> {
    Json(definition::<P>())
}

pub fn definition<P: Platform>() -> BotDefinition {
    let name = P::NAME;
    BotDefinition {
        description: format!(
            "Bridges groups and public channels with {name}, so messages, edits and deletions in \
            either appear in both. In {name}, run /bridge in the chat to bridge to get a code, then \
            run /bridge with the code here. OpenChat users can link their {name} account from \
            their profile, so their messages from {name} show as theirs."
        ),
        commands: vec![
            BotCommandDefinition {
                name: "bridge".to_string(),
                description: Some(format!("Bridge this chat with a {name} chat")),
                placeholder: Some("Bridging...".to_string()),
                params: vec![BotCommandParam {
                    name: "code".to_string(),
                    description: Some(format!(
                        "The code /bridge gave you in {name}. Leave it out to see how to get one."
                    )),
                    placeholder: Some("ABCD-1234".to_string()),
                    required: false,
                    param_type: BotCommandParamType::StringParam(StringParam {
                        // OpenChat's clients send an omitted string as "", which a minimum length
                        // would refuse, so /bridge couldn't be run without a code
                        min_length: 0,
                        max_length: 12,
                        choices: Vec::new(),
                        multi_line: false,
                    }),
                }],
                permissions: BotPermissions::text_only(),
                default_role: Some(ChatRole::Admin),
                direct_messages: Some(false),
            },
            BotCommandDefinition {
                name: "unbridge".to_string(),
                description: Some(format!("Stop bridging this chat with {name}")),
                placeholder: None,
                params: Vec::new(),
                permissions: BotPermissions::text_only(),
                default_role: Some(ChatRole::Admin),
                direct_messages: Some(false),
            },
        ],
        autonomous_config: Some(AutonomousConfig {
            permissions: BotPermissions::default()
                .with_chat(&HashSet::from([
                    ChatPermission::ReadMessages,
                    ChatPermission::DeleteMessages,
                ]))
                .with_message(&HashSet::from([MessagePermission::Text])),
        }),
        default_subscriptions: Some(BotSubscriptions {
            community: HashSet::new(),
            chat: HashSet::from([
                ChatEventType::Message,
                ChatEventType::MessageEdited,
                ChatEventType::MessageDeleted,
            ]),
        }),
        restricted_locations: Some(HashSet::from([
            InstallationLocationType::Community,
            InstallationLocationType::Group,
        ])),
    }
}

async fn execute_command<P: Platform>(
    State(bridge): State<Arc<Bridge<P>>>,
    headers: HeaderMap,
) -> Response {
    let Some(jwt) = headers.get("x-oc-jwt").and_then(|v| v.to_str().ok()) else {
        return bad_request(BadRequest::AccessTokenNotFound);
    };
    let context =
        match BotCommandContext::parse(jwt.to_string(), bridge.openchat.public_key(), env::now()) {
            Ok(context) => context,
            Err(TokenError::Expired) => return bad_request(BadRequest::AccessTokenExpired),
            Err(TokenError::Invalid(error)) => {
                return bad_request(BadRequest::AccessTokenInvalid(error));
            }
        };

    let BotCommandScope::Chat(details) = &context.scope else {
        return bad_request(BadRequest::ArgsInvalid);
    };
    let chat = details.chat;
    let message_id = details.message_id;

    let reply = match context.command.name.as_str() {
        "bridge" => match context
            .command
            .maybe_arg::<String>("code")
            .filter(|code| !code.trim().is_empty())
        {
            Some(code) => bridge_command(&bridge, &context, chat, &code).await,
            None => Ok(bridge.platform.bridge_instructions()),
        },
        "unbridge" => unbridge_command(&bridge, chat).await,
        _ => return bad_request(BadRequest::CommandNotFound),
    };

    let text = match reply {
        Ok(text) => text,
        Err(error) => {
            warn!(?error, command = context.command.name, "Command failed");
            "Something went wrong. Please try again.".to_string()
        }
    };
    let result: SuccessResult =
        EphemeralMessageBuilder::new(MessageContentInitial::from_text(text), message_id)
            .build()
            .into();
    (StatusCode::OK, Json(result)).into_response()
}

async fn bridge_command<P: Platform>(
    bridge: &Bridge<P>,
    context: &BotCommandContext,
    chat: Chat,
    code: &str,
) -> anyhow::Result<String> {
    let name = P::NAME;
    if matches!(chat, Chat::Direct(_)) {
        return Ok("Only groups and channels can be bridged.".to_string());
    }
    Ok(
        match bridge
            .complete_pairing(code, chat, context.api_gateway)
            .await?
        {
            Some(chat_name) => format!("This chat is now bridged with {chat_name} on {name}."),
            None => format!(
                "That code is unknown or has expired. Run /bridge in {name} to get a new one."
            ),
        },
    )
}

async fn unbridge_command<P: Platform>(bridge: &Bridge<P>, chat: Chat) -> anyhow::Result<String> {
    let name = P::NAME;
    Ok(match bridge.store.pairing_for_oc_chat(&chat).await? {
        Some(pairing) => {
            bridge.unpair(&pairing).await?;
            format!("This chat is no longer bridged with {name}.")
        }
        None => format!("This chat isn't bridged with {name}."),
    })
}

async fn notify<P: Platform>(
    State(bridge): State<Arc<Bridge<P>>>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(signature) = headers.get("x-oc-signature").and_then(|v| v.to_str().ok()) else {
        return StatusCode::BAD_REQUEST;
    };
    match bridge.handle_notification(&body, signature).await {
        NotificationOutcome::Handled => StatusCode::OK,
        NotificationOutcome::Invalid => StatusCode::BAD_REQUEST,
        // OpenChat retries this one
        NotificationOutcome::Failed => StatusCode::SERVICE_UNAVAILABLE,
    }
}

fn bad_request(error: BadRequest) -> Response {
    (StatusCode::BAD_REQUEST, Json(error)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{BridgeStore, Pairing};
    use crate::openchat::{OpenChat, OpenChatConfig};
    use crate::platform::OutboundMessage;
    use crate::store::InMemoryStore;
    use async_trait::async_trait;
    use axum::body::Body;
    use axum::http::Request;
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use ic_agent::export::Principal;
    use ic_agent::identity::AnonymousIdentity;
    use oc_bots_sdk::api::command::{Command, CommandArg, CommandArgValue};
    use oc_bots_sdk::jwt::Claims;
    use oc_bots_sdk::types::{
        BotActionByCommandClaims, BotActionChatDetails, BotCommandScope, BotPermissions,
        BotRegisteredEvent, BridgePlatform, CanisterId,
    };
    use p256::ecdsa::signature::Signer;
    use p256::ecdsa::{Signature, SigningKey};
    use p256::pkcs8::{EncodePublicKey, LineEnding};
    use serde::Serialize;
    use tower::ServiceExt;

    struct TestPlatform;

    #[async_trait]
    impl Platform for TestPlatform {
        const PLATFORM: BridgePlatform = BridgePlatform::Discord;
        const NAME: &'static str = "Discord";

        async fn post(&self, _: &Pairing, _: &OutboundMessage) -> anyhow::Result<String> {
            Ok("1".to_string())
        }

        async fn edit(&self, _: &Pairing, _: &str, _: &OutboundMessage) -> anyhow::Result<()> {
            Ok(())
        }

        async fn delete(&self, _: &Pairing, _: &str) -> anyhow::Result<()> {
            Ok(())
        }

        fn bridge_instructions(&self) -> String {
            "Run /bridge in Discord".to_string()
        }
    }

    // Stands in for OpenChat's key, which signs its notifications
    fn signing_key() -> SigningKey {
        SigningKey::from_slice(&[7; 32]).unwrap()
    }

    async fn bridge() -> Arc<Bridge<TestPlatform>> {
        let mut config = OpenChatConfig::mainnet(String::new());
        config.public_key = signing_key()
            .verifying_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        let openchat = OpenChat::with_identity(config, Box::new(AnonymousIdentity))
            .await
            .unwrap();
        let store = BridgeStore::new(Arc::new(InMemoryStore::default()), BridgePlatform::Discord);
        let bridge = Arc::new(Bridge::new(openchat, store, TestPlatform));
        // Its OpenChat runtime can't be dropped within async code
        std::mem::forget(bridge.clone());
        bridge
    }

    // A notification as OpenChat encodes and signs it
    fn notification(api_gateway: CanisterId, notification_index: u64) -> (Vec<u8>, String) {
        #[derive(Serialize)]
        struct Wrapper {
            api_gateway: CanisterId,
            event: Event,
            timestamp: u64,
            notification_index: u64,
        }
        #[derive(Serialize)]
        enum Event {
            Lifecycle(Lifecycle),
        }
        #[derive(Serialize)]
        enum Lifecycle {
            Registered(BotRegisteredEvent),
        }

        let payload = oc_bots_sdk::msgpack::serialize_then_unwrap(Wrapper {
            api_gateway,
            event: Event::Lifecycle(Lifecycle::Registered(BotRegisteredEvent {
                bot_id: Principal::anonymous().into(),
                bot_name: "bridge".to_string(),
            })),
            timestamp: 1,
            notification_index,
        });
        let signature: Signature = signing_key().sign(&payload);
        (payload, URL_SAFE_NO_PAD.encode(signature.to_bytes()))
    }

    async fn post_notification(
        bridge: &Arc<Bridge<TestPlatform>>,
        body: Vec<u8>,
        signature: Option<&str>,
    ) -> StatusCode {
        let mut request = Request::post("/notify");
        if let Some(signature) = signature {
            request = request.header("x-oc-signature", signature);
        }
        router(bridge.clone())
            .oneshot(request.body(Body::from(body)).unwrap())
            .await
            .unwrap()
            .status()
    }

    #[tokio::test]
    async fn notifications_are_verified_and_remembered() {
        let bridge = bridge().await;
        let api_gateway: CanisterId = Principal::from_slice(&[5]).into();
        let (body, signature) = notification(api_gateway, 3);

        assert_eq!(
            post_notification(&bridge, body.clone(), None).await,
            StatusCode::BAD_REQUEST
        );
        let (_, other_signature) = notification(api_gateway, 4);
        assert_eq!(
            post_notification(&bridge, body.clone(), Some(&other_signature)).await,
            StatusCode::BAD_REQUEST
        );
        assert!(
            !bridge
                .store
                .notification_handled(api_gateway, 3)
                .await
                .unwrap()
        );

        assert_eq!(
            post_notification(&bridge, body.clone(), Some(&signature)).await,
            StatusCode::OK
        );
        assert!(
            bridge
                .store
                .notification_handled(api_gateway, 3)
                .await
                .unwrap()
        );
        // OpenChat sending it again
        assert_eq!(
            post_notification(&bridge, body, Some(&signature)).await,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn the_definition_has_the_bridge_commands() {
        let bridge = bridge().await;
        for path in ["/", "/bot_definition"] {
            let response = router(bridge.clone())
                .oneshot(Request::get(path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);

            let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap();
            let definition: BotDefinition = serde_json::from_slice(&body).unwrap();
            let commands: Vec<_> = definition
                .commands
                .iter()
                .map(|c| c.name.as_str())
                .collect();
            assert_eq!(commands, ["bridge", "unbridge"]);
            // So /bridge without a code can say how to get one
            let code = &definition.commands[0].params[0];
            assert!(!code.required);
            let BotCommandParamType::StringParam(param) = &code.param_type else {
                panic!("The code isn't a string");
            };
            assert_eq!(param.min_length, 0);
        }
    }

    // eg. Telegram upgrading a group to a supergroup, which has a new id
    #[tokio::test]
    async fn a_pairing_moves_to_a_chats_new_id() {
        let bridge = bridge().await;
        let oc_chat = oc_bots_sdk::types::Chat::Group(Principal::from_slice(&[3]).into());
        let pairing = Pairing {
            platform_chat: "-123".to_string(),
            oc_chat,
            api_gateway: Principal::anonymous().into(),
            platform_data: None,
        };
        bridge.store.save_pairing(&pairing).await.unwrap();

        assert!(bridge.move_pairing("-123", "-100456").await.unwrap());

        assert_eq!(bridge.store.pairing("-123").await.unwrap(), None);
        let moved = bridge
            .store
            .pairing_for_oc_chat(&oc_chat)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(moved.platform_chat, "-100456");
        assert!(!bridge.move_pairing("-123", "-100456").await.unwrap());
    }

    // A command's token as OpenChat signs it
    fn command_jwt(args: Vec<CommandArg>) -> String {
        let claims = Claims::new(
            u64::MAX / 2,
            "BotActionByCommand".to_string(),
            BotActionByCommandClaims {
                bot_api_gateway: Principal::from_slice(&[5]).into(),
                bot: Principal::from_slice(&[6]).into(),
                scope: BotCommandScope::Chat(BotActionChatDetails {
                    chat: oc_bots_sdk::types::Chat::Group(Principal::from_slice(&[3]).into()),
                    thread: None,
                    message_id: 1.into(),
                    user_message_id: None,
                }),
                granted_permissions: BotPermissions::text_only(),
                command: Command {
                    name: "bridge".to_string(),
                    args,
                    initiator: Principal::from_slice(&[7]).into(),
                    meta: None,
                },
            },
        );
        let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"ES256","typ":"JWT"}"#);
        let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        let signature: Signature = signing_key().sign(format!("{header}.{body}").as_bytes());
        format!(
            "{header}.{body}.{}",
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        )
    }

    // OpenChat's clients send an omitted code as ""
    #[tokio::test]
    async fn bridge_without_a_code_says_how_to_get_one() {
        let bridge = bridge().await;
        for args in [
            Vec::new(),
            vec![CommandArg {
                name: "code".to_string(),
                value: CommandArgValue::String(String::new()),
            }],
        ] {
            let response = router(bridge.clone())
                .oneshot(
                    Request::post("/execute_command")
                        .header("x-oc-jwt", command_jwt(args))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let body = axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap();
            assert!(String::from_utf8_lossy(&body).contains("Run /bridge in Discord"));
        }
    }

    #[tokio::test]
    async fn a_command_without_an_access_token_is_refused() {
        let bridge = bridge().await;
        let response = router(bridge)
            .oneshot(
                Request::post("/execute_command")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}
