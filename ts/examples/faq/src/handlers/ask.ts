import { Response } from "express";
import fs from "fs";
import path from "path";
import { argumentsInvalid } from "@open-ic/openchat-botclient-ts";
import { WithBotClient } from "../types";
import { success } from "./success";
import { embed } from "../rag/embed";
import { chat, ChatMessage } from "../rag/llm";
import { openIndex, search, Chunk } from "../rag/store";

const indexPath = path.resolve(process.cwd(), process.env.FAQ_INDEX || "./data/faq.db");

function resolveTopK(raw: string | undefined): number {
  const fallback = 4;
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}
const topK = resolveTopK(process.env.TOP_K);

let cachedDb: ReturnType<typeof openIndex> | null = null;
function getDb() {
  if (!cachedDb) {
    if (!fs.existsSync(indexPath)) {
      throw new Error(
        `FAQ index not found at ${indexPath}. Run \`npm run ingest\` to build it.`
      );
    }
    cachedDb = openIndex(indexPath);
  }
  return cachedDb;
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

  const question = client.stringArg("question");
  if (question === undefined) {
    res.status(400).send(argumentsInvalid());
    return;
  }

  try {
    const placeholder = (
      await client.createTextMessage("Searching the FAQ...")
    ).setFinalised(false);
    res.status(200).json(success(placeholder));

    const db = getDb();
    const queryEmbedding = await embed(question);
    const chunks = search(db, queryEmbedding, topK);

    let finalText: string;
    if (chunks.length === 0) {
      finalText = "I could not find anything relevant in the FAQ to answer that.";
    } else {
      const messages = buildPrompt(question, chunks);
      const answer = await chat(messages);
      finalText = answer.trim();
    }

    const msg = (await client.createTextMessage(finalText))
      .setFinalised(true)
      .setBlockLevelMarkdown(true);
    await client.sendMessage(msg);
  } catch (err) {
    console.error("ask handler failed:", err);
    if (!res.headersSent) {
      res.status(500).send("Internal server error");
      return;
    }
    try {
      const msg = (await client.createTextMessage(
        "Sorry, I ran into an error while answering. Please try again later."
      )).setFinalised(true);
      await client.sendMessage(msg);
    } catch (sendErr) {
      console.error("ask handler failed to report error:", sendErr);
    }
  }
}
