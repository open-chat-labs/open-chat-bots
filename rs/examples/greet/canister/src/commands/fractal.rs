use crate::state;
use crate::state::Blob;
use oc_bots_sdk::api::{
    BadRequest, BotPermissions, Command, DecimalParam, InternalError, MessagePermission, SendMessageResponse, SlashCommandParam, SlashCommandParamType, SlashCommandSchema, SuccessResult
};
use oc_bots_sdk::create_thumbnail;
use oc_bots_sdk::types::MessageContent;
use oc_bots_sdk::types::{BlobReference, BotCommandContext, ImageContent};
use oc_bots_sdk_canister::{env, OPENCHAT_CLIENT};
use std::collections::HashSet;
use std::io::Cursor;

pub fn parse_arguments(command: &Command) -> Result<(f32, f32), BadRequest> {
    let r = command.get_arg("real").and_then(|r| r.value.as_decimal()).ok_or(BadRequest::ArgsInvalid)? as f32;
    let i = command.get_arg("imaginary").and_then(|i| i.value.as_decimal()).ok_or(BadRequest::ArgsInvalid)? as f32;

    if !(-1.0..=1.0).contains(&r) || !(-1.0..=1.0).contains(&i) {
        return Err(BadRequest::ArgsInvalid);
    }

    Ok((r, i))
}

pub fn execute(
    context: BotCommandContext,
    r: f32,
    i: f32,
) -> Result<SuccessResult, InternalError> {
    let width = 800;
    let height = 800;
    let image_format = image::ImageFormat::Png;
    
    let bytes = generate_fractal(width, height, r, i)
        .map_err(|error| InternalError::Invalid(format!("Failed to generate fractal: {error:?}")))?;

    let thumbnail_data = create_thumbnail(&bytes, image_format)
        .map_err(|error| InternalError::Invalid(format!("Failed to create thumbnail: {error:?}")))?;

    let blob_id = state::mutate(|state| state.store_blob(Blob {
        data: bytes,
        mime_type: image_format.to_mime_type().to_string(),
    }));

    let content = ImageContent {
        mime_type: image_format.to_mime_type().to_string(),
        width,
        height,
        caption: None,
        blob_reference: Some(BlobReference {
            canister_id: env::canister_id(),
            blob_id,
        }),
        thumbnail_data,
    };

    // Send the message to OpenChat but don't wait for the response
    let message = OPENCHAT_CLIENT
        .with_command_context(context)
        .send_message(MessageContent::Image(content))
        .execute(|args, response| match response {
            Ok(result) if matches!(result.0, SendMessageResponse::Success(_)) => {
                state::mutate(|state| state.increment_fractals_sent());
            }
            error => {
                ic_cdk::println!("send_message: {args:?}, {error:?}");
            }
        });

    Ok(SuccessResult {
        message: Some(message),
    })
}

pub fn schema() -> SlashCommandSchema {
    SlashCommandSchema {
        name: "fractal".to_string(),
        description: Some("This will generate a Julia fractal based on the provided input values. Find some examples here: https://paulbourke.net/fractals/juliaset/".to_string()),
        placeholder: Some("Please wait".to_string()),
        params: vec![
            SlashCommandParam {
                name: "real".to_string(),
                description: Some("The real part of the complex number input".to_string()),
                placeholder: Some("Enter the real part e.g. -0.4".to_string()), 
                required: true, 
                param_type: SlashCommandParamType::DecimalParam(DecimalParam {
                    min_value: -1.0, 
                    max_value: 1.0, 
                    choices: vec![],
                }), 
            },
            SlashCommandParam {
                name: "imaginary".to_string(),
                description: Some("The imaginary part of the complex number input".to_string()),
                placeholder: Some("Enter the imaginary part e.g. 0.6".to_string()), 
                required: true, 
                param_type: SlashCommandParamType::DecimalParam(DecimalParam {
                    min_value: -1.0, 
                    max_value: 1.0, 
                    choices: vec![],
                }), 
            },
        ],
        permissions: BotPermissions {
            community: HashSet::new(),
            chat: HashSet::new(),
            message: HashSet::from_iter([MessagePermission::Image]),
        },
    }
}

fn generate_fractal(w: u32, h: u32, r: f32, i: f32) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    // Generate Julia fractals
    let imgx = w;
    let imgy = h;

    let scalex = 3.0 / imgx as f32;
    let scaley = 3.0 / imgy as f32;

    let mut imgbuf = image::ImageBuffer::new(imgx, imgy);

    for (x, y, pixel) in imgbuf.enumerate_pixels_mut() {
        let r = (0.3 * x as f32) as u8;
        let b = (0.3 * y as f32) as u8;
        *pixel = image::Rgb([r, 0, b]);
    }

    for x in 0..imgx {
        for y in 0..imgy {
            let cx = y as f32 * scalex - 1.5;
            let cy = x as f32 * scaley - 1.5;

            let c = num_complex::Complex::new(r, i);
            let mut z = num_complex::Complex::new(cx, cy);

            let mut i = 0;
            while i < 255 && z.norm() <= 2.0 {
                z = z * z + c;
                i += 1;
            }

            let pixel = imgbuf.get_pixel_mut(x, y);
            let image::Rgb(data) = *pixel;
            *pixel = image::Rgb([data[0], i as u8, data[2]]);
        }
    }

    let mut bytes: Vec<u8> = Vec::new();
    imgbuf.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)?;
    Ok(bytes)
}
