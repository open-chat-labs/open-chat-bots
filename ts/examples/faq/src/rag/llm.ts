/**
 * LLM provider. Swap via LLM_PROVIDER env var.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(messages: ChatMessage[]): Promise<string> {
  const provider = process.env.LLM_PROVIDER || "hf";
  switch (provider) {
    case "hf":
      return chatHuggingFace(messages);
    case "groq":
      return chatGroq(messages);
    default:
      throw new Error(`Unknown LLM_PROVIDER: ${provider}`);
  }
}

async function chatHuggingFace(messages: ChatMessage[]): Promise<string> {
  const model = process.env.HF_LLM_MODEL || "HuggingFaceH4/zephyr-7b-beta";
  const token = process.env.HF_TOKEN;
  if (!token) {
    throw new Error("HF_TOKEN is required for the Hugging Face LLM provider");
  }
  const url = `https://api-inference.huggingface.co/models/${model}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 512,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    throw new Error(`HF chat failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}

async function chatGroq(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required for the Groq LLM provider");
  }
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 512,
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    throw new Error(`Groq chat failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  return data.choices?.[0]?.message?.content ?? "";
}
