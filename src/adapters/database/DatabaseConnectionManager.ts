import sqlite3 from 'sqlite3';
import { config } from '../../config';
import fs from 'fs';
import path from 'path';

export class DatabaseConnectionManager {
  private static instance: DatabaseConnectionManager;
  private db: sqlite3.Database | null = null;
  private dbPath: string;
  private initPromise: Promise<void> | null = null;

  private constructor(dbPath?: string) {
    this.dbPath = dbPath || config.database.path || './data/app.db';
    this.ensureDatabaseDirectory();
  }

  public static getInstance(dbPath?: string): DatabaseConnectionManager {
    if (!DatabaseConnectionManager.instance) {
      DatabaseConnectionManager.instance = new DatabaseConnectionManager(dbPath);
    }
    return DatabaseConnectionManager.instance;
  }

  private ensureDatabaseDirectory(): void {
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  public async getConnection(): Promise<sqlite3.Database> {
    if (!this.db) {
      this.db = new sqlite3.Database(this.dbPath);
      this.initPromise = this.initDatabase();
    }
    
    await this.initPromise;
    return this.db;
  }

  private async initDatabase(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      this.db!.serialize(() => {
        // Set up database pragmas for better performance and safety
        this.db!.run('PRAGMA journal_mode = WAL');
        this.db!.run('PRAGMA synchronous = FULL');
        this.db!.run('PRAGMA foreign_keys = ON');
        this.db!.run('PRAGMA temp_store = MEMORY');

        // Create all tables
        this.db!.run(
          `
          CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY,
            hash TEXT NOT NULL,
            last_seen INTEGER NOT NULL
          )
        `,
          (err) => {
            if (err) {
              reject(err);
              return;
            }
          }
        );

        this.db!.run(
          `
          CREATE TABLE IF NOT EXISTS digest_entries (
            word TEXT PRIMARY KEY,
            book_filename TEXT NOT NULL,
            source_file TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `,
          (err) => {
            if (err) {
              reject(err);
              return;
            }
          }
        );

        this.db!.run(
          `
          CREATE TABLE IF NOT EXISTS enriched_cards (
            word TEXT NOT NULL,
            source_title TEXT NOT NULL,
            canonical_answer TEXT NOT NULL,
            canonical_answer_alt TEXT,
            part_of_speech TEXT NOT NULL,
            definition TEXT NOT NULL,
            example_sentence TEXT NOT NULL,
            hint TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(word, source_title)
          )
        `,
          (err) => {
            if (err) {
              reject(err);
              return;
            }
            resolve();
          }
        );
      });
    });
  }

  public async close(): Promise<void> {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) {
            reject(err);
          } else {
            this.db = null;
            this.initPromise = null;
            resolve();
          }
        });
      });
    }
  }

  public getDbPath(): string {
    return this.dbPath;
  }
}
