import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";

import OpenAI from "openai";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
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

  const prompt = client.stringArg("prompt");
  if (prompt === undefined) {
    res.status(400).send(argumentsInvalid());
  } else {
    askOpenAI(prompt)
      .then((answer) => {
        client
          .createTextMessage(
            answer ?? "Hmmm - I'm sorry I didn't find an answer"
          )
          .then((msg) => msg.setFinalised(true).setBlockLevelMarkdown(true))
          .then((msg) => client.sendMessage(msg));
      })
      .catch((err) => console.log("sendImageMessage failed with: ", err));
  }
}
