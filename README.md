# SuperAnki AI

Work in progress. Simple tooling to turn reading notes into spaced‑repetition cards.

## What It Does (today)

- Watches a folder for text digest files (Supernote‑style).
- Parses words/phrases and their source book filenames.
- Stores entries in a local SQLite database.
- Provides small CLI helpers to process and query digests.

## What It Will Do (soon)

- Use an LLM to generate Anki cards from each word + its book context (definition, example, extras).
- Send cards to Anki Desktop via AnkiConnect, which syncs to AnkiWeb.
- Support deck/field mapping, batching, and safe retries.

## Quick Start

- Prereqs: Node.js 18+, `pnpm`.
- Install: `pnpm install`
- Dev run: `pnpm dev`
- Build: `pnpm build` then `pnpm start`

CLI examples:

```bash
# Process a digest file manually
pnpm process-digest ./path/to/digest.txt

# Query the digest database
pnpm query-digest

# Backup the digest database (snapshot)
pnpm backup-digest
```

Expected digest format (simplified):
```
word_or_phrase
[book_filename](Document/book_filename)
```

## Config

- Copy `.env.example` to `.env.dev` for local development.
- Default paths: database under `./data`, watch directory `./files`, pattern `*.txt`.
- Production uses `.env.production` (when `NODE_ENV=production`).

## Status

Active development. APIs and schema may change. Use at your own risk.

## License

ISC
