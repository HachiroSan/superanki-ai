import fs from 'fs';
import os from 'os';
import path from 'path';

// Lightweight logger stub
const logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  time: jest.fn(),
  timeEnd: jest.fn().mockReturnValue(0),
  timeLog: jest.fn(),
};

const runIntegration = process.env.RUN_ANKI_INTEGRATION === '1';
if (runIntegration) {
  jest.setTimeout(60000);
}

function tempDbPath(): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'superanki-int-')), 'app.db');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}

async function initDbAt(dbPath: string) {
  process.env.DATABASE_PATH = dbPath;
  jest.resetModules();
  const { DatabaseConnectionManager } = await import('../../adapters/database/DatabaseConnectionManager');
  const mgr = DatabaseConnectionManager.getInstance(dbPath);
  const db = await mgr.getConnection();
  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `CREATE TABLE IF NOT EXISTS enriched_cards (
          word TEXT NOT NULL,
          source_title TEXT NOT NULL,
          canonical_answer TEXT,
          canonical_answer_alt TEXT,
          part_of_speech TEXT,
          definition TEXT,
          example_sentence TEXT,
          hint TEXT,
          created_at INTEGER,
          updated_at INTEGER,
          UNIQUE(word, source_title)
        )`,
        (err) => (err ? reject(err) : resolve())
      );
    });
  });
  return { db, mgr };
}

(runIntegration ? describe : describe.skip)('PushToAnkiUseCase (integration)', () => {
  test('pushes and then cleans up the note', async () => {
    const dbPath = tempDbPath();
    const book = `IT Book ${Date.now()}`;
    const word = `zz_integration_${Date.now()}`;
    const deckPrefix = process.env.ANKI_DECK_PREFIX || 'SuperAnki::Test';
    const model = process.env.ANKI_MODEL || 'Superanki';
    const url = process.env.ANKI_URL || 'http://127.0.0.1:8765';

    process.env.ANKI_AUTO_PUSH = 'true';
    process.env.ANKI_URL = url;
    process.env.ANKI_DECK_PREFIX = deckPrefix;
    process.env.ANKI_MODEL = model;
    process.env.ANKI_FIELD_WORD = 'Word';
    process.env.ANKI_FIELD_CANONICAL_ANSWER = 'CanonicalAnswer';
    process.env.ANKI_FIELD_CANONICAL_ANSWER_ALT = 'CanonicalAnswerAlt';
    process.env.ANKI_FIELD_PART_OF_SPEECH = 'PartOfSpeech';
    process.env.ANKI_FIELD_DEFINITION = 'Definition';
    process.env.ANKI_FIELD_EXAMPLE_SENTENCE = 'ExampleSentence';
    process.env.ANKI_FIELD_SOURCE_TITLE = 'SourceTitle';
    process.env.ANKI_FIELD_HINT = 'Hint';

    const { db } = await initDbAt(dbPath);
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO enriched_cards(word, source_title, canonical_answer, canonical_answer_alt, part_of_speech, definition, example_sentence, hint, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [word, book, 'canon', 'alt', 'noun', 'def', 'ex', 'hint', Date.now(), Date.now()],
        (err) => (err ? reject(err) : resolve())
      );
    });

    jest.resetModules();
    const { PushToAnkiUseCase } = await import('../PushToAnkiUseCase');
    const usecase = new PushToAnkiUseCase(logger as any, dbPath);
    const res = await usecase.pushForSources([book]);
    expect(res.created + res.updated).toBeGreaterThanOrEqual(1);

    // Verify and cleanup via direct AnkiConnect HTTP API
    async function callAnki<T = any>(action: string, params: any = {}): Promise<T> {
      const body: any = { action, version: 6, params };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`AnkiConnect HTTP ${res.status}`);
      const json = (await res.json()) as { error?: string; result: T };
      if (json.error) throw new Error(String(json.error));
      return json.result;
    }

    const deckName = `${deckPrefix}::${book}`;
    const query = `deck:"${deckName}" note:"${model}" Word:"${word}"`;
    const ids = await callAnki<number[]>('findNotes', { query });
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.length).toBeGreaterThan(0);
    await callAnki('deleteNotes', { notes: ids });
  });
});
