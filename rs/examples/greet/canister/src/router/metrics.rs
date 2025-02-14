use crate::state::{self};
use oc_bots_sdk_canister::{Request, Response};

pub async fn get(_request: Request) -> Response {
    state::read(|state| Response::json(200, state.metrics()))
}
