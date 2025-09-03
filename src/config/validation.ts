import { z } from 'zod';

export const configSchema = z.object({
  database: z.object({
    path: z.string(),
    migrationsPath: z.string(),
  }),
  fileWatcher: z.object({
    pattern: z.string(),
    directory: z.string(),
    debounceMs: z.number().min(0),
  }),
  hash: z.object({
    algorithm: z.enum(['SHA256', 'xxHash']),
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    filePath: z.string().optional(),
    rotate: z.enum(['none', 'daily', 'size']).default('none').optional(),
    maxSizeMB: z.number().min(1).max(1024).default(10).optional(),
    maxFiles: z.number().min(1).max(100).default(5).optional(),
  }),
  nodeEnv: z.string(),
  llm: z.object({
    enabled: z.boolean().default(false),
    provider: z.string().default('openai'),
    model: z.string().default('gpt-5-nano'),
    batchSize: z.number().min(1).max(100).default(20),
    concurrency: z.number().min(1).max(10).default(2),
  }),
});

export type Config = z.infer<typeof configSchema>;
