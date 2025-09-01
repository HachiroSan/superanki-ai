import { DigestEntry } from '../entities/DigestEntry';

export interface DigestRepository {
  save(entry: DigestEntry): Promise<void>;
  saveMany(entries: DigestEntry[]): Promise<void>;
  findByWord(word: string): Promise<DigestEntry | null>;
  findByBook(bookFilename: string): Promise<DigestEntry[]>;
  findAll(): Promise<DigestEntry[]>;
  deleteByWord(word: string): Promise<void>;
  exists(word: string): Promise<boolean>;
  // Insert if absent by unique word constraint; returns true if inserted
  upsert(entry: DigestEntry): Promise<boolean>;
  // Batch insert-if-absent; returns number of rows inserted
  saveManyIfNew(entries: DigestEntry[]): Promise<number>;
}
