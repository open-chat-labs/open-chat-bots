use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, EphemeralMessageBuilder, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::oc_api::actions::chat_events::{self, EventsSelectionCriteria, EventsWindowArgs};
use oc_bots_sdk::oc_api::actions::ActionArgsBuilder;
use oc_bots_sdk::oc_api::client_factory::ClientFactory;
use oc_bots_sdk::types::BotCommandContext;
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
        cxt: BotCommandContext,
        oc_client_factory: &ClientFactory<CanisterRuntime>,
    ) -> Result<SuccessResult, String> {
        let index: u32 = cxt.command.arg("index");

        let events = EventsSelectionCriteria::Window(EventsWindowArgs {
            mid_point: index,
            max_messages: 1,
            max_events: 1,
        });

        let path = cxt.scope.path();
        let message_id = cxt.scope.message_id();

        // Send the message to OpenChat but don't wait for the response
        let response = oc_client_factory
            .build(cxt)
            .chat_events(events)
            .execute_async()
            .await;

        let text = match response {
            Ok(chat_events::Response::Success(result)) => result
                .events
                .first()
                .map(|event| match &event.event {
                    oc_bots_sdk::types::ChatEvent::Message(message) => {
                        let text = format!("{}\n\n", message.content.text().unwrap_or(""));
                        format!("{text}[link](https://oc.app{}/{})", path, event.index)
                    }
                    _ => "Message not found".to_string(),
                })
                .unwrap_or_else(|| "Message not found".to_string()),
            Ok(chat_events::Response::NotFound) => "Message not found".to_string(),
            response => {
                return Err(format!("Failed to retrieve message: {:?}", response));
            }
        };

        // Reply to the initiator with an ephemeral message
        Ok(EphemeralMessageBuilder::new(message_id)
            .with_text_content(text)
            .build()?
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
        }
    }
}
