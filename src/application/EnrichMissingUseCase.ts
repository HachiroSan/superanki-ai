import { DigestEntry } from '../core/entities/DigestEntry';
import { EnrichedCard } from '../core/entities/EnrichedCard';
import { EnrichedCardRepository } from '../core/repositories/EnrichedCardRepository';
import { LLMEnricher } from '../core/services/LLMEnricher';
import { Logger } from '../core/services/Logger';

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
    private logger: Logger,
    options: Options = {}
  ) {
    this.batchSize = options.batchSize ?? 20;
    this.concurrency = options.concurrency ?? 2;
  }

  // Accept parsed digest entries and ensure enrichment exists for each (word, book)
  async executeForEntries(entries: DigestEntry[]): Promise<{ requested: number; created: number }>{
    this.logger.time('enrichment-process');
    this.logger.info(`Starting enrichment process for ${entries.length} entries...`);
    
    // Group unique words by sourceTitle (bookFilename)
    const bySource = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!bySource.has(e.bookFilename)) bySource.set(e.bookFilename, new Set());
      bySource.get(e.bookFilename)!.add(e.word);
    }

    this.logger.info(`Grouped entries into ${bySource.size} source(s)`);

    let created = 0;
    let requested = 0;
    let processedSources = 0;

    for (const [sourceTitle, wordsSet] of bySource.entries()) {
      processedSources++;
      const words = Array.from(wordsSet);
      this.logger.info(`Processing source ${processedSources}/${bySource.size}: "${sourceTitle}" (${words.length} unique words)`);
      
      this.logger.time(`check-existing-${processedSources}`);
      const missing: string[] = [];
      for (const w of words) {
        // Filter to only words that don't have enrichment yet
        // eslint-disable-next-line no-await-in-loop
        const exists = await this.enrichedRepo.exists(w, sourceTitle);
        if (!exists) missing.push(w);
      }
      this.logger.timeEnd(`check-existing-${processedSources}`);

      if (missing.length === 0) {
        this.logger.info(`All words for "${sourceTitle}" already enriched, skipping...`);
        continue;
      }
      
      this.logger.info(`Found ${missing.length} words needing enrichment for "${sourceTitle}"`);
      requested += missing.length;

      // Process in batches with simple concurrency control
      const batches: string[][] = [];
      for (let i = 0; i < missing.length; i += this.batchSize) {
        batches.push(missing.slice(i, i + this.batchSize));
      }

      this.logger.info(`Processing ${batches.length} batch(es) for "${sourceTitle}"`);

      // Helper: enrich with fallback by splitting on token-limit errors
      const enrichWithBackoff = async (batchWords: string[]): Promise<EnrichedCard[]> => {
        try {
          return await this.enricher.enrich(batchWords, sourceTitle);
        } catch (err: any) {
          const msg = (err?.message || '').toString();
          const tokenLimitHit = msg.includes('max output tokens');
          if (tokenLimitHit && batchWords.length > 1) {
            const mid = Math.floor(batchWords.length / 2);
            const left = await enrichWithBackoff(batchWords.slice(0, mid));
            const right = await enrichWithBackoff(batchWords.slice(mid));
            return [...left, ...right];
          }
          throw err;
        }
      };

      // Process batches sequentially to avoid transaction conflicts
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        this.logger.info(`Processing batch ${batchIndex + 1}/${batches.length} for "${sourceTitle}" (${batch.length} words): [${batch.slice(0, 3).join(', ')}${batch.length > 3 ? '...' : ''}]`);
        
        try {
          this.logger.time(`llm-enrich-${processedSources}-${batchIndex + 1}`);
          const enriched = await enrichWithBackoff(batch);
          this.logger.timeEnd(`llm-enrich-${processedSources}-${batchIndex + 1}`);
          this.logger.info(`LLM returned ${enriched.length} enriched cards for batch ${batchIndex + 1}`);
          
          this.logger.time(`save-batch-${processedSources}-${batchIndex + 1}`);
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
          this.logger.timeEnd(`save-batch-${processedSources}-${batchIndex + 1}`);
          created += inserted;
          this.logger.info(`Saved ${inserted} new enriched cards from batch ${batchIndex + 1}`);
        } catch (error) {
          this.logger.timeEnd(`llm-enrich-${processedSources}-${batchIndex + 1}`);
          this.logger.error(`Error processing batch ${batchIndex + 1} for "${sourceTitle}":`, error);
          throw error;
        }
      }
    }

    const totalTime = this.logger.timeEnd('enrichment-process');
    this.logger.info(`Enrichment process completed in ${totalTime}ms. Requested: ${requested}, Created: ${created}`);
    return { requested, created };
  }
}
