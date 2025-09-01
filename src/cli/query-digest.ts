#!/usr/bin/env node

import { SQLiteDigestRepository } from '../adapters/database/SQLiteDigestRepository';

async function queryDigestDatabase() {
  try {
    console.log('Querying digest database...\n');
    
    const digestRepository = new SQLiteDigestRepository();
    
    // Get all entries
    const allEntries = await digestRepository.findAll();
    console.log(`Total entries: ${allEntries.length}`);
    
    if (allEntries.length === 0) {
      console.log('No entries found in database.');
      await digestRepository.close();
      return;
    }
    
    // Get unique words
    const uniqueWords = new Set(allEntries.map(entry => entry.word));
    console.log(`Unique words: ${uniqueWords.size}`);
    
    // Get unique books
    const uniqueBooks = new Set(allEntries.map(entry => entry.bookFilename));
    console.log(`Unique books: ${uniqueBooks.size}`);
    
    // Show books
    console.log('\nBooks in database:');
    Array.from(uniqueBooks).forEach((book, index) => {
      const bookEntries = allEntries.filter(entry => entry.bookFilename === book);
      console.log(`${index + 1}. "${book}" (${bookEntries.length} words)`);
    });
    
    // Show recent entries
    console.log('\nRecent entries:');
    allEntries.slice(0, 20).forEach((entry, index) => {
      console.log(`${index + 1}. "${entry.word}" -> "${entry.bookFilename}"`);
    });
    
    // Show word frequency
    const wordFrequency = new Map<string, number>();
    allEntries.forEach(entry => {
      wordFrequency.set(entry.word, (wordFrequency.get(entry.word) || 0) + 1);
    });
    
    const sortedWords = Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    console.log('\nMost common words:');
    sortedWords.forEach(([word, count], index) => {
      console.log(`${index + 1}. "${word}" (${count} occurrences)`);
    });
    
    await digestRepository.close();
    console.log('\nQuery completed successfully!');
    
  } catch (error) {
    console.error('Error querying digest database:', error);
    process.exit(1);
  }
}

queryDigestDatabase();
