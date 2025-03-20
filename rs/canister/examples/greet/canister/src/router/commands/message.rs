use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::chat_events::{self, EventsSelectionCriteria, EventsWindowArgs};
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::{BotCommandContext, MessageContentInitial};
use oc_bots_sdk_canister::CanisterRuntime;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Message::definition);

pub struct Message;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Message {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let index: u32 = cxt.command.arg("index");

        let events = EventsSelectionCriteria::Window(EventsWindowArgs {
            mid_point: index,
            max_messages: 1,
            max_events: 1,
        });

        let path = cxt.scope.path();
        let message_id = cxt.scope.message_id();

        let response = oc_client.chat_events(events).execute_async().await;

        let text = match response {
            Ok(chat_events::Response::Success(result)) => {
                result.events.first().and_then(|event| match &event.event {
                    oc_bots_sdk::types::ChatEvent::Message(message) => {
                        if message.message_index != index {
                            None
                        } else {
                            let text = format!("{}\n\n", message.content.text().unwrap_or(""));
                            Some(format!("{text}[link](https://oc.app{}/{})", path, index))
                        }
                    }
                    _ => None,
                })
            }
            Ok(chat_events::Response::NotFound) => None,
            response => {
                return Err(format!("Failed to retrieve message: {:?}", response));
            }
        }
        .unwrap_or("Message not found".to_string());

        // Reply to the initiator with an ephemeral message
        Ok(EphemeralMessageBuilder::new(
            MessageContentInitial::from_text(text),
            message_id.unwrap(),
        )
        .build()
        .into())
    }
}

impl Message {
    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "message".to_string(),
            description: Some(
                "This will show the caller a message from the chat with the given index"
                    .to_string(),
            ),
            placeholder: Some("Looking up message...".to_string()),
            params: vec![BotCommandParam {
                name: "index".to_string(),
                description: Some("The message index".to_string()),
                placeholder: None,
                required: true,
                param_type: BotCommandParamType::IntegerParam(IntegerParam {
                    min_value: 1,
                    max_value: i32::MAX as i64,
                    choices: vec![],
                }),
            }],
            permissions: BotPermissions::from_chat_permission(ChatPermission::ReadMessages),
            default_role: None,
            direct_messages: false,
        }
    }
}
