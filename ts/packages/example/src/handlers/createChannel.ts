import { Request, Response } from "express";
import sharp from "sharp";
import { WithBotClient } from "../types";
import path from "path";

function hasBotClient(req: Request): req is WithBotClient {
  return (req as WithBotClient).botClient !== undefined;
}

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
    return new Uint8Array(buffer);
  } catch (err) {
    console.error("Error processing image:", err);
    throw err;
  }
}

export default async function createChannel(req: Request, res: Response) {
  if (!hasBotClient(req)) {
    res.status(500).send("Bot client not initialised");
    return;
  }

  const client = req.botClient;
  const imagePath = path.join(__dirname, "..", "..", "picture.png");
  const imageData = await processImage(imagePath);

  const resp = await client.createChannel(
    req.body,
    "This is a test channel created by a bot",
    { avatar: imageData }
  );
  if ("Success" in resp) {
    console.log("Successfully created channel");
    res.sendStatus(200);
  } else {
    res.send(500).json(resp);
  }
}
