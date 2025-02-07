use std::io::Cursor;

use crate::types::ThumbnailData;

pub fn create_thumbnail(
    image: &[u8],
    format: image::ImageFormat,
) -> Result<ThumbnailData, Box<dyn std::error::Error>> {
    let img = image::load_from_memory(image)?;
    let thumbnail = img.thumbnail(30, 30);
    let mut bytes: Vec<u8> = Vec::new();
    thumbnail.write_to(&mut Cursor::new(&mut bytes), format)?;

    let mut data_uri = dataurl::DataUrl::new();
    data_uri.set_is_base64_encoded(true);
    data_uri.set_media_type(Some(format.to_mime_type().to_string()));
    data_uri.set_data(&bytes);

    Ok(ThumbnailData(data_uri.to_string()))
}
