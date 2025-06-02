import { Response } from "express";
import { WithBotClient } from "../types";
import { success } from "./success";

import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

async function askOpenAI(msgs: ChatCompletionMessageParam[]) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    store: true,
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant. You favour short concise answers. You do not use bullet lists.",
      },
      ...msgs,
    ],
  });
  return completion.choices[0].message.content;
}

export default async function prompt(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const placeholder = (
    await client.createTextMessage("Thinking ...")
  ).setFinalised(false);
  res.status(200).json(success(placeholder));

  const prompt = client.stringArg("prompt");
  if (prompt === undefined) {
    res.status(400).send(argumentsInvalid());
  } else {
    const chat = await client.chatSummary();
    if (chat.kind !== "error") {
      const resp = await client.chatEvents({
        kind: "chat_events_page",
        ascending: false,
        startEventIndex: chat.latestEventIndex,
        maxEvents: 50,
        maxMessages: 20,
      });
      if (resp.kind === "success") {
        const msgs: ChatCompletionMessageParam[] = [];
        for (const ev of resp.events.reverse()) {
          if (
            ev.event.kind === "message" &&
            ev.event.content.kind === "text_content"
          ) {
            if (ev.event.sender === client.command?.initiator) {
              msgs.push({ role: "user", content: ev.event.content.text });
            } else {
              msgs.push({ role: "assistant", content: ev.event.content.text });
            }
          }
        }
        msgs.push({ role: "user", content: prompt });
        askOpenAI(msgs)
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
  }
}
