#!/usr/bin/env node

/**
 * Pushes notes to AnkiConnect from the project's SQLite `enriched_cards`.
 *
 * Defaults are loaded from pipelines/ankiconnect/.env if present, then CLI args override.
 *
 * Usage:
 *  tsx pipelines/ankiconnect/push-enriched-cards.ts \
 *    --deck-prefix "SuperAnki::Books" \
 *    --model "Superanki" \
 *    --field-word "Word" \
 *    --field-canonical-answer "CanonicalAnswer" \
 *    --field-canonical-answer-alt "CanonicalAnswerAlt" \
 *    --field-part-of-speech "PartOfSpeech" \
 *    --field-definition "Definition" \
 *    --field-example-sentence "ExampleSentence" \
 *    --field-source-title "SourceTitle" \
 *    --field-hint "Hint" \
 *    --limit 200
 *
 * Uses `yanki-connect` for strongly-typed AnkiConnect calls and upserts notes per book deck.
 */

import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';

// Types from yanki-connect via type-only import
import type { YankiConnect as YankiConnectType } from 'yanki-connect';

// Load env from local .env if present
try {
  const dotenvPath = path.join(__dirname, '.env');
  if (fs.existsSync(dotenvPath)) {
    dotenv.config({ path: dotenvPath });
  }
} catch {}

// Parse simple CLI args
const args = process.argv.slice(2);
function getArg(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const envKey = name.toUpperCase().replace(/-/g, '_');
  return (process.env as Record<string, string | undefined>)[envKey] ?? fallback;
}

const ANKI_CONNECT_URL = getArg('anki-connect-url', 'http://127.0.0.1:8765')!;
// Upsert per-book into prefixed subdecks: <prefix>::<Book Title>
const DECK_PREFIX = getArg('deck-prefix', 'SuperAnki::Books')!;
const MODEL_NAME = getArg('model', 'Superanki')!;
const DB_PATH = getArg('database-path', './data/app.db')!;
const LIMIT = parseInt(getArg('limit', '200')!, 10);
const ANKI_CONNECT_KEY = getArg('anki-connect-key', undefined);
const AUTO_LAUNCH = getArg('auto-launch', 'false')!; // 'false' | 'true' | 'immediately'
// Custom model field names (Superanki)
const FIELD_WORD = getArg('field-word', 'Word')!;
const FIELD_CANONICAL_ANSWER = getArg('field-canonical-answer', 'CanonicalAnswer')!;
const FIELD_CANONICAL_ANSWER_ALT = getArg('field-canonical-answer-alt', 'CanonicalAnswerAlt')!;
const FIELD_PART_OF_SPEECH = getArg('field-part-of-speech', 'PartOfSpeech')!;
const FIELD_DEFINITION = getArg('field-definition', 'Definition')!;
const FIELD_EXAMPLE_SENTENCE = getArg('field-example-sentence', 'ExampleSentence')!;
const FIELD_SOURCE_TITLE = getArg('field-source-title', 'SourceTitle')!;
const FIELD_HINT = getArg('field-hint', 'Hint')!;

function parseHostAndPort(url: string): { host: string; port: number } {
  try {
    const u = new URL(url);
    const host = `${u.protocol}//${u.hostname}`;
    const port = u.port ? Number(u.port) : 8765;
    return { host, port };
  } catch {
    // Fallback to defaults if parsing fails
    return { host: 'http://127.0.0.1', port: 8765 };
  }
}

function sanitizeDeckComponent(name: unknown): string {
  // Anki deck names use '::' as hierarchy and do not allow control chars
  return String(name || 'Unknown')
    .replace(/::/g, ':')
    .replace(/[\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeAnkiQueryValue(value: unknown): string {
  // Escape quotes for Anki search queries
  return String(value).replace(/"/g, '\\"');
}

function slugifyTag(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_:-]/g, '')
    .slice(0, 63);
}

function buildBack(definition?: string | null, example?: string | null, hint?: string | null): string {
  const parts: string[] = [definition || ''];
  if (example) parts.push('', example);
  if (hint) parts.push('', `Hint: ${hint}`);
  return parts.join('\n');
}

type EnrichedRow = {
  word: string;
  source_title?: string;
  canonical_answer?: string | null;
  canonical_answer_alt?: string | null;
  part_of_speech?: string | null;
  definition?: string | null;
  example_sentence?: string | null;
  hint?: string | null;
  updated_at?: number;
};

function buildNote(deckName: string, row: EnrichedRow) {
  return {
    deckName,
    modelName: MODEL_NAME,
    fields: {
      [FIELD_WORD]: row.word,
      [FIELD_CANONICAL_ANSWER]: row.canonical_answer || '',
      [FIELD_CANONICAL_ANSWER_ALT]: row.canonical_answer_alt || '',
      [FIELD_PART_OF_SPEECH]: row.part_of_speech || '',
      [FIELD_DEFINITION]: row.definition || '',
      [FIELD_EXAMPLE_SENTENCE]: row.example_sentence || '',
      [FIELD_SOURCE_TITLE]: row.source_title || '',
      [FIELD_HINT]: row.hint || '',
    } as Record<string, string>,
    options: {
      allowDuplicate: false,
      duplicateScope: 'deck' as const,
      duplicateScopeOptions: { deckName, checkChildren: false },
    },
    tags: ['superanki', `source:${slugifyTag(row.source_title)}`],
  };
}

async function ensureDeck(client: YankiConnectType, deckName: string): Promise<void> {
  // createDeck returns the ID of the deck (or creates it). No-op if exists.
  await client.deck.createDeck({ deck: deckName });
}

async function main(): Promise<void> {
  console.log(`[AnkiPush] Using DB at ${DB_PATH}`);
  console.log(`[AnkiPush] Model: ${MODEL_NAME}`);
  console.log(`[AnkiPush] AnkiConnect: ${ANKI_CONNECT_URL}`);

  // Lazily import ESM-only yanki-connect from CJS-compiled TS using dynamic import
  const { YankiConnect } = (await import('yanki-connect')) as typeof import('yanki-connect');
  const { host, port } = parseHostAndPort(ANKI_CONNECT_URL);
  const client: YankiConnectType = new YankiConnect({
    host,
    port,
    key: ANKI_CONNECT_KEY,
    autoLaunch: (AUTO_LAUNCH === 'immediately' ? 'immediately' : AUTO_LAUNCH === 'true') as
      | boolean
      | 'immediately',
  });

  // Read rows from DB
  const db = new sqlite3.Database(DB_PATH);
  const rows: EnrichedRow[] = await new Promise((resolve, reject) => {
    const sql = `SELECT word, source_title, canonical_answer, canonical_answer_alt, part_of_speech, definition, example_sentence, hint, updated_at
                 FROM enriched_cards
                 ORDER BY updated_at DESC
                 LIMIT ?`;
    db.all(sql, [Number.isFinite(LIMIT) ? LIMIT : 200], (err, result: EnrichedRow[]) => {
      if (err) return reject(err);
      resolve(result || []);
    });
  });

  if (!rows.length) {
    console.log('[AnkiPush] No enriched cards found.');
    db.close();
    return;
  }

  // Cache of ensured decks to avoid redundant create calls
  const ensuredDecks = new Set<string>();

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const book = sanitizeDeckComponent(row.source_title);
    const deckName = `${DECK_PREFIX}::${book}`;
    if (!ensuredDecks.has(deckName)) {
      await ensureDeck(client, deckName);
      ensuredDecks.add(deckName);
    }

    const front = String(row.word || '').trim();
    if (!front) continue;

    const query = [
      `deck:"${escapeAnkiQueryValue(deckName)}"`,
      `note:"${escapeAnkiQueryValue(MODEL_NAME)}"`,
      `${FIELD_WORD}:"${escapeAnkiQueryValue(front)}"`,
    ].join(' ');

    let noteIds: number[] = [];
    try {
      noteIds = await client.note.findNotes({ query });
    } catch (e: any) {
      console.warn('[AnkiPush] findNotes failed:', e?.message || e);
    }

    const newNote = buildNote(deckName, row);

    if (Array.isArray(noteIds) && noteIds.length > 0) {
      // Fetch info for candidates to pick newest
      let infos: Array<{
        noteId: number;
        mod: number;
        fields: Record<string, { value: string }>;
        tags: string[];
      }> = [];
      try {
        infos = await client.note.notesInfo({ notes: noteIds });
      } catch (e: any) {
        console.warn('[AnkiPush] notesInfo failed:', e?.message || e);
      }
      const newest = infos.sort((a, b) => (b.mod || 0) - (a.mod || 0))[0];
      if (newest && newest.noteId) {
        // Compare all fields and update only changed ones
        const desiredFields = newNote.fields as Record<string, string>;
        const currentFields = newest.fields || {};
        let changed = false;
        const fieldsToUpdate: Record<string, string> = {};
        for (const [k, v] of Object.entries(desiredFields)) {
          const cur = currentFields[k]?.value ?? '';
          if (cur !== v) {
            changed = true;
            fieldsToUpdate[k] = v;
          }
        }
        if (changed) {
          await client.note.updateNoteFields({
            note: {
              id: newest.noteId,
              fields: fieldsToUpdate,
            },
          });
        }

        // Merge tags and set
        const existingTags = Array.isArray(newest.tags) ? newest.tags : [];
        const merged = Array.from(new Set([...existingTags, ...newNote.tags]));
        await client.note.updateNoteTags({ note: newest.noteId, tags: merged });

        updated += 1;
        continue;
      }
    }

    // Create new note if none matched
    const result = await client.note.addNote({ note: newNote });
    if (result) created += 1;
  }

  console.log(`[AnkiPush] Done. Created ${created}, Updated ${updated}.`);
  db.close();
}

main().catch((err) => {
  console.error('[AnkiPush] Error:', (err as Error).message || err);
  process.exit(1);
});
