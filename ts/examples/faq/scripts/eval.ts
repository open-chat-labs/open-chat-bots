/**
 * Smoke-grade RAG evaluation for the FAQ bot.
 *
 * Reads (query, expected_keyword) pairs from FAQ_EVAL (default
 * ./data/eval.jsonl), runs each query against the configured embedding
 * provider + sqlite-vec index, and reports top-1 / top-k hit rate plus
 * embedding-call and sqlite-vec search latencies separately so the
 * remote-API time does not get reported as retrieval latency.
 *
 * A "hit" means the expected keyword appears (case-insensitive) somewhere
 * in the retrieved chunk text. This is intentionally coarse — it pins
 * regressions in retrieval quality without requiring chunk-id stability
 * across re-ingests.
 *
 * Usage: npm run eval
 *
 * Env:
 *   FAQ_EVAL    eval set path  (default ./data/eval.jsonl)
 *   FAQ_INDEX   sqlite-vec db  (default ./data/faq.db)
 *   FAQ_EVAL_K  top-k for hit rate (default 3)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { embed } from "../src/rag/embed";
import { openIndex, search } from "../src/rag/store";

interface EvalCase {
  query: string;
  expected_keyword: string;
}

function summarize(label: string, samples: number[]): void {
  if (samples.length === 0) return;
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p50 = sorted[Math.floor(samples.length * 0.5)];
  const p95 = sorted[Math.min(Math.floor(samples.length * 0.95), samples.length - 1)];
  console.log(`  ${label} p50/p95/avg: ${p50} / ${p95} / ${avg.toFixed(0)} ms`);
}

async function main() {
  const evalPath = path.resolve(process.cwd(), process.env.FAQ_EVAL || "./data/eval.jsonl");
  const indexPath = path.resolve(process.cwd(), process.env.FAQ_INDEX || "./data/faq.db");
  const k = parseInt(process.env.FAQ_EVAL_K || "3", 10);

  if (!fs.existsSync(evalPath)) {
    throw new Error(`Eval set not found: ${evalPath}`);
  }
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Index not found: ${indexPath}. Run "npm run ingest" first.`);
  }

  const cases: EvalCase[] = fs
    .readFileSync(evalPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));

  if (cases.length === 0) {
    throw new Error("Eval set is empty");
  }

  const db = openIndex(indexPath);
  let top1Hits = 0;
  let topKHits = 0;
  const embedMs: number[] = [];
  const searchMs: number[] = [];

  try {
    for (const c of cases) {
      const embedStart = Date.now();
      const queryVec = await embed(c.query);
      embedMs.push(Date.now() - embedStart);

      const searchStart = Date.now();
      const results = search(db, queryVec, k);
      searchMs.push(Date.now() - searchStart);

      const expected = c.expected_keyword.toLowerCase();
      const top1Hit = results.length > 0 && results[0].text.toLowerCase().includes(expected);
      const topKHit = results.some((r) => r.text.toLowerCase().includes(expected));

      if (top1Hit) top1Hits++;
      if (topKHit) topKHits++;

      const status = topKHit ? (top1Hit ? "PASS@1  " : `PASS@${k}  `) : "FAIL    ";
      console.log(`${status}${c.query}`);
    }
  } finally {
    db.close();
  }

  const n = cases.length;
  console.log("");
  console.log(`Results: ${n} queries, top-${k}`);
  console.log(`  top-1   hit rate: ${top1Hits}/${n}  = ${((top1Hits / n) * 100).toFixed(1)}%`);
  console.log(`  top-${k}   hit rate: ${topKHits}/${n}  = ${((topKHits / n) * 100).toFixed(1)}%`);
  summarize("embed   latency", embedMs);
  summarize("search  latency", searchMs);

  if (topKHits < n) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
