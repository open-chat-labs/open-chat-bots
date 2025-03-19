use futures::future::{ready, BoxFuture};
use http::{header::HeaderName, Request, Response, StatusCode};
use std::task::{Context, Poll};
use tower::{Layer, Service};

#[derive(Clone, Debug)]
pub struct OpenChatJwt(pub String);

impl OpenChatJwt {
    pub(crate) fn new(jwt: String) -> Self {
        Self(jwt)
    }
}

#[derive(Clone)]
pub struct ExtractJwtLayer {
    header_name: HeaderName,
}

impl ExtractJwtLayer {
    pub fn new() -> Self {
        Self {
            header_name: HeaderName::from_static("x-oc-jwt"),
        }
    }
}

impl Default for ExtractJwtLayer {
    fn default() -> Self {
        Self::new()
    }
}

impl<S> Layer<S> for ExtractJwtLayer {
    type Service = ExtractJwtMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        ExtractJwtMiddleware {
            inner,
            header_name: self.header_name.clone(),
        }
    }
}

#[derive(Clone)]
pub struct ExtractJwtMiddleware<S> {
    inner: S,
    header_name: HeaderName,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for ExtractJwtMiddleware<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send + 'static,
    S::Error: Send + 'static,
    S::Future: Send + 'static,
    ResBody: Send + Default + From<&'static str> + 'static,
{
    type Response = Response<ResBody>;
    type Error = S::Error;
    type Future = BoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: Request<ReqBody>) -> Self::Future {
        let header_value = req
            .headers()
            .get(&self.header_name)
            .ok_or("No authorization header found!")
            .and_then(|v| v.to_str().map_err(|_| "Failed to parse JWT header!"))
            .map(String::from);

        match header_value {
            Ok(jwt) => {
                req.extensions_mut().insert(OpenChatJwt::new(jwt));
            }
            Err(reason) => {
                let response = Response::builder()
                    .status(StatusCode::UNAUTHORIZED)
                    .body(ResBody::from(reason))
                    .unwrap();

                return Box::pin(ready(Ok(response)));
            }
        }

        Box::pin(self.inner.call(req))
    }
}
