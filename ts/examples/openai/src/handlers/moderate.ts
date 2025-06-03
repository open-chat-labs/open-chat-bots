import {
  BotClient,
  MessageEvent,
  TextContent,
} from "@open-ic/openchat-botclient-ts";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// play with the mode to configure how the bot responds to dodgy messages
const mode: "react" | "delete" = "delete";

/**
 * This demonstrates reading the chat rules and providing them as context along with the message to OpenAI and getting
 * a ruling on whether the message violates the rules.
 */

async function askOpenAI(rules: string, message: string) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          'You are a moderator for a chat platform. Your task is to assess whether a message violates a given set of chat rules. Use only the provided rules. Do not apply any other critieria. Respond only with "Yes" or "No". "Yes" if if violates the rules, "No" if it does not. Do not explain or justify your answer.',
      },
      {
        role: "user",
        content: `Chat Rules:\n${rules}\n\nMessage:\n"${message}"\n\nDoes this message violate the chat rules? Yes or No?`,
      },
    ],
    temperature: 0,
  });
  return completion.choices[0].message.content;
}

export default async function moderate(
  client: BotClient,
  message: MessageEvent<TextContent>
): Promise<boolean> {
  // in a *real* bot we probably don't want to be calling this for every message - we can subscribe to rules changes and store them
  const summary = await client.chatSummary();
  if (summary.kind === "group_chat" && summary.rules.enabled) {
    const answer = await askOpenAI(summary.rules.text, message.content.text);
    if (answer === "Yes") {
      switch (mode) {
        case "react": {
          const resp = await client
            .addReaction(message.messageId, "💩")
            .catch((err) => console.error("Error reacting to message", err));
          if (resp?.kind !== "success") {
            console.error("Error reacting to message: ", resp);
          }
        }
        case "delete": {
          const resp = await client
            .deleteMessages([message.messageId])
            .catch((err) => console.error("Error deleting message", err));
          if (resp?.kind !== "success") {
            console.error("Error deleting message: ", resp);
          }
        }
      }
      return true;
    }
  }
  return Promise.resolve(false);
}
