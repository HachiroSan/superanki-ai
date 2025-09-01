#!/usr/bin/env node

import { SQLiteDigestRepository } from '../adapters/database/SQLiteDigestRepository';
import { SupernoteDigestParser } from '../core/services/DigestParser';
import { ProcessDigestUseCase } from '../application/ProcessDigestUseCase';
import { config } from '../config';

async function processDigestFile(filePath: string) {
  try {
    console.log(`Processing digest file: ${filePath}`);
    
    // Create infrastructure adapters
    const digestRepository = new SQLiteDigestRepository();
    const digestParser = new SupernoteDigestParser();
    
    // Create use case
    const processDigestUseCase = new ProcessDigestUseCase(digestRepository, digestParser);
    
    // Process the file
    await processDigestUseCase.execute(filePath);
    
    // Show results
    const allEntries = await digestRepository.findAll();
    console.log(`\nTotal digest entries in database: ${allEntries.length}`);
    
    if (allEntries.length > 0) {
      console.log('\nRecent entries:');
      allEntries.slice(0, 10).forEach((entry, index) => {
        console.log(`${index + 1}. "${entry.word}" -> "${entry.bookFilename}"`);
      });
    }
    
    await digestRepository.close();
    console.log('\nProcessing completed successfully!');
    
  } catch (error) {
    console.error('Error processing digest file:', error);
    process.exit(1);
  }
}

// Get file path from command line arguments
const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: npm run process-digest <file-path>');
  console.error('Example: npm run process-digest digest.txt');
  process.exit(1);
}

processDigestFile(filePath);
