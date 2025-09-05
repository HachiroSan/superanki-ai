import sqlite3 from 'sqlite3';
import { ConsoleLogger } from '../adapters/logging/ConsoleLogger';
import { config } from '../config';
import { PushToAnkiUseCase } from '../application/PushToAnkiUseCase';

function parseArgs(argv: string[]) {
  const out: { sources: string[] } = { sources: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source' || arg === '-s') {
      const v = argv[i + 1];
      if (v) {
        out.sources.push(v);
        i++;
      }
    } else if (arg.startsWith('--source=')) {
      out.sources.push(arg.slice('--source='.length));
    } else if (arg === '--sources') {
      const v = argv[i + 1];
      if (v) {
        out.sources.push(...v.split(',').map((s) => s.trim()).filter(Boolean));
        i++;
      }
    }
  }
  return out;
}

async function allSourcesFromDb(dbPath: string): Promise<string[]> {
  const db = new sqlite3.Database(dbPath);
  try {
    const rows: Array<{ source_title: string }> = await new Promise((resolve, reject) => {
      db.all(
        'SELECT DISTINCT source_title FROM enriched_cards ORDER BY source_title',
        (err, res) => (err ? reject(err) : resolve(res || []))
      );
    });
    return rows.map((r) => r.source_title).filter(Boolean);
  } finally {
    db.close();
  }
}

async function main() {
  const { sources } = parseArgs(process.argv);
  const logger = new ConsoleLogger(config.logging.level);

  const usecase = new PushToAnkiUseCase(logger);

  const list = sources.length > 0 ? sources : await allSourcesFromDb(config.database.path);
  if (list.length === 0) {
    logger.info('No enriched sources found to push.');
    return;
  }

  logger.info(`Pushing enriched cards to Anki for ${list.length} source(s)...`);
  const res = await usecase.pushForSources(list);
  logger.info(`Anki push finished. Created ${res.created}, Updated ${res.updated}.`);
}

main().catch((err) => {
  console.error('Failed to push to Anki:', err);
  process.exit(1);
});

