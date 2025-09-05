import { File } from '../core/entities/File';
import { FileRepository } from '../core/repositories/FileRepository';
import { FileWatcher } from '../core/services/FileWatcher';
import { HashService } from '../core/services/HashService';
import { ProcessDigestUseCase } from './ProcessDigestUseCase';
import { config } from '../config';
import { EnrichMissingUseCase } from './EnrichMissingUseCase';
import { PushToAnkiUseCase } from './PushToAnkiUseCase';
import { Logger } from '../core/services/Logger';

export class WatchFilesUseCase {
  constructor(
    private fileRepository: FileRepository,
    private fileWatcher: FileWatcher,
    private hashService: HashService,
    private processDigestUseCase: ProcessDigestUseCase,
    private logger: Logger,
    private enrichMissingUseCase?: EnrichMissingUseCase,
    private pushToAnkiUseCase?: PushToAnkiUseCase
  ) {}

  async execute(): Promise<void> {
    this.logger.info('Starting file watcher...');
    this.logger.info(`Watching pattern: ${config.fileWatcher.pattern}`);
    this.logger.info(`Directory: ${config.fileWatcher.directory}`);

    await this.fileWatcher.watch(
      config.fileWatcher.pattern,
      config.fileWatcher.directory,
      async (filePath) => {
        await this.handleFileChange(filePath);
      }
    );
  }

  private async handleFileChange(filePath: string): Promise<void> {
    this.logger.time(`file-change-${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`);
    try {
      this.logger.info(`Processing file change: ${filePath}`);
      
      // Compute new hash
      this.logger.time('compute-hash');
      const newHash = await this.hashService.computeFileHash(filePath);
      this.logger.timeEnd('compute-hash');
      
      // Check if file exists in repository
      this.logger.time('check-existing');
      const existingFile = await this.fileRepository.findByPath(filePath);
      this.logger.timeEnd('check-existing');
      
      if (existingFile) {
        // File exists, check if content changed
        if (existingFile.hasChanged(newHash)) {
          this.logger.info(`File content changed: ${filePath}`);
          const updatedFile = existingFile.updateHash(newHash);
          // Use upsert semantics to avoid UNIQUE constraint errors
          // on already-tracked files
          // @@ts-expect-error extended method available on concrete repo
          if (typeof (this.fileRepository as any).saveOrUpdate === 'function') {
            await (this.fileRepository as any).saveOrUpdate(updatedFile);
          } else {
            // Fallback to save (legacy impls may override save to upsert)
            await this.fileRepository.save(updatedFile);
          }
          this.logger.info(`Updated file hash: ${filePath}`);

          // Process all watched text files on change
          this.logger.info(`Processing updated text file for vocabulary: ${filePath}`);
          const entries = await this.processDigestUseCase.execute(filePath);
          if (this.enrichMissingUseCase && entries.length > 0 && config.llm.enabled) {
            this.logger.info(`Enriching ${entries.length} entries via LLM (if missing)...`);
            const result = await this.enrichMissingUseCase.executeForEntries(entries);
            this.logger.info(`Enrichment completed: ${result.created} new cards created from ${result.requested} requested`);
          }
          if (this.pushToAnkiUseCase && config.anki.autoPush && entries.length > 0) {
            const sources = Array.from(new Set(entries.map((e) => e.bookFilename)));
            this.logger.info(`Pushing enriched cards to Anki for ${sources.length} source(s)...`);
            await this.pushToAnkiUseCase.pushForSources(sources);
          }
        } else {
          this.logger.debug(`File unchanged: ${filePath}`);
        }
      } else {
        // New file
        this.logger.info(`New file detected: ${filePath}`);
        const newFile = new File(filePath, newHash, new Date());
        // Prefer upsert to simplify first-write vs update behavior
        // @@ts-expect-error extended method available on concrete repo
        if (typeof (this.fileRepository as any).saveOrUpdate === 'function') {
          await (this.fileRepository as any).saveOrUpdate(newFile);
        } else {
          await this.fileRepository.save(newFile);
        }
        this.logger.info(`Saved new file: ${filePath}`);

        // Process all watched text files on add
        this.logger.info(`Processing new text file for vocabulary: ${filePath}`);
        const entries = await this.processDigestUseCase.execute(filePath);
        if (this.enrichMissingUseCase && entries.length > 0 && config.llm.enabled) {
          this.logger.info(`Enriching ${entries.length} entries via LLM (if missing)...`);
          const result = await this.enrichMissingUseCase.executeForEntries(entries);
          this.logger.info(`Enrichment completed: ${result.created} new cards created from ${result.requested} requested`);
        }
        if (this.pushToAnkiUseCase && config.anki.autoPush && entries.length > 0) {
          const sources = Array.from(new Set(entries.map((e) => e.bookFilename)));
          this.logger.info(`Pushing enriched cards to Anki for ${sources.length} source(s)...`);
          await this.pushToAnkiUseCase.pushForSources(sources);
        }
      }
    } catch (error) {
      this.logger.error(`Error processing file ${filePath}:`, error);
    } finally {
      this.logger.timeEnd(`file-change-${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`);
    }
  }

  async stop(): Promise<void> {
    await this.fileWatcher.stop();
    this.logger.info('File watcher stopped');
  }

  // All watched files (*.txt) are processed for vocabulary extraction.
}
