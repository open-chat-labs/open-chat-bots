/**
 * Embedding provider. Default: Hugging Face Inference API (free tier).
 * Swap via EMBEDDING_PROVIDER env var.
 */

export async function embed(text: string): Promise<number[]> {
  const provider = process.env.EMBEDDING_PROVIDER || "hf";
  switch (provider) {
    case "hf":
      return embedHuggingFace(text);
    default:
      throw new Error(`Unknown EMBEDDING_PROVIDER: ${provider}`);
  }
}

async function embedHuggingFace(text: string): Promise<number[]> {
  const model = process.env.HF_EMBEDDING_MODEL || "sentence-transformers/all-MiniLM-L6-v2";
  const token = process.env.HF_TOKEN;
  if (!token) {
    throw new Error("HF_TOKEN is required for the Hugging Face embedding provider");
  }
  const url = `https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });
  if (!res.ok) {
    throw new Error(`HF embedding failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as unknown;
  return toSentenceEmbedding(data);
}

// Sentence-transformer endpoints may return [dim] (pooled) or [[dim]]
// (batch of one). Token-level outputs like [tokens][dim] are rejected
// so the caller sees a clear error instead of a silently-wrong vector.
function toSentenceEmbedding(data: unknown): number[] {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("HF embedding: unexpected empty response");
  }
  if (typeof data[0] === "number") {
    return data as number[];
  }
  if (Array.isArray(data[0]) && data.length === 1 && typeof data[0][0] === "number") {
    return data[0] as number[];
  }
  throw new Error(
    "HF embedding: response is not a sentence embedding. " +
      "The configured model likely returns token-level vectors; " +
      "use a sentence-transformers model or switch EMBEDDING_PROVIDER."
  );
}
