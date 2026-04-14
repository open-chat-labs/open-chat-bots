import { Response } from "express";
import path from "path";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import { WithBotClient } from "../types";
import { success } from "./success";
import { embed } from "../rag/embed";
import { chat, ChatMessage } from "../rag/llm";
import { openIndex, search, Chunk } from "../rag/store";

const indexPath = path.resolve(process.cwd(), process.env.FAQ_INDEX || "./data/faq.db");
const topK = Number(process.env.TOP_K || 4);

let dbPromise: ReturnType<typeof openIndex> | null = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = openIndex(indexPath);
  }
  return dbPromise;
}

function buildPrompt(question: string, chunks: Chunk[]): ChatMessage[] {
  const context = chunks.map((c, i) => `[${i + 1}] ${c.text}`).join("\n\n");
  return [
    {
      role: "system",
      content:
        "You are a helpful FAQ assistant. Answer the user's question using only the provided context. " +
        "If the context does not contain the answer, say so honestly. Keep answers concise.",
    },
    {
      role: "user",
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    },
  ];
}

export default async function ask(req: WithBotClient, res: Response) {
  const client = req.botClient;
  const placeholder = (
    await client.createTextMessage("Searching the FAQ...")
  ).setFinalised(false);
  res.status(200).json(success(placeholder));

  const question = client.stringArg("question");
  if (question === undefined) {
    res.status(400).send(argumentsInvalid());
    return;
  }

  try {
    const db = getDb();
    const queryEmbedding = await embed(question);
    const chunks = search(db, queryEmbedding, topK);
    const messages = buildPrompt(question, chunks);
    const answer = await chat(messages);
    const finalText = answer && answer.trim().length > 0
      ? answer
      : "I could not find an answer in the FAQ.";
    const msg = (await client.createTextMessage(finalText))
      .setFinalised(true)
      .setBlockLevelMarkdown(true);
    await client.sendMessage(msg);
  } catch (err) {
    console.error("ask handler failed:", err);
    const msg = (await client.createTextMessage(
      "Sorry, I ran into an error while answering. Please try again later."
    )).setFinalised(true);
    await client.sendMessage(msg);
  }
}
