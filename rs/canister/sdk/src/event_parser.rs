use crate::HttpRequest;
use oc_bots_sdk::{api::event_notification::BotEventWrapper, types::TokenError};

pub fn parse_event(request: HttpRequest, public_key: &str) -> Result<BotEventWrapper, TokenError> {
    let signature = request
        .get_header("x-oc-signature")
        .ok_or_else(|| TokenError::Invalid("Missing x-oc-signature header".to_string()))?;

    BotEventWrapper::parse(&request.body, signature, public_key)
}
