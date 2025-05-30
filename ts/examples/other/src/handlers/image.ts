import { Response } from "express";
import sharp from "sharp";
import { WithBotClient } from "../types";
import { success } from "./success";
import path from "path";

const MAX_SIZE_BYTES = 0.5 * 1024 * 1024;

async function processImage(filePath: string) {
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();
    let buffer = await image.toBuffer();
    let width = metadata.width;
    let height = metadata.height;

    while (buffer.length > MAX_SIZE_BYTES) {
      const scaleFactor = Math.sqrt(MAX_SIZE_BYTES / buffer.length);
      width = Math.round((width ?? 0) * scaleFactor);
      height = Math.round((height ?? 0) * scaleFactor);
      buffer = await image.resize({ width, height }).toBuffer();
    }

    console.log(`Final Dimensions: ${width}x${height}`);
    console.log(`Final Size: ${(buffer.length / 1024).toFixed(2)} KB`);
    const uint8Array = new Uint8Array(buffer);
    return {
      uint8Array,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      format: metadata.format,
    };
  } catch (err) {
    console.error("Error processing image:", err);
    throw err;
  }
}

export default async function image(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const filePath = path.join(__dirname, "..", "..", "picture.png");
  const { uint8Array, width, height, format } = await processImage(filePath);
  const imgMsg = (
    await client.createImageMessage(
      uint8Array,
      `image/${format}`,
      width,
      height
    )
  )
    .setCaption("This is a test image")
    .setFinalised(true);
  res.status(200).json(success(imgMsg));
  client
    .sendMessage(imgMsg)
    .catch((err) => console.log("sendImageMessage failed with: ", err));
}
