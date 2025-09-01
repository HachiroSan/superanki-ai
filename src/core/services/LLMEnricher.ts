import { EnrichedCard } from '../entities/EnrichedCard';

export interface LLMEnricher {
  // Enrich a list of words for a given source title (book/article)
  enrich(words: string[], sourceTitle: string): Promise<EnrichedCard[]>;
}

