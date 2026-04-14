# FAQ Bot (TypeScript example)

A minimal retrieval-augmented FAQ bot for OpenChat. Users run `/ask <question>`; the bot
embeds the question, retrieves the most relevant chunks from a local FAQ corpus via
[`sqlite-vec`](https://github.com/asg017/sqlite-vec), and asks a configurable LLM to
compose a grounded answer.

Addresses [open-chat-labs/open-chat-bots#158](https://github.com/open-chat-labs/open-chat-bots/issues/158).

## What it demonstrates

- Command bot skeleton (same Express + JWT middleware pattern as `ts/examples/openai`).
- A small RAG loop (`src/rag/{embed,llm,store}.ts`) that is easy to swap out.
- An ingest script (`scripts/ingest.ts`) that builds the `sqlite-vec` index from a
  plain markdown source, so the FAQ corpus is trivial to replace.

## Layout

```
ts/examples/faq/
├── data/faq.md          # seed corpus (replace with your own FAQ)
├── scripts/ingest.ts    # markdown -> chunks -> embeddings -> sqlite-vec index
└── src/
    ├── server.ts        # Express entry
    ├── app.ts           # /execute_command, /bot_definition
    ├── factory.ts       # BotClientFactory
    ├── middleware/botclient.ts
    ├── rag/
    │   ├── embed.ts     # embedding provider (default: Hugging Face)
    │   ├── llm.ts       # chat provider (default: Hugging Face; also Groq)
    │   └── store.ts     # sqlite-vec init / insert / search
    └── handlers/
        ├── schema.ts    # /ask command definition
        ├── executeCommand.ts
        ├── success.ts
        └── ask.ts       # RAG handler
```

## Setup

All commands assume you start from the repository root.

1. Build the shared TypeScript SDK once:

   ```sh
   cd ts/library
   npm install
   npm run build
   cd ../..
   ```

2. Switch into this example and install its dependencies:

   ```sh
   cd ts/examples/faq
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in the OpenChat values
   (`OC_PUBLIC`, `IDENTITY_PRIVATE`, `IC_HOST`, `STORAGE_INDEX_CANISTER`) and a provider
   token. By default the bot uses the Hugging Face Inference API free tier, so set
   `HF_TOKEN`. To use Groq instead, set `LLM_PROVIDER=groq` and `GROQ_API_KEY`.

4. Build the FAQ index:

   ```sh
   npm run ingest
   ```

   This reads `FAQ_SOURCE` (default `./data/faq.md`), splits it on blank lines, embeds
   each chunk, and writes `FAQ_INDEX` (default `./data/faq.db`).

5. Run the bot:

   ```sh
   npm run dev
   ```

   Register it against your local OpenChat instance with `/register_bot` (see the repo
   root [`GETSTARTED.md`](../../../GETSTARTED.md)).

## Replacing the FAQ corpus

Drop any markdown file in `data/`, point `FAQ_SOURCE` at it, and re-run `npm run ingest`.
Chunks are separated by blank lines, so shape your source accordingly (one Q+A pair per
chunk works well). Chunks that are only markdown headings are skipped automatically.

## Provider swap

Both embedding and chat providers are selected by env var:

| Env var | Values | Notes |
| --- | --- | --- |
| `EMBEDDING_PROVIDER` | `hf` | Hugging Face Inference API, default model `sentence-transformers/all-MiniLM-L6-v2` |
| `LLM_PROVIDER` | `hf`, `groq` | `hf` uses the Inference API chat endpoint; `groq` uses the Groq OpenAI-compatible API |

Additional providers can be added by extending the switch in `src/rag/{embed,llm}.ts`.

## Open questions for maintainers

- **FAQ data source.** The bundled `data/faq.md` is placeholder content. Happy to swap
  it for an authoritative source (OpenChat docs, a curated Q&A set, or a live feed) on
  request.
- **Deployment shape.** Published as an off-chain Node bot for now, matching the other
  `ts/examples`. If an on-chain (canister) variant is preferred, that would be a larger
  rework.
- **Preferred provider defaults.** Defaulting to Hugging Face free tier to keep the
  example free to try; open to changing the default if the project has a preferred
  provider.
