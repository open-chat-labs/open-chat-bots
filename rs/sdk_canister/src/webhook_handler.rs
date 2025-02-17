use oc_bots_sdk::{
    api::BadRequest,
    types::{BotApiKeyContext, TimestampMillis, TokenError},
};

use crate::Request;

pub fn extract_context(
    request: &Request,
    public_key: &str,
    now: TimestampMillis,
) -> Result<BotApiKeyContext, BadRequest> {
    if let Some(api_key) = request.get_header("x-oc-api-key") {
        return BotApiKeyContext::parse_api_key(api_key.to_string()).map_err(|error| match error {
            TokenError::Expired => BadRequest::AccessTokenExpired,
            TokenError::Invalid(_) => BadRequest::AccessTokenInvalid,
        });
    }

    if let Some(jwt) = request.get_header("x-oc-jwt") {
        return BotApiKeyContext::parse_jwt(jwt.to_string(), public_key, now)
            .map_err(|_| BadRequest::AccessTokenInvalid);
    }

    Err(BadRequest::AccessTokenNotFound)
}
