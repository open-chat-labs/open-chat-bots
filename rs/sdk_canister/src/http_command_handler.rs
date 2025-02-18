use crate::{CanisterRuntime, HttpRequest, HttpResponse};
use oc_bots_sdk::{
    api::{BadRequest, CommandResponse},
    types::TimestampMillis,
    CommandHandler,
};
use std::str;

pub async fn execute(
    request: HttpRequest,
    command_handler: &CommandHandler<CanisterRuntime>,
    public_key: &str,
    now: TimestampMillis,
) -> HttpResponse {
    // let jwt = match request.get_header("x-oc-jwt") {
    //     Some(jwt) => jwt,
    //     None => return Response::json(400, &BadRequest::AccessTokenNotFound),
    // };

    let jwt = match str::from_utf8(&request.body) {
        Ok(jwt) => jwt,
        Err(_) => return HttpResponse::json(400, &BadRequest::AccessTokenNotFound),
    };

    match command_handler.execute(jwt, public_key, now).await {
        CommandResponse::Success(result) => HttpResponse::json(200, &result),
        CommandResponse::BadRequest(err) => HttpResponse::json(400, &err),
        CommandResponse::TooManyRequests => HttpResponse::status(429),
        CommandResponse::InternalError(err) => HttpResponse::text(500, format!("{err:?}")),
    }
}
