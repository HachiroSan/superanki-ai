import { DigestEntry } from '../core/entities/DigestEntry';
import { EnrichedCard } from '../core/entities/EnrichedCard';
import { EnrichedCardRepository } from '../core/repositories/EnrichedCardRepository';
import { LLMEnricher } from '../core/services/LLMEnricher';

type Options = {
  batchSize?: number;
  concurrency?: number;
};

export class EnrichMissingUseCase {
  private batchSize: number;
  private concurrency: number;

  constructor(
    private enrichedRepo: EnrichedCardRepository,
    private enricher: LLMEnricher,
    options: Options = {}
  ) {
    this.batchSize = options.batchSize ?? 20;
    this.concurrency = options.concurrency ?? 2;
  }

  // Accept parsed digest entries and ensure enrichment exists for each (word, book)
  async executeForEntries(entries: DigestEntry[]): Promise<{ requested: number; created: number }>{
    // Group unique words by sourceTitle (bookFilename)
    const bySource = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!bySource.has(e.bookFilename)) bySource.set(e.bookFilename, new Set());
      bySource.get(e.bookFilename)!.add(e.word);
    }

    let created = 0;
    let requested = 0;

    for (const [sourceTitle, wordsSet] of bySource.entries()) {
      const words = Array.from(wordsSet);
      const missing: string[] = [];
      for (const w of words) {
        // Filter to only words that don't have enrichment yet
        // eslint-disable-next-line no-await-in-loop
        const exists = await this.enrichedRepo.exists(w, sourceTitle);
        if (!exists) missing.push(w);
      }

      if (missing.length === 0) continue;
      requested += missing.length;

      // Process in batches with simple concurrency control
      const batches: string[][] = [];
      for (let i = 0; i < missing.length; i += this.batchSize) {
        batches.push(missing.slice(i, i + this.batchSize));
      }

      const running: Promise<number>[] = [];
      for (const batch of batches) {
        const task = (async () => {
          const enriched = await this.enricher.enrich(batch, sourceTitle);
          const inserted = await this.enrichedRepo.saveManyIfNew(
            enriched.map(
              (c) =>
                new EnrichedCard(
                  c.word,
                  c.canonicalAnswer,
                  c.canonicalAnswerAlt,
                  c.partOfSpeech,
                  c.definition,
                  c.exampleSentence,
                  c.sourceTitle,
                  c.hint,
                  new Date(),
                  new Date()
                )
            )
          );
          return inserted;
        })();

        running.push(task);
        if (running.length >= this.concurrency) {
          // eslint-disable-next-line no-await-in-loop
          const count = await running.shift()!;
          created += count;
        }
      }

      // Flush remaining
      for (const p of running) {
        // eslint-disable-next-line no-await-in-loop
        created += await p;
      }
    }

    return { requested, created };
  }
}

