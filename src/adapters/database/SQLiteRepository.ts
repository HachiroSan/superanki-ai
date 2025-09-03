import sqlite3 from 'sqlite3';
import { File } from '../../core/entities/File';
import { FileRepository } from '../../core/repositories/FileRepository';
import { DatabaseConnectionManager } from './DatabaseConnectionManager';

export class SQLiteFileRepository implements FileRepository {
  private connectionManager: DatabaseConnectionManager;

  constructor(dbPath?: string) {
    this.connectionManager = DatabaseConnectionManager.getInstance(dbPath);
  }

  private async getDb(): Promise<sqlite3.Database> {
    return this.connectionManager.getConnection();
  }

  async save(file: File): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(
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
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(
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
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(
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
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.get(
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
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.all(
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
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(
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
    const file = await this.findByPath(path);
    return file !== null;
  }

  close(): Promise<void> {
    return this.connectionManager.close();
  }
}
