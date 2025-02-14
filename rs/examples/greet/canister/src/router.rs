use ic_http_certification::{HttpRequest, HttpResponse};
use oc_bots_sdk_canister::{HttpMethod, HttpRouter};
use std::sync::LazyLock;

mod blobs;
mod commands;
mod definition;
mod metrics;

static ROUTER: LazyLock<HttpRouter> = LazyLock::new(|| {
    HttpRouter::default()
        .route("/execute_command", HttpMethod::POST, |request| {
            Box::new(Box::pin(commands::execute(request)))
        })
        .route("/metrics", HttpMethod::GET, |request| {
            Box::new(Box::pin(metrics::get(request)))
        })
        .route("/blobs/*", HttpMethod::GET, |request| {
            Box::new(Box::pin(blobs::get(request)))
        })
        .fallback(|request| Box::new(Box::pin(definition::get(request))))
});

pub async fn handle(request: HttpRequest, query: bool) -> HttpResponse {
    ROUTER.handle(request, query).await
}
