# Anki Desktop (AnkiConnect) Pipeline

This pipeline feeds enriched cards from the local SQLite DB to Anki Desktop through the AnkiConnect add‑on. It includes a Dockerized Anki Desktop (web UI) and a small helper script to push notes.

## What You Get

- Dockerized Anki Desktop (via `mikescherbakov/anki-desktop-docker`) with a named volume for persistence
- Web UI for first‑time setup and add‑on installation
- Example AnkiConnect requests and a helper script to push `enriched_cards` as notes

## Prereqs

- Docker + Docker Compose
- Node.js 18+ (for the helper script)

## Quick Start

1) Copy env template (optional for helper script):

```bash
cp pipelines/ankiconnect/.env.example pipelines/ankiconnect/.env
```

2) Start Anki Desktop in Docker:

```bash
cd pipelines/ankiconnect
docker compose up -d
```

3) Open the Anki UI in your browser and install AnkiConnect add‑on:

- URL: http://localhost:3000
- In Anki: Tools → Add‑ons → Get Add‑ons… → Code: `2055492159` → Install → Restart Anki

4) Configure AnkiConnect to accept connections from your host:

- Tools → Add‑ons → AnkiConnect → Config → set:
  - `webBindAddress`: `0.0.0.0`
  - `webPort`: `8765`
- Restart Anki from inside the container UI.

5) Verify AnkiConnect is reachable:

```bash
curl -s http://localhost:8765 -d '{"action":"version","version":6}' | jq
```

You should see a JSON response with a version number.

## Pushing Enriched Cards

The helper script reads from your project database and sends notes to Anki via AnkiConnect.

```bash
# From repo root, after you’ve generated enriched cards
node pipelines/ankiconnect/push-enriched-cards.js \
  --deck "SuperAnki" \
  --model "Basic" \
  --limit 200
```

Notes:
- Defaults are provided by `.env` inside this folder. CLI flags override env.
- Duplicates are prevented by Anki if `allowDuplicate` is false; duplicate detection uses the note’s first field.

## Mapping

We map `enriched_cards` to a `Basic` note by default:
- Front: `word`
- Back: `definition` + two newlines + `example_sentence` + optional `hint`

You can switch to a custom note type by changing `--model` and field names in the script’s `buildNote` function.

## Files

- `docker-compose.yml`: Runs Anki Desktop with a named volume `anki-data` and exposes:
  - `3000/tcp` web UI
  - `8765/tcp` AnkiConnect (after you update its config)
- `push-enriched-cards.js`: Minimal Node script to send notes from `enriched_cards`.
- `examples/requests.http`: Sample AnkiConnect JSON payloads.

## Persistence

- The Anki user profile and add‑ons are stored in a Docker named volume `anki-data`. This includes AnkiConnect settings you changed.

## Tear Down

```bash
docker compose down
# To also remove data:
docker compose down -v   # or: docker volume rm anki-data
```
