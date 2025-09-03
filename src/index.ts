import { SQLiteFileRepository } from './adapters/database/SQLiteRepository';
import { SQLiteDigestRepository } from './adapters/database/SQLiteDigestRepository';
import { ChokidarFileWatcher } from './adapters/filewatcher/ChokidarWatcher';
import { CryptoHashService } from './adapters/hash/CryptoHashService';
import { SupernoteDigestParser } from './core/services/DigestParser';
import { WatchFilesUseCase } from './application/WatchFilesUseCase';
import { ProcessDigestUseCase } from './application/ProcessDigestUseCase';
import { config } from './config';
import { SQLiteEnrichedCardRepository } from './adapters/database/SQLiteEnrichedCardRepository';
import { OpenAIEnricher } from './adapters/llm/OpenAIEnricher';
import OpenAI from 'openai';
import { EnrichMissingUseCase } from './application/EnrichMissingUseCase';
import { ConsoleLogger } from './adapters/logging/ConsoleLogger';
import { Logger } from './core/services/Logger';

async function main() {
  // Initialize logger first
  const logger = new ConsoleLogger(
    config.logging.level,
    config.logging.filePath,
    {
      rotate: (config.logging.rotate as any) || 'none',
      maxSizeBytes: (config.logging.maxSizeMB || 10) * 1024 * 1024,
      maxFiles: config.logging.maxFiles || 5,
    }
  );
  
  try {
    
    logger.info('Starting SuperAnki AI File Watcher...');
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Log level: ${config.logging.level}`);

    // Create infrastructure adapters (concrete implementations)
    const fileRepository = new SQLiteFileRepository();
    const digestRepository = new SQLiteDigestRepository();
    const fileWatcher = new ChokidarFileWatcher();
    const hashService = new CryptoHashService();
    const digestParser = new SupernoteDigestParser();

    // Create use cases with dependency injection
    const processDigestUseCase = new ProcessDigestUseCase(
      digestRepository,  // DigestRepository interface
      digestParser,      // DigestParser interface
      logger             // Logger interface
    );

    // Optional third stage: LLM enrichment
    let enrichMissingUseCase: EnrichMissingUseCase | undefined;
    if (config.llm.enabled) {
      logger.info('Initializing LLM enrichment...');
      logger.info(`LLM Provider: ${config.llm.provider}`);
      logger.info(`LLM Model: ${config.llm.model}`);
      logger.info(`Batch Size: ${config.llm.batchSize}`);
      logger.info(`Concurrency: ${config.llm.concurrency}`);
      
      const enrichedRepo = new SQLiteEnrichedCardRepository();
      
      // Check for OpenAI API key
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        logger.error('OPENAI_API_KEY environment variable is required for LLM enrichment');
        process.exit(1);
      }
      
      const openaiClient = new OpenAI({
        apiKey: apiKey,
        baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      });
      
      const enricher = new OpenAIEnricher(openaiClient, config.llm.model, logger, {
        temperature: 0.7
      });
      
      enrichMissingUseCase = new EnrichMissingUseCase(enrichedRepo, enricher, logger, {
        batchSize: config.llm.batchSize,
        concurrency: config.llm.concurrency,
      });
      
      logger.info('LLM enrichment initialized successfully');
    }

    const watchFilesUseCase = new WatchFilesUseCase(
      fileRepository,           // FileRepository interface
      fileWatcher,              // FileWatcher interface
      hashService,              // HashService interface
      processDigestUseCase,     // ProcessDigestUseCase
      logger,                   // Logger interface
      enrichMissingUseCase      // optional EnrichMissingUseCase
    );

    // Start watching files
    await watchFilesUseCase.execute();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('\nReceived SIGINT, shutting down gracefully...');
      await watchFilesUseCase.stop();
      await fileRepository.close();
      await digestRepository.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('\nReceived SIGTERM, shutting down gracefully...');
      await watchFilesUseCase.stop();
      await fileRepository.close();
      await digestRepository.close();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Error starting application:', error);
    process.exit(1);
  }
}

main();
