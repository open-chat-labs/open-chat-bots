use crate::async_handler::{AsyncHandler, BoxedHandler};
use ic_http_certification::{HttpRequest, HttpResponse};
use serde::Serialize;
use std::str::FromStr;

#[derive(Default)]
pub struct HttpRouter {
    routes: Vec<Route>,
    fallback: Option<BoxedHandler<Request, Response>>,
}

impl HttpRouter {
    pub fn route<H: AsyncHandler<Request, Response>>(
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

    pub fn fallback<H: AsyncHandler<Request, Response>>(mut self, handler: H) -> Self {
        self.fallback = Some(BoxedHandler::new(handler));
        self
    }

    pub async fn handle(&self, request: HttpRequest, query: bool) -> HttpResponse {
        let Ok(method) = request.method.parse() else {
            return Response::method_not_allowed().into();
        };

        if query && method == HttpMethod::POST {
            return HttpRouter::upgrade();
        } else if !query && method != HttpMethod::POST {
            return Response::method_not_allowed().into();
        }

        (self.handle_inner(method, request.into()).await).into()
    }

    async fn handle_inner(&self, method: HttpMethod, request: Request) -> Response {
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
            Response::not_found()
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
}

struct Route {
    path_expr: String,
    method: HttpMethod,
    handler: BoxedHandler<Request, Response>,
}

pub struct Request {
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl From<HttpRequest> for Request {
    fn from(value: HttpRequest) -> Self {
        Request {
            path: value.get_path().unwrap_or_default(),
            headers: value.headers,
            body: value.body,
        }
    }
}

pub struct Response {
    pub status_code: u16,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Response {
    pub fn new(status_code: u16, body: Vec<u8>, mime_type: &str) -> Response {
        Response {
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

    pub fn json<T>(status_code: u16, value: &T) -> Response
    where
        T: ?Sized + Serialize,
    {
        Self::new(
            status_code,
            serde_json::to_vec(value).unwrap(),
            "application/json",
        )
    }

    pub fn text(status_code: u16, text: String) -> Response {
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

impl From<Response> for HttpResponse {
    fn from(value: Response) -> Self {
        HttpResponse {
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
