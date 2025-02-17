use oc_bots_sdk::{
    api::{create_channel, delete_channel, send_message, CanisterError, InternalError},
    types::CallResult,
};

use crate::Response as HttpResponse;

pub fn map_send_message_response(result: CallResult<send_message::Response>) -> HttpResponse {
    match result {
        Ok(send_message::Response::Success(result)) => HttpResponse::json(200, &result),
        Ok(send_message::Response::NotAuthorized) => HttpResponse::json(
            500,
            &InternalError::CanisterError(CanisterError::NotAuthorized),
        ),
        Ok(send_message::Response::Frozen) => {
            HttpResponse::json(500, &InternalError::CanisterError(CanisterError::Frozen))
        }
        Ok(other) => HttpResponse::json(
            500,
            &InternalError::CanisterError(CanisterError::Other(format!("{:?}", other))),
        ),
        Err((code, message)) => HttpResponse::json(500, &InternalError::C2CError(code, message)),
    }
}

pub fn map_create_channel_response(result: CallResult<create_channel::Response>) -> HttpResponse {
    match result {
        Ok(create_channel::Response::Success(result)) => HttpResponse::json(200, &result),
        Ok(create_channel::Response::FailedAuthentication(_)) => HttpResponse::json(
            500,
            &InternalError::CanisterError(CanisterError::NotAuthorized),
        ),
        Ok(create_channel::Response::Frozen) => {
            HttpResponse::json(500, &InternalError::CanisterError(CanisterError::Frozen))
        }
        Ok(other) => HttpResponse::json(
            500,
            &InternalError::CanisterError(CanisterError::Other(format!("{:?}", other))),
        ),
        Err((code, message)) => HttpResponse::json(500, &InternalError::C2CError(code, message)),
    }
}

pub fn map_delete_channel_response(result: CallResult<delete_channel::Response>) -> HttpResponse {
    match result {
        Ok(delete_channel::Response::Success) => HttpResponse::status(200),
        Ok(delete_channel::Response::FailedAuthentication(_)) => HttpResponse::json(
            500,
            &InternalError::CanisterError(CanisterError::NotAuthorized),
        ),
        Ok(delete_channel::Response::Frozen) => {
            HttpResponse::json(500, &InternalError::CanisterError(CanisterError::Frozen))
        }
        Ok(other) => HttpResponse::json(
            500,
            &InternalError::CanisterError(CanisterError::Other(format!("{:?}", other))),
        ),
        Err((code, message)) => HttpResponse::json(500, &InternalError::C2CError(code, message)),
    }
}
