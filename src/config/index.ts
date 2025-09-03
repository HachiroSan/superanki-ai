import dotenv from 'dotenv';
import { configSchema, Config } from './validation';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.dev';
dotenv.config({ path: envFile });

// Compute a single source of truth for the DB path.
const dbPath = process.env.DATABASE_PATH || './data/app.db';

export const config: Config = configSchema.parse({
  database: {
    path: dbPath,
    migrationsPath: process.env.DATABASE_MIGRATIONS_PATH || './migrations',
  },
  fileWatcher: {
    pattern: process.env.WATCH_PATTERN || '*.txt',
    directory: process.env.WATCH_DIRECTORY || './files',
    debounceMs: parseInt(process.env.WATCH_DEBOUNCE_MS || '1000'),
  },
  hash: {
    algorithm: (process.env.HASH_ALGORITHM as 'SHA256' | 'xxHash') || 'SHA256',
  },
  logging: {
    level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    filePath: process.env.LOG_FILE || undefined,
    rotate: (process.env.LOG_ROTATE as 'none' | 'daily' | 'size') || 'none',
    maxSizeMB: parseInt(process.env.LOG_MAX_SIZE_MB || '10'),
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '5'),
  },
  nodeEnv: process.env.NODE_ENV || 'development',
  llm: {
    enabled: (process.env.LLM_ENABLED || 'false').toLowerCase() === 'true',
    provider: process.env.LLM_PROVIDER || 'openai',
    model: process.env.LLM_MODEL || 'gpt-5-nano',
    batchSize: parseInt(process.env.LLM_BATCH_SIZE || '20'),
    concurrency: parseInt(process.env.LLM_CONCURRENCY || '2'),
  },
});
