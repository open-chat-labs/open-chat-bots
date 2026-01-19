use crate::{HttpRequest, env};
use oc_bots_sdk::{api::event_notification::BotEventWrapper, types::TokenError};

pub fn parse_event(request: HttpRequest, public_key: &str) -> Result<BotEventWrapper, TokenError> {
    BotEventWrapper::parse(
        &request.body,
        request.get_header("x-oc-signature").unwrap(),
        public_key,
        env::now(),
    )
}
