import { BotClient } from "@open-ic/openchat-botclient-ts";
import OpenAI from "openai";
import { ModeratableContent } from "../types";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// play with the mode to configure how the bot responds to dodgy messages
const mode: "react" | "delete" = "react";

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

export async function platformModerate(
  client: BotClient,
  message: ModeratableContent
): Promise<boolean> {
  // we *should* be able to moderate images as well but it's a bit tricky in dev environment
  if (message.content.kind === "image_content") return Promise.resolve(false);

  const moderation = await openai.moderations.create({
    model: "omni-moderation-latest",
    input: message.content.text,
  });
  if (moderation.results.length > 0) {
    const result = moderation.results[0];
    if (result.flagged) {
      await messageBreaksTheRules(client, message.messageId);
    }
    return result.flagged;
  }
  return Promise.resolve(false);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return dot / (normA * normB);
}

async function createEmbedding(input: string): Promise<number[]> {
  const result = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input,
    encoding_format: "float",
  });
  return result.data[0].embedding;
}

/**
 * A secondary experimental approach which, in practice, doesn't appear to work very well.
 */
export async function chatModerate2(
  client: BotClient,
  message: ModeratableContent
): Promise<boolean> {
  if (message.content.kind === "image_content") return false;

  const summary = await client.chatSummary();
  if (summary.kind === "group_chat" && summary.rules.enabled) {
    const [messageVector, rulesVector] = await Promise.all([
      createEmbedding(message.content.text),
      createEmbedding(summary.rules.text),
    ]);

    if (cosineSimilarity(messageVector, rulesVector) > 0.8) {
      await messageBreaksTheRules(client, message.messageId);
      return true;
    }
  }
  return false;
}

export async function chatModerate(
  client: BotClient,
  message: ModeratableContent
): Promise<boolean> {
  if (message.content.kind === "image_content") return false;

  // in a *real* bot we probably don't want to be calling this for every message - we can subscribe to rules changes and store them
  const summary = await client.chatSummary();
  if (summary.kind === "group_chat" && summary.rules.enabled) {
    const answer = await askOpenAI(summary.rules.text, message.content.text);
    if (answer === "Yes") {
      await messageBreaksTheRules(client, message.messageId);
      return true;
    }
  }
  return Promise.resolve(false);
}

async function messageBreaksTheRules(client: BotClient, messageId: bigint) {
  switch (mode) {
    case "react":
      {
        const resp = await client
          .addReaction(messageId, "💩")
          .catch((err) => console.error("Error reacting to message", err));
        if (resp?.kind !== "success") {
          console.error("Error reacting to message: ", resp);
        }
      }
      break;
    case "delete":
      {
        const resp = await client
          .deleteMessages([messageId])
          .catch((err) => console.error("Error deleting message", err));
        if (resp?.kind !== "success") {
          console.error("Error deleting message: ", resp);
        }
      }
      break;
  }
}
