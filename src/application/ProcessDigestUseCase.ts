import { DigestEntry } from '../core/entities/DigestEntry';
import { DigestRepository } from '../core/repositories/DigestRepository';
import { DigestParser } from '../core/services/DigestParser';
import fs from 'fs/promises';

export class ProcessDigestUseCase {
  constructor(
    private digestRepository: DigestRepository,
    private digestParser: DigestParser
  ) {}

  // Returns parsed entries for downstream pipeline stages (e.g., LLM enrichment)
  async execute(filePath: string): Promise<DigestEntry[]> {
    try {
      console.log(`Processing digest file: ${filePath}`);
      
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Parse digest entries
      const entries = await this.digestParser.parse(content, filePath);
      
      console.log(`Found ${entries.length} digest entries`);

      if (entries.length > 0) {
        const inserted = await this.digestRepository.saveManyIfNew(entries);
        console.log(`Inserted ${inserted} new entries (skipped ${entries.length - inserted} duplicates)`);
      }
      
      console.log(`Successfully processed digest file: ${filePath}`);
      return entries;
    } catch (error) {
      console.error(`Error processing digest file ${filePath}:`, error);
      throw error;
    }
  }

  async executeBatch(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      await this.execute(filePath);
    }
  }
}
