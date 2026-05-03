/**
 * Build the FAQ vector index from a markdown source.
 *
 * Usage: npm run ingest
 *
 * Splits FAQ_SOURCE on blank lines into chunks. Heading-only chunks (e.g.
 * `## Question`) are merged into the following content chunk so question
 * wording stays in the embedded text. Each resulting chunk is embedded via
 * the configured EMBEDDING_PROVIDER and written to FAQ_INDEX (sqlite-vec).
 *
 * Writes to FAQ_INDEX.tmp first and atomically renames into place on
 * success, so a mid-build failure leaves the previous index untouched
 * rather than partially overwritten.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { embed } from "../src/rag/embed";
import { initIndex, insertChunk } from "../src/rag/store";

function isHeadingOnly(chunk: string): boolean {
  const lines = chunk.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.length > 0 && lines.every((l) => /^#{1,6}\s/.test(l));
}

function splitChunks(raw: string): string[] {
  const rawChunks = raw
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const chunks: string[] = [];
  let pendingHeading = "";
  for (const c of rawChunks) {
    if (isHeadingOnly(c)) {
      // Stack consecutive heading-only chunks (e.g. h1 followed by h2) so the
      // most specific heading is preserved with the content that follows.
      pendingHeading = pendingHeading ? `${pendingHeading}\n${c}` : c;
    } else {
      chunks.push(pendingHeading ? `${pendingHeading}\n\n${c}` : c);
      pendingHeading = "";
    }
  }
  // Trailing heading with no content: drop. A heading by itself carries no
  // answer text, so embedding it alone is not useful for retrieval.
  return chunks;
}

async function main() {
  const sourcePath = path.resolve(process.cwd(), process.env.FAQ_SOURCE || "./data/faq.md");
  const indexPath = path.resolve(process.cwd(), process.env.FAQ_INDEX || "./data/faq.db");
  const tmpPath = `${indexPath}.tmp`;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`FAQ source not found: ${sourcePath}`);
  }

  const raw = fs.readFileSync(sourcePath, "utf8");
  const chunks = splitChunks(raw);

  if (chunks.length === 0) {
    throw new Error("No chunks found in FAQ source");
  }

  console.log(`Embedding ${chunks.length} chunks from ${sourcePath}...`);
  const first = await embed(chunks[0]);
  const dim = first.length;
  console.log(`Embedding dimension: ${dim}`);

  // Build into a temp file so a mid-build failure does not corrupt the
  // existing index. Rename atomically once all chunks are persisted.
  if (fs.existsSync(tmpPath)) {
    fs.unlinkSync(tmpPath);
  }
  const db = initIndex(tmpPath, dim);

  try {
    insertChunk(db, chunks[0], first);
    for (let i = 1; i < chunks.length; i++) {
      const vec = await embed(chunks[i]);
      insertChunk(db, chunks[i], vec);
      if ((i + 1) % 10 === 0) {
        console.log(`  ${i + 1}/${chunks.length} embedded`);
      }
    }
  } catch (err) {
    db.close();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    throw err;
  }
  db.close();

  fs.renameSync(tmpPath, indexPath);
  console.log(`Index written to ${indexPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
