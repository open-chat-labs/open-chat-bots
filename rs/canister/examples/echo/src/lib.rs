use ic_cdk::{query, update};
use ic_http_certification::{HttpRequest, HttpResponse};

pub mod lifecycle;
pub mod memory;
pub mod router;
pub mod state;

#[query]
async fn http_request(request: HttpRequest) -> HttpResponse {
    router::handle(request, true).await
}

#[update]
async fn http_request_update(request: HttpRequest) -> HttpResponse {
    router::handle(request, false).await
}
