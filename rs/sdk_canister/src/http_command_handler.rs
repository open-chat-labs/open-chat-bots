use crate::{CanisterRuntime, Request, Response};
use oc_bots_sdk::{
    api::{BadRequest, CommandResponse},
    types::TimestampMillis,
    CommandHandler,
};
use std::str;

pub async fn execute(
    request: Request,
    command_handler: &CommandHandler<CanisterRuntime>,
    public_key: &str,
    now: TimestampMillis,
) -> Response {
    let jwt = match str::from_utf8(&request.body) {
        Ok(jwt) => jwt,
        Err(_) => return Response::json(400, &BadRequest::AccessTokenNotFound),
    };

    match command_handler.execute(jwt, public_key, now).await {
        CommandResponse::Success(result) => Response::json(200, &result),
        CommandResponse::BadRequest(err) => Response::json(400, &err),
        CommandResponse::TooManyRequests => Response::status(429),
        CommandResponse::InternalError(err) => Response::text(500, format!("{err:?}")),
    }
}
