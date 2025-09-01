import { LLMEnricher } from '../../core/services/LLMEnricher';
import { EnrichedCard } from '../../core/entities/EnrichedCard';

// Placeholder enricher used when LLM is disabled. Returns no items.
export class NoopEnricher implements LLMEnricher {
  async enrich(words: string[], sourceTitle: string): Promise<EnrichedCard[]> {
    void words;
    void sourceTitle;
    return [];
  }
}

