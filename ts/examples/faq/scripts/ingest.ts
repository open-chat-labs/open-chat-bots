/**
 * Build the FAQ vector index from a markdown source.
 *
 * Usage: npm run ingest
 *
 * Splits FAQ_SOURCE on blank lines into chunks, embeds each chunk via the
 * configured EMBEDDING_PROVIDER, and writes them to FAQ_INDEX (sqlite-vec).
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { embed } from "../src/rag/embed";
import { initIndex, insertChunk } from "../src/rag/store";

async function main() {
  const sourcePath = path.resolve(process.cwd(), process.env.FAQ_SOURCE || "./data/faq.md");
  const indexPath = path.resolve(process.cwd(), process.env.FAQ_INDEX || "./data/faq.db");

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`FAQ source not found: ${sourcePath}`);
  }

  const raw = fs.readFileSync(sourcePath, "utf8");
  const chunks = raw
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  if (chunks.length === 0) {
    throw new Error("No chunks found in FAQ source");
  }

  console.log(`Embedding ${chunks.length} chunks from ${sourcePath}...`);
  const first = await embed(chunks[0]);
  const dim = first.length;
  console.log(`Embedding dimension: ${dim}`);

  if (fs.existsSync(indexPath)) {
    fs.unlinkSync(indexPath);
  }
  const db = initIndex(indexPath, dim);

  insertChunk(db, chunks[0], first);
  for (let i = 1; i < chunks.length; i++) {
    const vec = await embed(chunks[i]);
    insertChunk(db, chunks[i], vec);
    if ((i + 1) % 10 === 0) {
      console.log(`  ${i + 1}/${chunks.length} embedded`);
    }
  }
  db.close();
  console.log(`Index written to ${indexPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
