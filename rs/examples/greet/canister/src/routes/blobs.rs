use oc_bots_sdk_canister::{Request, Response};

use crate::state;

pub async fn get(request: Request) -> Response {
    let Ok(blob_id) = request.path.trim_start_matches("/blobs/").parse::<u128>() else {
        return Response::not_found();
    };

    let Some((mime_type, body)) = state::read(|state| {
        state
            .get_blob(blob_id)
            .map(|blob| (blob.mime_type.clone(), blob.data.to_vec()))
    }) else {
        return Response::not_found();
    };

    Response::new(200, body, &mime_type)
}
