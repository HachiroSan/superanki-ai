import sqlite3 from 'sqlite3';
import { EnrichedCard } from '../../core/entities/EnrichedCard';
import { EnrichedCardRepository } from '../../core/repositories/EnrichedCardRepository';
import { DatabaseConnectionManager } from './DatabaseConnectionManager';

export class SQLiteEnrichedCardRepository implements EnrichedCardRepository {
  private connectionManager: DatabaseConnectionManager;

  constructor(dbPath?: string) {
    this.connectionManager = DatabaseConnectionManager.getInstance(dbPath);
  }

  private async getDb(): Promise<sqlite3.Database> {
    return this.connectionManager.getConnection();
  }

  async upsert(card: EnrichedCard): Promise<boolean> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO enriched_cards (
           word, source_title, canonical_answer, canonical_answer_alt,
           part_of_speech, definition, example_sentence, hint, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(word, source_title) DO UPDATE SET
           canonical_answer=excluded.canonical_answer,
           canonical_answer_alt=excluded.canonical_answer_alt,
           part_of_speech=excluded.part_of_speech,
           definition=excluded.definition,
           example_sentence=excluded.example_sentence,
           hint=excluded.hint,
           updated_at=excluded.updated_at
        `,
        [
          card.word,
          card.sourceTitle,
          card.canonicalAnswer,
          card.canonicalAnswerAlt,
          card.partOfSpeech,
          card.definition,
          card.exampleSentence,
          card.hint,
          card.createdAt.getTime(),
          card.updatedAt.getTime(),
        ],
        function (this: any, err) {
          if (err) return reject(err);
          resolve((this && this.changes) > 0);
        }
      );
    });
  }

  async findByWordAndSource(word: string, sourceTitle: string): Promise<EnrichedCard | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT word, source_title, canonical_answer, canonical_answer_alt, part_of_speech, definition, example_sentence, hint, created_at, updated_at
         FROM enriched_cards WHERE word = ? AND source_title = ?`,
        [word, sourceTitle],
        (err, row: any) => {
          if (err) return reject(err);
          if (!row) return resolve(null);
          resolve(
            new EnrichedCard(
              row.word,
              row.canonical_answer,
              row.canonical_answer_alt,
              row.part_of_speech,
              row.definition,
              row.example_sentence,
              row.source_title,
              row.hint,
              new Date(row.created_at),
              new Date(row.updated_at)
            )
          );
        }
      );
    });
  }

  async exists(word: string, sourceTitle: string): Promise<boolean> {
    const found = await this.findByWordAndSource(word, sourceTitle);
    return !!found;
  }

  async saveManyIfNew(cards: EnrichedCard[]): Promise<number> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        `INSERT OR IGNORE INTO enriched_cards (
           word, source_title, canonical_answer, canonical_answer_alt,
           part_of_speech, definition, example_sentence, hint, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let inserted = 0;
      let completed = 0;

      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            stmt.finalize(() => reject(beginErr));
            return;
          }

          if (cards.length === 0) {
            stmt.finalize((finalizeErr) => {
              if (finalizeErr) return db.run('ROLLBACK', () => reject(finalizeErr));
              db.run('COMMIT', (commitErr) => {
                if (commitErr) return reject(commitErr);
                resolve(0);
              });
            });
            return;
          }

          for (const c of cards) {
            stmt.run(
              [
                c.word,
                c.sourceTitle,
                c.canonicalAnswer,
                c.canonicalAnswerAlt,
                c.partOfSpeech,
                c.definition,
                c.exampleSentence,
                c.hint,
                c.createdAt.getTime(),
                c.updatedAt.getTime(),
              ],
              function (this: any, err) {
                if (err) {
                  return db.run('ROLLBACK', () => stmt.finalize(() => reject(err)));
                }
                if (this && this.changes) inserted += 1;
                completed += 1;
                if (completed === cards.length) {
                  stmt.finalize((finalizeErr) => {
                    if (finalizeErr) return db.run('ROLLBACK', () => reject(finalizeErr));
                    db.run('COMMIT', (commitErr) => {
                      if (commitErr) return reject(commitErr);
                      resolve(inserted);
                    });
                  });
                }
              }
            );
          }
        });
      });
    });
  }

  close(): Promise<void> {
    return this.connectionManager.close();
  }
}

