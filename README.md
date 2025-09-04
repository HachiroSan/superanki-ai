# SuperAnki AI

Experimental automated pipeline for turning [Supernote Digest](https://support.supernote.com/en_US/Tools-Features/1735114-digest) into AI-generated Anki cards for space-repetition practice. We use AnkiWeb service to store our flashcards generated from our server. It watches a folder for exported notes, parses unique vocabulary per book/source, and (optionally) calls an LLM to draft fields (definition, example, mnemonic, etc.). Data is stored in a local SQLite database.

## How It Works

Pipeline at a glance:

1) File Watcher
- Watches a directory for `*.txt` digests (Supernote‑style exports work nicely).
- Debounces noisy change events and reacts only when files settle.

2) Digest Parser → SQLite
- Extracts unique words and their source (book filename) and stores them in SQLite (`digest_entries`).
- Tracks seen files and their hashes (`files`) so we only reprocess when content changes.

3) LLM Enrichment
- For each source, groups missing words and calls an LLM with a JSON schema to produce concise fields:
  Word, CanonicalAnswer, CanonicalAnswerAlt, PartOfSpeech, Definition, ExampleSentence, SourceTitle, Hint.
- Handles truncation gracefully: if a model hits max‑output tokens, the app splits the batch and retries automatically.
- Stores outputs in `enriched_cards` with upsert semantics so edits can be refreshed.

See [docs/pipeline-flow.md](docs/pipeline-flow.md) for more detail on the flow.

### Triggering and Order of Operations

- The pipeline is event‑driven. A file change is the only trigger.
- For each change event, stages run sequentially for that file:
  1) compute hash → compare with last seen
  2) parse digest → write/update `digest_entries`
  3) if LLM is enabled, enrich missing items → write/update `enriched_cards`
- Within enrichment, words are grouped by source title and processed in batches. Batches for a given source are handled sequentially to avoid DB conflicts.
- If a batch hits model output limits, it is split and retried automatically until it succeeds (down to single words if necessary).
- Concurrency is intentionally low (configurable) because events arrive in bursts and SQLite likes simple, ordered writes.

## Quick Start

- Prereqs: Node.js 18+, `pnpm`.
- Install deps: `pnpm install`
- Copy env: `cp .env.example .env.dev` and tweak paths/keys.
- Dev run: `pnpm dev` (watches your folder and logs to console/file)
- Build/Prod: `pnpm build && pnpm start`

CLI helpers:

```bash
# Process a single digest file (bypasses watcher)
pnpm process-digest ./path/to/digest.txt

# Query the digest DB (examples you can adapt)
pnpm query-digest

# Backup the DB to a timestamped snapshot
pnpm backup-digest
```

Expected digest format (simplified):
```
word_or_phrase
[book_filename](Document/book_filename)
```

## Configuration

Core settings live in environment files. Copy `.env.example` to `.env.dev` for local dev; production reads `.env.production` when `NODE_ENV=production`. Tests load `.env.test` via Jest setup.

- Database
  - `DATABASE_PATH=./data/app.db`
  - `DATABASE_MIGRATIONS_PATH=./migrations`

- File Watcher
  - `WATCH_DIRECTORY=/path/to/EXPORT`
  - `WATCH_PATTERN=*.txt`
  - `WATCH_DEBOUNCE_MS=1000`

- Hashing
  - `HASH_ALGORITHM=SHA256` (or `xxHash`)

- Logging
  - `LOG_LEVEL=info` (debug|info|warn|error)
  - `LOG_FILE=./data/app.log` to also write logs to a file
  - Rotation: `LOG_ROTATE=none|daily|size`
    - Size mode: `LOG_MAX_SIZE_MB=10`, `LOG_MAX_FILES=5`
    - Daily mode: `LOG_MAX_FILES=7` keeps last 7 days

- LLM Enrichment
  - `LLM_ENABLED=true|false`
  - `LLM_PROVIDER=openai`
  - `LLM_MODEL=<model-name>`
  - `LLM_BATCH_SIZE=20` (words/request)
  - `LLM_CONCURRENCY=2` (low is fine; we batch per source)
  - Provider auth: `OPENAI_API_KEY=...`, optional `OPENAI_BASE_URL=...`

- Tests (`.env.test`)
  - Loaded by `src/test/setup.ts` for Jest runs.
  - Use it to set an isolated DB path (e.g., `./data/test.db`) and toggles (e.g., `RUN_LLM_INTEGRATION=0`).

## LLM Notes

- API: Uses OpenAI’s Responses API with JSON‑schema‑formatted text output.
- Token safety: We request a generous `max_output_tokens` and automatically retry once with a higher cap. If a response is still truncated, we split the batch (divide and conquer) and continue until it succeeds, down to single‑word requests if needed.
- Prompts: Short system prompt encourages tight fields and strict schema; example sentence is generic and spoiler‑free.
- Tuning: If you see frequent truncation or slow requests, try:
  - Smaller `LLM_BATCH_SIZE` (e.g., 5–10)
  - A model with larger output budget / better JSON fidelity
  - Lower `LLM_CONCURRENCY` to avoid rate limits

## Database

SQLite file lives at `DATABASE_PATH` (default `./data/app.db`). To inspect:

```bash
sqlite3 ./data/app.db
.headers on
.mode box
.tables
.schema enriched_cards
SELECT word, source_title, part_of_speech, updated_at FROM enriched_cards ORDER BY updated_at DESC LIMIT 10;
```

Tables created on first run:
- `files(path PRIMARY KEY, hash, last_seen)`
- `digest_entries(word PRIMARY KEY, book_filename, source_file, created_at)`
- `enriched_cards(word, source_title, canonical_answer, canonical_answer_alt, part_of_speech, definition, example_sentence, hint, created_at, updated_at, UNIQUE(word, source_title))`

## Troubleshooting

- Getting “Response incomplete due to max output tokens limit”?
  - The app will retry with a higher cap and then split the batch automatically. Consider lowering `LLM_BATCH_SIZE` or switching models if it’s frequent.

- Rate limit or quota errors
  - Reduce concurrency and batch size; check provider limits and billing.

- No logs in file
  - Ensure `LOG_FILE` path exists or is creatable; check permissions. Daily rotation files are named like `app-YYYY-MM-DD.log`.

## Development

Run tests:

```bash
pnpm test
```

Notes:
- Code is TypeScript. Entry point is `src/index.ts`.
- Adapters contain the concrete implementations (SQLite, OpenAI, chokidar, etc.).
- We keep changes small and focused; configs are validated with Zod.

## Status

This is a personal project and an experiment. Interfaces and data shapes may change without notice; things may be rough around the edges. If you try it, treat it as a prototype.

## License

ISC

## TODO

- Anki Desktop integration (next pipeline stage)

See `pipelines/ankiconnect` for a Dockerized Anki Desktop setup and a helper to push `enriched_cards` to Anki via AnkiConnect.
