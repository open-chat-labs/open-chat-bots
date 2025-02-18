use oc_bots_sdk::{
    api::BadRequest,
    types::{AuthToken, BotApiKeyContext, TimestampMillis, TokenError},
};

use crate::HttpRequest;

pub fn extract_from_headers(
    request: &HttpRequest,
    public_key: &str,
    now: TimestampMillis,
) -> Result<BotApiKeyContext, BadRequest> {
    let auth_token = auth_token_from_headers(request)?;
    extract(auth_token, public_key, now)
}

pub fn extract(
    auth_token: AuthToken,
    public_key: &str,
    now: TimestampMillis,
) -> Result<BotApiKeyContext, BadRequest> {
    match auth_token {
        AuthToken::Jwt(jwt) => BotApiKeyContext::parse_jwt(jwt, public_key, now)
            .map_err(|_| BadRequest::AccessTokenInvalid),
        AuthToken::ApiKey(api_key) => {
            BotApiKeyContext::parse_api_key(api_key).map_err(|error| match error {
                TokenError::Expired => BadRequest::AccessTokenExpired,
                TokenError::Invalid(_) => BadRequest::AccessTokenInvalid,
            })
        }
    }
}

fn auth_token_from_headers(request: &HttpRequest) -> Result<AuthToken, BadRequest> {
    if let Some(jwt) = request.get_header("x-oc-jwt") {
        return Ok(AuthToken::Jwt(jwt.to_string()));
    }

    if let Some(api_key) = request.get_header("x-oc-api-key") {
        return Ok(AuthToken::ApiKey(api_key.to_string()));
    }

    Err(BadRequest::AccessTokenNotFound)
}
