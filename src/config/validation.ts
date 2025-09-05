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
  anki: z.object({
    autoPush: z.boolean().default(false),
    url: z.string().default('http://127.0.0.1:8765'),
    deckPrefix: z.string().default('SuperAnki::Books'),
    model: z.string().default('Superanki'),
    // Individual field names in the Superanki model
    fieldWord: z.string().default('Word'),
    fieldCanonicalAnswer: z.string().default('CanonicalAnswer'),
    fieldCanonicalAnswerAlt: z.string().default('CanonicalAnswerAlt'),
    fieldPartOfSpeech: z.string().default('PartOfSpeech'),
    fieldDefinition: z.string().default('Definition'),
    fieldExampleSentence: z.string().default('ExampleSentence'),
    fieldSourceTitle: z.string().default('SourceTitle'),
    fieldHint: z.string().default('Hint'),
    // Legacy front/back (optional, not used when fieldWord is provided)
    fieldFront: z.string().default('Front').optional(),
    fieldBack: z.string().default('Back').optional(),
    key: z.string().optional(),
  }).default({
    autoPush: false,
    url: 'http://127.0.0.1:8765',
    deckPrefix: 'SuperAnki::Books',
    model: 'Superanki',
    fieldWord: 'Word',
    fieldCanonicalAnswer: 'CanonicalAnswer',
    fieldCanonicalAnswerAlt: 'CanonicalAnswerAlt',
    fieldPartOfSpeech: 'PartOfSpeech',
    fieldDefinition: 'Definition',
    fieldExampleSentence: 'ExampleSentence',
    fieldSourceTitle: 'SourceTitle',
    fieldHint: 'Hint',
  }),
});

export type Config = z.infer<typeof configSchema>;
