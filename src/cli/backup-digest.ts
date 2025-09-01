#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { config } from '../config';

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function backupDigestDb() {
  const srcPath = config.database.path || './data/app.db';
  const backupsDir = path.join(path.dirname(srcPath), 'backups');
  ensureDir(backupsDir);
  const destPath = path.join(backupsDir, `digest-${timestamp()}.db`);

  console.log(`Backing up digest DB from: ${srcPath}`);
  console.log(`Backup destination: ${destPath}`);

  await new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(srcPath);
    db.serialize(() => {
      // Prefer official backup API if available in sqlite3 >=5
      const anyDb: any = db as any;
      if (typeof anyDb.backup === 'function') {
        anyDb.backup(destPath, (err: Error | null) => {
          db.close(() => {
            if (err) return reject(err);
            resolve();
          });
        });
        return;
      }

      // Fallback to VACUUM INTO for a consistent snapshot
      // Note: interpolate path carefully; sqlite does not support parameters here
      const escaped = destPath.replace(/'/g, "''");
      db.run(`PRAGMA journal_mode = WAL`);
      db.run(`VACUUM INTO '${escaped}'`, (err) => {
        db.close(() => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  });

  console.log('Backup completed successfully.');
}

backupDigestDb().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
