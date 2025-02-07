use crate::commands::execute_command;
use crate::get_definition::get_definition;
use crate::state;
use ic_cdk::{query, update};
use ic_http_certification::{HttpRequest, HttpResponse};
use oc_bots_sdk::api::CommandResponse;
use serde::Serialize;
use std::str;

#[query]
fn http_request(request: HttpRequest) -> HttpResponse {
    if request.method.eq_ignore_ascii_case("GET") {
        if let Ok(path) = request.get_path() {
            if path == "/metrics" {
                let body = state::read(|state| to_json(state.metrics()));
                return text_response(200, body);
            }

            if path.starts_with("/blobs/") {
                let Ok(blob_id) = path.trim_start_matches("/blobs/").parse::<u128>() else {
                    return not_found();
                };

                let Some((mime_type, body)) = state::read(|state| {
                    state
                        .get_blob(blob_id)
                        .map(|blob| (blob.mime_type.clone(), blob.data.to_vec()))
                }) else {
                    return not_found();
                };

                return HttpResponse {
                    status_code: 200,
                    headers: vec![
                        ("content-type".to_string(), mime_type),
                        ("content-length".to_string(), body.len().to_string()),
                    ],
                    body,
                    upgrade: None,
                };
            }
        }

        // Return the `bot definition` regardless of the path
        let body = to_json(&get_definition());
        return text_response(200, body);
    }

    if request.method.eq_ignore_ascii_case("POST") {
        if let Ok(path) = request.get_path() {
            if path == "/execute_command" {
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
            if path == "/execute_command" {
                let (status_code, body) = match str::from_utf8(&request.body) {
                    Ok(jwt) => match execute_command(jwt).await {
                        CommandResponse::Success(r) => (200, to_json(&r)),
                        CommandResponse::BadRequest(r) => (400, to_json(&r)),
                        CommandResponse::InternalError(r) => (500, to_json(&r)),
                    },
                    Err(error) => (400, format!("Invalid access token: {:?}", error)),
                };

                return text_response(status_code, body);
            }
        }
    }

    not_found()
}

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

fn to_json<T>(value: &T) -> String
where
    T: ?Sized + Serialize,
{
    serde_json::to_string(value).unwrap()
}
