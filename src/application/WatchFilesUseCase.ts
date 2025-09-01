import { File } from '../core/entities/File';
import { FileRepository } from '../core/repositories/FileRepository';
import { FileWatcher } from '../core/services/FileWatcher';
import { HashService } from '../core/services/HashService';
import { ProcessDigestUseCase } from './ProcessDigestUseCase';
import { config } from '../config';

export class WatchFilesUseCase {
  constructor(
    private fileRepository: FileRepository,
    private fileWatcher: FileWatcher,
    private hashService: HashService,
    private processDigestUseCase: ProcessDigestUseCase
  ) {}

  async execute(): Promise<void> {
    console.log('Starting file watcher...');
    console.log(`Watching pattern: ${config.fileWatcher.pattern}`);
    console.log(`Directory: ${config.fileWatcher.directory}`);

    await this.fileWatcher.watch(
      config.fileWatcher.pattern,
      config.fileWatcher.directory,
      async (filePath) => {
        await this.handleFileChange(filePath);
      }
    );
  }

  private async handleFileChange(filePath: string): Promise<void> {
    try {
      console.log(`Processing file change: ${filePath}`);
      
      // Compute new hash
      const newHash = await this.hashService.computeFileHash(filePath);
      
      // Check if file exists in repository
      const existingFile = await this.fileRepository.findByPath(filePath);
      
      if (existingFile) {
        // File exists, check if content changed
        if (existingFile.hasChanged(newHash)) {
          console.log(`File content changed: ${filePath}`);
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
          console.log(`Updated file hash: ${filePath}`);

          // Process all watched text files on change
          console.log(`Processing updated text file for vocabulary: ${filePath}`);
          await this.processDigestUseCase.execute(filePath);
        } else {
          console.log(`File unchanged: ${filePath}`);
        }
      } else {
        // New file
        console.log(`New file detected: ${filePath}`);
        const newFile = new File(filePath, newHash, new Date());
        // Prefer upsert to simplify first-write vs update behavior
        // @@ts-expect-error extended method available on concrete repo
        if (typeof (this.fileRepository as any).saveOrUpdate === 'function') {
          await (this.fileRepository as any).saveOrUpdate(newFile);
        } else {
          await this.fileRepository.save(newFile);
        }
        console.log(`Saved new file: ${filePath}`);

        // Process all watched text files on add
        console.log(`Processing new text file for vocabulary: ${filePath}`);
        await this.processDigestUseCase.execute(filePath);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  async stop(): Promise<void> {
    await this.fileWatcher.stop();
    console.log('File watcher stopped');
  }

  // All watched files (*.txt) are processed for vocabulary extraction.
}
