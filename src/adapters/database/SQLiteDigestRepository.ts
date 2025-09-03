import sqlite3 from 'sqlite3';
import { DigestEntry } from '../../core/entities/DigestEntry';
import { DigestRepository } from '../../core/repositories/DigestRepository';
import { DatabaseConnectionManager } from './DatabaseConnectionManager';

export class SQLiteDigestRepository implements DigestRepository {
  private connectionManager: DatabaseConnectionManager;

  constructor(dbPath?: string) {
    this.connectionManager = DatabaseConnectionManager.getInstance(dbPath);
  }

  private async getDb(): Promise<sqlite3.Database> {
    return this.connectionManager.getConnection();
  }

  async save(entry: DigestEntry): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO digest_entries (word, book_filename, source_file, created_at) VALUES (?, ?, ?, ?)',
        [entry.word, entry.bookFilename, entry.sourceFile, entry.createdAt.getTime()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async saveMany(entries: DigestEntry[]): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO digest_entries (word, book_filename, source_file, created_at) VALUES (?, ?, ?, ?)'
      );

      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            stmt.finalize(() => reject(beginErr));
            return;
          }

          for (const entry of entries) {
            stmt.run([entry.word, entry.bookFilename, entry.sourceFile, entry.createdAt.getTime()], (runErr) => {
              if (runErr) {
                // Rollback on first error
                db.run('ROLLBACK', () => {
                  stmt.finalize(() => reject(runErr));
                });
              }
            });
          }

          stmt.finalize((finalizeErr) => {
            if (finalizeErr) {
              db.run('ROLLBACK', () => reject(finalizeErr));
              return;
            }
            db.run('COMMIT', (commitErr) => {
              if (commitErr) reject(commitErr);
              else resolve();
            });
          });
        });
      });
    });
  }



  async findByBook(bookFilename: string): Promise<DigestEntry[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT word, book_filename, source_file, created_at FROM digest_entries WHERE book_filename = ?',
        [bookFilename],
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            resolve(rows.map(row => new DigestEntry(
              row.word,
              row.book_filename,
              row.source_file,
              new Date(row.created_at)
            )));
          }
        }
      );
    });
  }

  async findByWord(word: string): Promise<DigestEntry | null> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT word, book_filename, source_file, created_at FROM digest_entries WHERE word = ?',
        [word],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve(new DigestEntry(
              row.word,
              row.book_filename,
              row.source_file,
              new Date(row.created_at)
            ));
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async findAll(): Promise<DigestEntry[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT word, book_filename, source_file, created_at FROM digest_entries ORDER BY created_at DESC',
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            resolve(rows.map(row => new DigestEntry(
              row.word,
              row.book_filename,
              row.source_file,
              new Date(row.created_at)
            )));
          }
        }
      );
    });
  }

  async deleteByWord(word: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM digest_entries WHERE word = ?',
        [word],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async exists(word: string): Promise<boolean> {
    const entry = await this.findByWord(word);
    return entry !== null;
  }

  async upsert(entry: DigestEntry): Promise<boolean> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT OR IGNORE INTO digest_entries (word, book_filename, source_file, created_at) VALUES (?, ?, ?, ?)',
        [entry.word, entry.bookFilename, entry.sourceFile, entry.createdAt.getTime()],
        function (this: any, err) {
          if (err) return reject(err);
          resolve((this && this.changes) > 0);
        }
      );
    });
  }

  async saveManyIfNew(entries: DigestEntry[]): Promise<number> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO digest_entries (word, book_filename, source_file, created_at) VALUES (?, ?, ?, ?)'
      );

      let inserted = 0;
      let completed = 0;

      db.serialize(() => {
        db.run('BEGIN TRANSACTION', (beginErr) => {
          if (beginErr) {
            stmt.finalize(() => reject(beginErr));
            return;
          }

          if (entries.length === 0) {
            stmt.finalize((finalizeErr) => {
              if (finalizeErr) return db.run('ROLLBACK', () => reject(finalizeErr));
              db.run('COMMIT', (commitErr) => {
                if (commitErr) return reject(commitErr);
                resolve(0);
              });
            });
            return;
          }

          for (const entry of entries) {
            stmt.run(
              [entry.word, entry.bookFilename, entry.sourceFile, entry.createdAt.getTime()],
              function (this: any, err) {
                if (err) {
                  // Rollback on first error
                  return db.run('ROLLBACK', () => stmt.finalize(() => reject(err)));
                }
                if (this && this.changes) inserted += 1;
                completed += 1;
                if (completed === entries.length) {
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
