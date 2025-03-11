use crate::{CanisterRuntime, HttpRequest, HttpResponse};
use oc_bots_sdk::api::command::{BadRequest, CommandHandlerRegistry, CommandResponse};
use oc_bots_sdk::types::TimestampMillis;
use std::str;

pub async fn execute(
    request: HttpRequest,
    command_handlers: &CommandHandlerRegistry<CanisterRuntime>,
    public_key: &str,
    now: TimestampMillis,
) -> HttpResponse {
    let jwt = match request.get_header("x-oc-jwt") {
        Some(jwt) => jwt,
        None => return HttpResponse::json(400, &BadRequest::AccessTokenNotFound),
    };

    match command_handlers.execute(jwt, public_key, now).await {
        CommandResponse::Success(result) => HttpResponse::json(200, &result),
        CommandResponse::BadRequest(err) => HttpResponse::json(400, &err),
        CommandResponse::TooManyRequests => HttpResponse::status(429),
        CommandResponse::InternalError(err) => HttpResponse::json(500, &err),
    }
}
