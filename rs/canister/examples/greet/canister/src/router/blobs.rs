use oc_bots_sdk_canister::{HttpRequest, HttpResponse};

use crate::state;

pub async fn get(request: HttpRequest) -> HttpResponse {
    let Ok(blob_id) = request.path.trim_start_matches("/blobs/").parse::<u128>() else {
        return HttpResponse::not_found();
    };

    let Some((mime_type, body)) = state::read(|state| {
        state
            .get_blob(blob_id)
            .map(|blob| (blob.mime_type.clone(), blob.data.to_vec()))
    }) else {
        return HttpResponse::not_found();
    };

    HttpResponse::new(200, body, &mime_type)
}
