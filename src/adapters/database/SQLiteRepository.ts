import sqlite3 from 'sqlite3';
import { File } from '../../core/entities/File';
import { FileRepository } from '../../core/repositories/FileRepository';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

export class SQLiteFileRepository implements FileRepository {
  private db: sqlite3.Database;
  private dbPath: string;
  private initPromise: Promise<void>;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || config.database.path;
    this.ensureDatabaseDirectory();
    this.db = new sqlite3.Database(this.dbPath);
    this.initPromise = this.initDatabase();
  }

  // Ensure the database directory exists
  private ensureDatabaseDirectory(): void {
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  private async initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Align durability/tuning with the digest repository
        this.db.run('PRAGMA journal_mode = WAL');
        this.db.run('PRAGMA synchronous = FULL');

        this.db.run(
          `
        CREATE TABLE IF NOT EXISTS files (
          path TEXT PRIMARY KEY,
          hash TEXT NOT NULL,
          last_seen INTEGER NOT NULL
        )
      `,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    });
  }

  private async ensureInitialized(): Promise<void> {
    await this.initPromise;
  }

  async save(file: File): Promise<void> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO files (path, hash, last_seen) VALUES (?, ?, ?)',
        [file.path, file.hash, file.lastSeen.getTime()],
        (err) => {
          if (err) {
            // Check if it's a constraint violation (duplicate key)
            if (err.message && err.message.includes('UNIQUE constraint failed')) {
              reject(new Error(`File with path '${file.path}' already exists`));
            } else {
              reject(err);
            }
          } else {
            resolve();
          }
        }
      );
    });
  }

  async update(file: File): Promise<void> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE files SET hash = ?, last_seen = ? WHERE path = ?',
        [file.hash, file.lastSeen.getTime(), file.path],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async saveOrUpdate(file: File): Promise<void> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO files (path, hash, last_seen) VALUES (?, ?, ?)',
        [file.path, file.hash, file.lastSeen.getTime()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async findByPath(path: string): Promise<File | null> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT path, hash, last_seen FROM files WHERE path = ?',
        [path],
        (err, row: any) => {
          if (err) reject(err);
          else if (row) {
            resolve(new File(row.path, row.hash, new Date(row.last_seen)));
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async findAll(): Promise<File[]> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT path, hash, last_seen FROM files',
        (err, rows: any[]) => {
          if (err) reject(err);
          else {
            resolve(rows.map(row => new File(row.path, row.hash, new Date(row.last_seen))));
          }
        }
      );
    });
  }

  async deleteByPath(path: string): Promise<void> {
    await this.ensureInitialized();
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM files WHERE path = ?',
        [path],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureInitialized();
    const file = await this.findByPath(path);
    return file !== null;
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
