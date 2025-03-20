use crate::state;
use crate::state::Blob;
use async_trait::async_trait;
use oc_bots_sdk::api::command::{CommandHandler, SuccessResult};
use oc_bots_sdk::api::definition::*;
use oc_bots_sdk::create_thumbnail;
use oc_bots_sdk::oc_api::actions::send_message;
use oc_bots_sdk::oc_api::client::Client;
use oc_bots_sdk::types::MessageContentInitial;
use oc_bots_sdk::types::{BlobReference, BotCommandContext, ImageContent};
use oc_bots_sdk_canister::{env, CanisterRuntime};
use std::io::Cursor;
use std::sync::LazyLock;

static DEFINITION: LazyLock<BotCommandDefinition> = LazyLock::new(Fractal::definition);

pub struct Fractal;

#[async_trait]
impl CommandHandler<CanisterRuntime> for Fractal {
    fn definition(&self) -> &BotCommandDefinition {
        &DEFINITION
    }

    async fn execute(
        &self,
        oc_client: Client<CanisterRuntime, BotCommandContext>,
    ) -> Result<SuccessResult, String> {
        let cxt = oc_client.context();
        let r = cxt.command.arg("real");
        let i = cxt.command.arg("imaginary");

        let width = 400;
        let height = 400;

        let image_format = image::ImageFormat::Png;

        let bytes = Fractal::generate(width, height, r, i)
            .map_err(|error| format!("Failed to generate fractal: {error:?}"))?;

        let thumbnail_data = create_thumbnail(&bytes, image_format)
            .map_err(|error| format!("Failed to create thumbnail: {error:?}"))?;

        let mime_type = image_format.to_mime_type().to_string();

        let blob_id = state::mutate(|state| {
            state.store_blob(Blob {
                data: bytes,
                mime_type: mime_type.clone(),
            })
        });

        let content = ImageContent {
            mime_type,
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
        let message = oc_client
            .send_message(MessageContentInitial::Image(content))
            .execute_then_return_message(|args, response| match response {
                Ok(send_message::Response::Success(_)) => {
                    state::mutate(|state| state.increment_fractals_sent());
                }
                error => {
                    ic_cdk::println!("send_message: {args:?}, {error:?}");
                }
            });

        Ok(SuccessResult { message })
    }
}

impl Fractal {
    fn generate(w: u32, h: u32, r: f32, i: f32) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        // Generate Julia fractals
        let imgx = w;
        let imgy = h;

        let col_x = 255.0 / imgx as f32;
        let col_y = 255.0 / imgy as f32;

        let mut imgbuf = image::ImageBuffer::new(imgx, imgy);

        for (x, y, pixel) in imgbuf.enumerate_pixels_mut() {
            let r = (col_x * x as f32) as u8;
            let b = (col_y * y as f32) as u8;
            *pixel = image::Rgb([r, 0, b]);
        }

        let scalex = 3.0 / imgx as f32;
        let scaley = 3.0 / imgy as f32;

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

    fn definition() -> BotCommandDefinition {
        BotCommandDefinition {
            name: "fractal".to_string(),
            description: Some("This will generate a Julia fractal based on the provided input values. Find some examples here: https://paulbourke.net/fractals/juliaset/".to_string()),
            placeholder: Some("Please wait".to_string()),
            params: vec![
                BotCommandParam {
                    name: "real".to_string(),
                    description: Some("The real part of the complex number input".to_string()),
                    placeholder: Some("Enter the real part e.g. -0.4".to_string()), 
                    required: true,
                    param_type: BotCommandParamType::DecimalParam(DecimalParam {
                        min_value: -1.0,
                        max_value: 1.0,
                        choices: vec![],
                    }),
                },
                BotCommandParam {
                    name: "imaginary".to_string(),
                    description: Some("The imaginary part of the complex number input".to_string()),
                    placeholder: Some("Enter the imaginary part e.g. 0.6".to_string()), 
                    required: true,
                    param_type: BotCommandParamType::DecimalParam(DecimalParam {
                        min_value: -1.0,
                        max_value: 1.0,
                        choices: vec![],
                    }),
                },
            ],
            permissions: BotPermissions::from_message_permission(MessagePermission::Image),
            default_role: None,
            direct_messages: false,
        }
    }
}
