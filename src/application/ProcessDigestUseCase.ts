import { DigestEntry } from '../core/entities/DigestEntry';
import { DigestRepository } from '../core/repositories/DigestRepository';
import { DigestParser } from '../core/services/DigestParser';
import { Logger } from '../core/services/Logger';
import fs from 'fs/promises';

export class ProcessDigestUseCase {
  constructor(
    private digestRepository: DigestRepository,
    private digestParser: DigestParser,
    private logger: Logger
  ) {}

  // Returns parsed entries for downstream pipeline stages (e.g., LLM enrichment)
  async execute(filePath: string): Promise<DigestEntry[]> {
    this.logger.time('process-digest');
    try {
      this.logger.info(`Processing digest file: ${filePath}`);
      
      // Read file content
      this.logger.time('read-file');
      const content = await fs.readFile(filePath, 'utf-8');
      this.logger.timeEnd('read-file');
      
      // Parse digest entries
      this.logger.time('parse-entries');
      const entries = await this.digestParser.parse(content, filePath);
      this.logger.timeEnd('parse-entries');
      
      this.logger.info(`Found ${entries.length} digest entries`);

      if (entries.length > 0) {
        this.logger.time('save-entries');
        const inserted = await this.digestRepository.saveManyIfNew(entries);
        this.logger.timeEnd('save-entries');
        this.logger.info(`Inserted ${inserted} new entries (skipped ${entries.length - inserted} duplicates)`);
      }
      
      const totalTime = this.logger.timeEnd('process-digest');
      this.logger.info(`Successfully processed digest file: ${filePath} in ${totalTime}ms`);
      return entries;
    } catch (error) {
      this.logger.timeEnd('process-digest');
      this.logger.error(`Error processing digest file ${filePath}:`, error);
      throw error;
    }
  }

  async executeBatch(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      await this.execute(filePath);
    }
  }
}
