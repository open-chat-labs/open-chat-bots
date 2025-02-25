use ic_http_certification::{HttpRequest, HttpResponse};
use oc_bots_sdk_canister::{HttpMethod::*, HttpRouter};
use std::sync::LazyLock;

mod commands;
mod definition;
mod metrics;

static ROUTER: LazyLock<HttpRouter> = LazyLock::new(init_router);

fn init_router() -> HttpRouter {
    HttpRouter::default()
        .route("/execute_command", POST, commands::execute)
        .route("/metrics", GET, metrics::get)
        .fallback(definition::get)
}

pub async fn handle(request: HttpRequest, query: bool) -> HttpResponse {
    ROUTER.handle(request, query).await
}
