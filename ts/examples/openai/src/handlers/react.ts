import { Request, Response } from "express";

import { BotClient } from "@open-ic/openchat-botclient-ts";
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

export default async function react(
  client: BotClient,
  eventIndex: number,
  req: Request,
  res: Response
) {
  const resp = await client.chatEvents({
    kind: "chat_events_by_index",
    eventIndexes: [eventIndex],
  });
  if (resp.kind === "success") {
    if (resp.events[0].event.kind === "message") {
      console.log("A message has arrived: ", resp.events[0].event.content);
    }
  }

  //   const placeholder = (
  //     await client.createTextMessage("Thinking ...")
  //   ).setFinalised(false);
  //   res.status(200).json(success(placeholder));

  //   const prompt = client.stringArg("prompt");
  //   if (prompt === undefined) {
  //     res.status(400).send(argumentsInvalid());
  //   } else {
  //     askOpenAI(prompt)
  //       .then((answer) => {
  //         client
  //           .createTextMessage(
  //             answer ?? "Hmmm - I'm sorry I didn't find an answer"
  //           )
  //           .then((msg) => msg.setFinalised(true).setBlockLevelMarkdown(true))
  //           .then((msg) => client.sendMessage(msg));
  //       })
  //       .catch((err) => console.log("sendImageMessage failed with: ", err));
  // }
}
