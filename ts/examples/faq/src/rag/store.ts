/**
 * sqlite-vec backed FAQ index. Build with scripts/ingest.ts, query at runtime.
 */
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

export interface Chunk {
  id: number;
  text: string;
  score: number;
}

function openDb(path: string): Database.Database {
  const db = new Database(path);
  sqliteVec.load(db);
  return db;
}

export function initIndex(path: string, dim: number): Database.Database {
  const db = openDb(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
      embedding float[${dim}]
    );
  `);
  return db;
}

export function insertChunk(db: Database.Database, text: string, embedding: number[]): void {
  const info = db.prepare("INSERT INTO chunks (text) VALUES (?)").run(text);
  const id = info.lastInsertRowid as number;
  db.prepare("INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)")
    .run(id, Buffer.from(new Float32Array(embedding).buffer));
}

export function search(db: Database.Database, queryEmbedding: number[], k: number): Chunk[] {
  const rows = db
    .prepare(
      `SELECT chunks.id as id, chunks.text as text, vec_chunks.distance as distance
       FROM vec_chunks
       JOIN chunks ON chunks.id = vec_chunks.rowid
       WHERE vec_chunks.embedding MATCH ? AND k = ?
       ORDER BY vec_chunks.distance`
    )
    .all(Buffer.from(new Float32Array(queryEmbedding).buffer), k) as Array<{
    id: number;
    text: string;
    distance: number;
  }>;
  return rows.map((r) => ({ id: r.id, text: r.text, score: 1 - r.distance }));
}

export function openIndex(path: string): Database.Database {
  return openDb(path);
}
