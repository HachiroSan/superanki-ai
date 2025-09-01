import { SQLiteFileRepository } from './adapters/database/SQLiteRepository';
import { SQLiteDigestRepository } from './adapters/database/SQLiteDigestRepository';
import { ChokidarFileWatcher } from './adapters/filewatcher/ChokidarWatcher';
import { CryptoHashService } from './adapters/hash/CryptoHashService';
import { SupernoteDigestParser } from './core/services/DigestParser';
import { WatchFilesUseCase } from './application/WatchFilesUseCase';
import { ProcessDigestUseCase } from './application/ProcessDigestUseCase';
import { config } from './config';
import { SQLiteEnrichedCardRepository } from './adapters/database/SQLiteEnrichedCardRepository';
import { NoopEnricher } from './adapters/llm/NoopEnricher';
import { EnrichMissingUseCase } from './application/EnrichMissingUseCase';

async function main() {
  try {
    console.log('Starting SuperAnki AI File Watcher...');
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Log level: ${config.logging.level}`);

    // Create infrastructure adapters (concrete implementations)
    const fileRepository = new SQLiteFileRepository();
    const digestRepository = new SQLiteDigestRepository();
    const fileWatcher = new ChokidarFileWatcher();
    const hashService = new CryptoHashService();
    const digestParser = new SupernoteDigestParser();

    // Create use cases with dependency injection
    const processDigestUseCase = new ProcessDigestUseCase(
      digestRepository,  // DigestRepository interface
      digestParser       // DigestParser interface
    );

    // Optional third stage: LLM enrichment
    let enrichMissingUseCase: EnrichMissingUseCase | undefined;
    if (config.llm.enabled) {
      const enrichedRepo = new SQLiteEnrichedCardRepository();
      const enricher = new NoopEnricher(); // Replace with real implementation (e.g., OpenAI)
      enrichMissingUseCase = new EnrichMissingUseCase(enrichedRepo, enricher, {
        batchSize: config.llm.batchSize,
        concurrency: config.llm.concurrency,
      });
    }

    const watchFilesUseCase = new WatchFilesUseCase(
      fileRepository,           // FileRepository interface
      fileWatcher,              // FileWatcher interface
      hashService,              // HashService interface
      processDigestUseCase,     // ProcessDigestUseCase
      enrichMissingUseCase      // optional EnrichMissingUseCase
    );

    // Start watching files
    await watchFilesUseCase.execute();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await watchFilesUseCase.stop();
      await fileRepository.close();
      await digestRepository.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await watchFilesUseCase.stop();
      await fileRepository.close();
      await digestRepository.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error starting application:', error);
    process.exit(1);
  }
}

main();
