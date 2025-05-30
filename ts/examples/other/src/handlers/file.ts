import { Response } from "express";
import fs from "fs";
import mime from "mime-types";
import { WithBotClient } from "../types";
import { success } from "./success";

async function processFile(filePath: string) {
  try {
    const buffer = fs.readFileSync(filePath);
    const uint8Array = new Uint8Array(buffer);
    const mimeType = mime.lookup(filePath) || "application/octet-stream";
    const fileSize = buffer.length;
    console.log(`File loaded successfully:`);
    console.log(`  MIME Type: ${mimeType}`);
    console.log(`  Size: ${(fileSize / 1024).toFixed(2)} KB`);

    return { uint8Array, mimeType, fileSize };
  } catch (err) {
    console.error("Error loading file:", err);
    throw err;
  }
}

export default async function file(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const placeholder = (
    await client.createTextMessage("Uploading file ...")
  ).setFinalised(false);

  client.sendMessage(placeholder);

  res.status(200).json(success(placeholder));

  const filePath = "./dummy.pdf";
  const { uint8Array, fileSize, mimeType } = await processFile(filePath);

  client
    .createFileMessage(filePath, uint8Array, mimeType, fileSize)
    .then((fileMsg) =>
      client.sendMessage(fileMsg.setCaption("This is a test file message"))
    )
    .catch((err) => console.log("sendFileMessage failed with: ", err));
}
