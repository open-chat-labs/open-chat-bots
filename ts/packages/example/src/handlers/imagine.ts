import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";
import sharp from "sharp";

import OpenAI from "openai";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function resizeImage(data: Uint8Array | undefined) {
  if (data === undefined) return data;
  try {
    const resizedImageBuffer = await sharp(data)
      .resize(512, 512, {
        fit: sharp.fit.inside,
        withoutEnlargement: true,
      })
      .toBuffer();
    return new Uint8Array(resizedImageBuffer);
  } catch (error) {
    console.error("Error resizing image:", error);
  }
}

async function loadImageAsUint8Array(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    return uint8Array;
  } catch (error) {
    console.error("Error loading image:", error);
  }
}

async function imagine(prompt: string) {
  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
  });
  return response.data[0].url;
}

export default async function image(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const placeholder = (
    await client.createTextMessage("Thinking ...")
  ).setFinalised(false);
  res.status(200).json(success(placeholder));

  const prompt = client.stringArg("prompt");
  if (prompt === undefined) {
    res.status(400).send(argumentsInvalid());
  } else {
    imagine(prompt)
      .then((url) => {
        if (url !== undefined) {
          loadImageAsUint8Array(url)
            .then((data) => resizeImage(data))
            .then((data) => {
              if (data !== undefined) {
                client
                  .createImageMessage(data, "image/png", 512, 512)
                  .then((msg) => msg.setFinalised(true))
                  .then((msg) => client.sendMessage(msg));
              }
            });
        }
      })
      .catch((err) => console.log("sendImageMessage failed with: ", err));
  }
}
