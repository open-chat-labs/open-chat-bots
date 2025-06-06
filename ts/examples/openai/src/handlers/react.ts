import { BotClient } from "@open-ic/openchat-botclient-ts";
import OpenAI from "openai";
import { ModeratableContent } from "../types";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/**
 * This demonstrates using OpenAI to perform a sort of general sentiment analysis on each incoming text message and
 * respond by reacting to the message with a suitable emoji
 */

async function askOpenAI(question: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    store: true,
    messages: [
      {
        role: "system",
        content:
          "respond to any text you are given with a single emoji that you think best represents the text. Do not use any words at all. Just respond with a single emoji.",
      },
      { role: "user", content: question },
    ],
  });
  return completion.choices[0].message.content;
}

export default async function react(
  client: BotClient,
  message: ModeratableContent
) {
  const txt =
    message.content.kind === "text_content"
      ? message.content.text
      : message.content.caption;
  if (txt === undefined) return;
  const answer = await askOpenAI(txt);
  if (answer) {
    client
      .addReaction(message.messageId, answer)
      .catch((err) => console.error("Error reacting to message", err));
  }
}
