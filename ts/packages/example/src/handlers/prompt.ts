import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";

import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function askOpenAI(question: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    store: true,
    messages: [{ role: "user", content: question }],
  });
  return completion.choices[0].message.content;
}

export default async function image(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const placeholder = (
    await client.createTextMessage("Thinking ...")
  ).setFinalised(false);
  res.status(200).json(success(placeholder));

  client
    .sendMessage(placeholder)
    .catch((err) => console.error("sendMessage failed with: ", err));

  const prompt = client.stringArg("prompt");
  if (prompt === undefined) {
    res.status(400).send(argumentsInvalid());
  } else {
    try {
      const answer = await askOpenAI(prompt);
      const msg = await client.createTextMessage(
        answer ?? "Hmmm - I'm sorry I didn't find an answer"
      );
      msg.setFinalised(true);
      msg.setBlockLevelMarkdown(true);
      client.sendMessage(msg);
    } catch (err) {
      console.log("Error processing the /prompt command");
    }
  }
}
