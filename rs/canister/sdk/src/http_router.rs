use crate::async_handler::{AsyncHandler, BoxedHandler};
use ic_http_certification::HttpRequest as CanisterHttpRequest;
use ic_http_certification::HttpResponse as CanisterHttpResponse;
use oc_bots_sdk::types::BotApiKeyContext;
use oc_bots_sdk::types::TimestampMillis;
use oc_bots_sdk::types::TokenError;
use serde::Deserialize;
use serde::Serialize;
use std::str::FromStr;

#[derive(Default)]
pub struct HttpRouter {
    routes: Vec<Route>,
    fallback: Option<BoxedHandler<HttpRequest, HttpResponse>>,
}

impl HttpRouter {
    pub fn route<H: AsyncHandler<HttpRequest, HttpResponse>>(
        mut self,
        path_expr: &str,
        method: HttpMethod,
        handler: H,
    ) -> Self {
        self.routes.push(Route {
            path_expr: path_expr.to_string(),
            method,
            handler: BoxedHandler::new(handler),
        });
        self
    }

    pub fn fallback<H: AsyncHandler<HttpRequest, HttpResponse>>(mut self, handler: H) -> Self {
        self.fallback = Some(BoxedHandler::new(handler));
        self
    }

    pub async fn handle(&self, request: CanisterHttpRequest, query: bool) -> CanisterHttpResponse {
        let Ok(method) = request.method.parse() else {
            return HttpResponse::method_not_allowed().into();
        };

        if query && method == HttpMethod::POST {
            return HttpRouter::upgrade();
        } else if !query && method != HttpMethod::POST {
            return HttpResponse::method_not_allowed().into();
        }

        (self.handle_inner(method, request.into()).await).into()
    }

    async fn handle_inner(&self, method: HttpMethod, request: HttpRequest) -> HttpResponse {
        let lower_path = request.path.to_lowercase();

        if let Some(route) = self
            .routes
            .iter()
            .find(|route| Self::does_route_match(route, &lower_path, method))
        {
            route.handler.call(request).await
        } else if let Some(fallback) = &self.fallback {
            fallback.call(request).await
        } else {
            HttpResponse::not_found()
        }
    }

    fn does_route_match(route: &Route, path: &str, method: HttpMethod) -> bool {
        method == route.method && Self::does_path_match(&route.path_expr, path)
    }

    fn does_path_match(path_expr: &str, path: &str) -> bool {
        path_expr
            .strip_suffix('*')
            .map_or_else(|| path == path_expr, |prefix| path.starts_with(prefix))
    }

    fn upgrade() -> CanisterHttpResponse {
        CanisterHttpResponse {
            status_code: 200,
            headers: vec![
                ("Access-Control-Allow-Origin".to_string(), "*".to_string()),
                ("Access-Control-Allow-Headers".to_string(), "*".to_string()),
            ],
            body: Vec::new(),
            upgrade: Some(true),
        }
    }
}

struct Route {
    path_expr: String,
    method: HttpMethod,
    handler: BoxedHandler<HttpRequest, HttpResponse>,
}

#[derive(Debug)]
pub struct HttpRequest {
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpRequest {
    pub fn get_header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }

    pub fn extract_args<'a, Args: Deserialize<'a>>(&'a self) -> Result<Args, HttpResponse> {
        match serde_json::from_slice(&self.body) {
            Ok(args) => Ok(args),
            Err(error) => Err(HttpResponse::text(400, format!("Args invalid: {}", error))),
        }
    }

    pub fn extract_context(
        &self,
        public_key: &str,
        now: TimestampMillis,
    ) -> Result<BotApiKeyContext, HttpResponse> {
        if let Some(jwt) = self.get_header("x-oc-jwt") {
            BotApiKeyContext::parse_jwt(jwt.to_string(), public_key, now)
        } else if let Some(api_key) = self.get_header("x-oc-api-key") {
            BotApiKeyContext::parse_api_key(api_key.to_string())
        } else {
            Err(TokenError::Invalid("No auth token found".to_string()))
        }
        .map_err(|err| HttpResponse::text(400, format!("{err:?}")))
    }
}

impl From<CanisterHttpRequest> for HttpRequest {
    fn from(value: CanisterHttpRequest) -> Self {
        HttpRequest {
            path: value.get_path().unwrap_or_default(),
            headers: value.headers,
            body: value.body,
        }
    }
}

pub struct HttpResponse {
    pub status_code: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl HttpResponse {
    pub fn new(status_code: u16, body: Vec<u8>, mime_type: &str) -> HttpResponse {
        HttpResponse {
            status_code,
            headers: vec![
                ("content-type".to_string(), mime_type.to_string()),
                ("content-length".to_string(), body.len().to_string()),
                ("Access-Control-Allow-Origin".to_string(), "*".to_string()),
                ("Access-Control-Allow-Headers".to_string(), "*".to_string()),
            ],
            body,
        }
    }

    pub fn json<T>(status_code: u16, value: &T) -> HttpResponse
    where
        T: ?Sized + Serialize,
    {
        Self::new(
            status_code,
            serde_json::to_vec(value).unwrap(),
            "application/json",
        )
    }

    pub fn text(status_code: u16, text: String) -> HttpResponse {
        Self::new(status_code, text.into_bytes(), "text/plain")
    }

    pub fn not_found() -> Self {
        Self::status(404)
    }

    pub fn method_not_allowed() -> Self {
        Self::status(405)
    }

    pub fn status(status_code: u16) -> Self {
        Self {
            status_code,
            headers: Vec::new(),
            body: Vec::new(),
        }
    }
}

impl From<HttpResponse> for CanisterHttpResponse {
    fn from(value: HttpResponse) -> Self {
        CanisterHttpResponse {
            status_code: value.status_code,
            headers: value.headers,
            body: value.body,
            upgrade: None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HttpMethod {
    GET,
    POST,
}

impl FromStr for HttpMethod {
    type Err = ();

    fn from_str(method: &str) -> Result<Self, Self::Err> {
        if method.eq_ignore_ascii_case("GET") {
            Ok(HttpMethod::GET)
        } else if method.eq_ignore_ascii_case("POST") {
            Ok(HttpMethod::POST)
        } else {
            Err(())
        }
    }
}
