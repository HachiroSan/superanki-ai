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
  }),
  nodeEnv: z.string(),
});

export type Config = z.infer<typeof configSchema>;
