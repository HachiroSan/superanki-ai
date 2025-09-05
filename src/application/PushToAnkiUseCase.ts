import sqlite3 from 'sqlite3';
import { Logger } from '../core/services/Logger';
import { DatabaseConnectionManager } from '../adapters/database/DatabaseConnectionManager';
import { config } from '../config';

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

function sanitizeDeckComponent(name: unknown): string {
  return String(name || 'Unknown')
    .replace(/::/g, ':')
    .replace(/[\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeAnkiQueryValue(value: unknown): string {
  return String(value).replace(/"/g, '\\"');
}

function slugifyTag(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_:-]/g, '')
    .slice(0, 63);
}

// No concatenated Back field; we populate individual Superanki fields per note.

export class PushToAnkiUseCase {
  private connectionManager: DatabaseConnectionManager;

  constructor(private logger: Logger, dbPath?: string) {
    this.connectionManager = DatabaseConnectionManager.getInstance(dbPath);
  }

  private async getDb(): Promise<sqlite3.Database> {
    return this.connectionManager.getConnection();
  }

  private async callAnki<T = any>(action: string, params: any = {}): Promise<T> {
    const body: any = { action, version: 6, params };
    if (config.anki.key) body.key = config.anki.key;
    const res = await fetch(config.anki.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AnkiConnect HTTP ${res.status}`);
    const json = await res.json() as { error?: string; result: T };
    if (json.error) throw new Error(String(json.error));
    return json.result;
  }

  async pushForSources(sources: string[]): Promise<{ created: number; updated: number }> {
    if (!config.anki?.autoPush) {
      this.logger.debug('Anki auto-push disabled; skipping.');
      return { created: 0, updated: 0 };
    }

    // Use direct AnkiConnect HTTP API (no external client)

    const db = await this.getDb();

    let created = 0;
    let updated = 0;

    // Unique sources only
    const uniqueSources = Array.from(new Set(sources.filter(Boolean)));
    const ensuredDecks = new Set<string>();

    const FIELD_WORD = config.anki.fieldWord;
    const FIELD_CANONICAL_ANSWER = config.anki.fieldCanonicalAnswer;
    const FIELD_CANONICAL_ANSWER_ALT = config.anki.fieldCanonicalAnswerAlt;
    const FIELD_PART_OF_SPEECH = config.anki.fieldPartOfSpeech;
    const FIELD_DEFINITION = config.anki.fieldDefinition;
    const FIELD_EXAMPLE_SENTENCE = config.anki.fieldExampleSentence;
    const FIELD_SOURCE_TITLE = config.anki.fieldSourceTitle;
    const FIELD_HINT = config.anki.fieldHint;

    for (const sourceTitle of uniqueSources) {
      const deckName = `${config.anki.deckPrefix}::${sanitizeDeckComponent(sourceTitle)}`;
      if (!ensuredDecks.has(deckName)) {
        await this.callAnki('createDeck', { deck: deckName });
        ensuredDecks.add(deckName);
      }

      // Pull all rows for this source.
      const rows: EnrichedRow[] = await new Promise((resolve, reject) => {
        db.all(
          `SELECT word, source_title, canonical_answer, canonical_answer_alt, part_of_speech, definition, example_sentence, hint, updated_at
           FROM enriched_cards WHERE source_title = ? ORDER BY updated_at DESC`,
          [sourceTitle],
          (err, result: EnrichedRow[]) => {
            if (err) return reject(err);
            resolve(result || []);
          }
        );
      });

      for (const row of rows) {
        const front = String(row.word || '').trim();
        if (!front) continue;

        const query = [
          `deck:"${escapeAnkiQueryValue(deckName)}"`,
          `note:"${escapeAnkiQueryValue(config.anki.model)}"`,
          `${FIELD_WORD}:"${escapeAnkiQueryValue(front)}"`,
        ].join(' ');

        const newNote = {
          deckName,
          modelName: config.anki.model,
          fields: {
            [FIELD_WORD]: front,
            [FIELD_CANONICAL_ANSWER]: row.canonical_answer || '',
            [FIELD_CANONICAL_ANSWER_ALT]: row.canonical_answer_alt || '',
            [FIELD_PART_OF_SPEECH]: row.part_of_speech || '',
            [FIELD_DEFINITION]: row.definition || '',
            [FIELD_EXAMPLE_SENTENCE]: row.example_sentence || '',
            [FIELD_SOURCE_TITLE]: sourceTitle || '',
            [FIELD_HINT]: row.hint || '',
          } as Record<string, string>,
          options: {
            allowDuplicate: false,
            duplicateScope: 'deck' as const,
            duplicateScopeOptions: { deckName, checkChildren: false },
          },
          tags: ['superanki', `source:${slugifyTag(sourceTitle)}`],
        };

        let noteIds: number[] = [];
        try {
          noteIds = await this.callAnki<number[]>('findNotes', { query });
        } catch (e: any) {
          this.logger.warn(`[AnkiPush] findNotes failed for ${front}: ${e?.message || e}`);
        }

        if (Array.isArray(noteIds) && noteIds.length > 0) {
          // Pick newest
          let infos: Array<{
            noteId: number;
            mod: number;
            fields: Record<string, { value: string }>;
            tags: string[];
          }>; 
          try {
            infos = await this.callAnki<typeof infos>('notesInfo', { notes: noteIds });
          } catch (e: any) {
            this.logger.warn(`[AnkiPush] notesInfo failed for ${front}: ${e?.message || e}`);
            continue;
          }
          const newest = infos.sort((a, b) => (b.mod || 0) - (a.mod || 0))[0];
          if (newest && newest.noteId) {
            // Compare all desired fields with current values and update changed ones only
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
              await this.callAnki('updateNoteFields', {
                note: {
                  id: newest.noteId,
                  fields: fieldsToUpdate,
                },
              });
            }

            const merged = Array.from(new Set([...(newest.tags || []), ...newNote.tags]));
            await this.callAnki('updateNoteTags', { note: newest.noteId, tags: merged });

            updated += 1;
            continue;
          }
        }

        const added = await this.callAnki<number | null>('addNote', { note: newNote });
        if (added) created += 1;
      }
    }

    this.logger.info(`[AnkiPush] Completed. Created ${created}, Updated ${updated}.`);

    // If any changes were made, trigger Anki to sync with AnkiWeb
    if (created + updated > 0) {
      try {
        this.logger.info('[AnkiPush] Syncing with AnkiWeb...');
        await this.callAnki('sync');
        this.logger.info('[AnkiPush] Sync completed.');
      } catch (e: any) {
        this.logger.warn(`[AnkiPush] Sync failed: ${e?.message || e}`);
      }
    }

    return { created, updated };
  }
}
