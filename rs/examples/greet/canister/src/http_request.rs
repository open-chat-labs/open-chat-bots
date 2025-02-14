use crate::router;
use ic_cdk::{query, update};
use ic_http_certification::{HttpRequest, HttpResponse};

#[query]
async fn http_request(request: HttpRequest) -> HttpResponse {
    router::handle(request, true).await
}

#[update]
async fn http_request_update(request: HttpRequest) -> HttpResponse {
    router::handle(request, false).await
}
