use crate::state::{self};
use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

pub async fn get(_request: HttpRequest) -> HttpResponse {
    state::read(|state| HttpResponse::json(200, &state.metrics()))
}
