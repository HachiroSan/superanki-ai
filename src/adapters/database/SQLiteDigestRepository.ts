import sqlite3 from 'sqlite3';
import { DigestEntry } from '../../core/entities/DigestEntry';
import { DigestRepository } from '../../core/repositories/DigestRepository';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

export class SQLiteDigestRepository implements DigestRepository {
  private db: sqlite3.Database;
  private dbPath: string;
  private initPromise: Promise<void>;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || config.database.path || './data/app.db';
    this.ensureDatabaseDirectory();
    this.db = new sqlite3.Database(this.dbPath);
    this.initPromise = this.initDatabase();
  }

  private ensureDatabaseDirectory(): void {
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  private async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Enable safer durability defaults
        this.db.run('PRAGMA journal_mode = WAL');
        this.db.run('PRAGMA synchronous = FULL');

        this.db.run(`
          CREATE TABLE IF NOT EXISTS digest_entries (
            word TEXT PRIMARY KEY,
            book_filename TEXT NOT NULL,
            source_file TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  async save(entry: DigestEntry): Promise<void> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.run(
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
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      const db = this.db;
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
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.all(
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
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.get(
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
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.all(
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
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.run(
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
    await this.ensureInitialized();
    const entry = await this.findByWord(word);
    return entry !== null;
  }

  async upsert(entry: DigestEntry): Promise<boolean> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.run(
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
    await this.ensureInitialized();
    const db = this.db;
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
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
