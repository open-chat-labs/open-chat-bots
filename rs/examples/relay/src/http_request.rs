use crate::{execute_action_with_api_key, execute_action_with_jwt};
use ic_cdk::{query, update};
use ic_http_certification::{HttpRequest, HttpResponse};
use oc_bots_sdk::types::{BotAction, BotMessageAction, MessageContent, TextContent};

#[query]
fn http_request(request: HttpRequest) -> HttpResponse {
    if request.method.eq_ignore_ascii_case("POST") {
        if let Ok(path) = request.get_path() {
            if path == "/post_text_message" {
                return upgrade();
            }
        }
    }

    not_found()
}

#[update]
async fn http_request_update(request: HttpRequest) -> HttpResponse {
    if request.method.eq_ignore_ascii_case("POST") {
        if let Ok(path) = request.get_path() {
            if path == "/post_text_message" {
                let text = String::from_utf8(request.body).unwrap();
                let action = BotAction::SendMessage(BotMessageAction {
                    content: MessageContent::Text(TextContent { text }),
                    finalised: true,
                });

                if let Some(jwt) = request
                    .headers
                    .iter()
                    .find(|(k, _)| k.eq_ignore_ascii_case("authorization"))
                    .map(|(_, v)| v.clone())
                {
                    execute_action_with_jwt(action, jwt).await;
                } else if let Some(api_key) = request
                    .headers
                    .iter()
                    .find(|(k, _)| k.eq_ignore_ascii_case("x-api-key"))
                    .map(|(_, v)| v.clone())
                {
                    execute_action_with_api_key(action, api_key).await;
                }
            }
        }
    }

    not_found()
}

#[allow(dead_code)]
fn text_response(status_code: u16, body: String) -> HttpResponse {
    HttpResponse {
        status_code,
        headers: vec![
            ("content-type".to_string(), "text/plain".to_string()),
            ("content-length".to_string(), body.len().to_string()),
            ("Access-Control-Allow-Origin".to_string(), "*".to_string()),
            ("Access-Control-Allow-Headers".to_string(), "*".to_string()),
        ],
        body: body.into_bytes(),
        upgrade: Some(false),
    }
}

fn not_found() -> HttpResponse {
    HttpResponse {
        status_code: 404,
        headers: Vec::new(),
        body: Vec::new(),
        upgrade: None,
    }
}

fn upgrade() -> HttpResponse {
    HttpResponse {
        status_code: 200,
        headers: vec![
            ("Access-Control-Allow-Origin".to_string(), "*".to_string()),
            ("Access-Control-Allow-Headers".to_string(), "*".to_string()),
        ],
        body: Vec::new(),
        upgrade: Some(true),
    }
}
