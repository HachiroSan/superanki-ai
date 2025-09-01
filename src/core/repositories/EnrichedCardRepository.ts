import { EnrichedCard } from '../entities/EnrichedCard';

export interface EnrichedCardRepository {
  upsert(card: EnrichedCard): Promise<boolean>; // returns true if inserted/updated
  findByWordAndSource(word: string, sourceTitle: string): Promise<EnrichedCard | null>;
  exists(word: string, sourceTitle: string): Promise<boolean>;
  saveManyIfNew(cards: EnrichedCard[]): Promise<number>; // number inserted (ignores duplicates)
  close(): Promise<void> | void;
}

