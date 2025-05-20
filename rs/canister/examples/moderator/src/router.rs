use ic_http_certification::{HttpRequest, HttpResponse};
use oc_bots_sdk_canister::{HttpMethod::*, HttpRouter};
use std::sync::LazyLock;

mod definition;
mod events;

static ROUTER: LazyLock<HttpRouter> = LazyLock::new(init_router);

fn init_router() -> HttpRouter {
    HttpRouter::default()
        .route("/notify", POST, events::execute)
        .fallback(definition::get)
}

pub async fn handle(request: HttpRequest, query: bool) -> HttpResponse {
    ROUTER.handle(request, query).await
}
