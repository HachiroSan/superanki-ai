import { SQLiteDigestRepository } from '../SQLiteDigestRepository';
import { DigestEntry } from '../../../core/entities/DigestEntry';
import fs from 'fs';
import path from 'path';

describe('SQLiteDigestRepository', () => {
  let repository: SQLiteDigestRepository;
  const testDbPath = './test-data/test-digest.db';

  beforeEach(async () => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    // Ensure test directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    repository = new SQLiteDigestRepository(testDbPath);
  });

  afterEach(async () => {
    await repository.close();
    
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should save and retrieve digest entries', async () => {
    const entry = new DigestEntry('test-word', 'test-book.epub', 'test-source.txt');

    await repository.save(entry);

    const retrieved = await repository.findByWord('test-word');
    expect(retrieved).toEqual(entry);
  });

  it('should upsert entries correctly - skip if word exists', async () => {
    const entry1 = new DigestEntry('test-word', 'test-book.epub', 'test-source1.txt');
    const entry2 = new DigestEntry('test-word', 'different-book.epub', 'test-source2.txt');

    await repository.upsert(entry1);
    await repository.upsert(entry2);

    const retrieved = await repository.findByWord('test-word');
    expect(retrieved).toEqual(entry1); // Should keep the first entry, skip the second
  });

  it('should find entry by word', async () => {
    const entry1 = new DigestEntry('test-word', 'book1.epub', 'source1.txt');
    const entry2 = new DigestEntry('other-word', 'book1.epub', 'source2.txt');

    await repository.save(entry1);
    await repository.save(entry2);

    const entry = await repository.findByWord('test-word');
    expect(entry).toEqual(entry1);
  });

  it('should find entries by book', async () => {
    const entry1 = new DigestEntry('word1', 'test-book.epub', 'source1.txt');
    const entry2 = new DigestEntry('word2', 'test-book.epub', 'source2.txt');
    const entry3 = new DigestEntry('word3', 'other-book.epub', 'source3.txt');

    await repository.save(entry1);
    await repository.save(entry2);
    await repository.save(entry3);

    const entries = await repository.findByBook('test-book.epub');
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(expect.arrayContaining([entry1, entry2]));
  });

  it('should check if entry exists', async () => {
    const entry = new DigestEntry('test-word', 'test-book.epub', 'test-source.txt');

    expect(await repository.exists('test-word')).toBe(false);

    await repository.save(entry);

    expect(await repository.exists('test-word')).toBe(true);
  });

  it('should delete entries', async () => {
    const entry = new DigestEntry('test-word', 'test-book.epub', 'test-source.txt');

    await repository.save(entry);
    expect(await repository.exists('test-word')).toBe(true);

    await repository.deleteByWord('test-word');
    expect(await repository.exists('test-word')).toBe(false);
  });

  it('should save multiple entries', async () => {
    const entries = [
      new DigestEntry('word1', 'book1.epub', 'source1.txt'),
      new DigestEntry('word2', 'book1.epub', 'source1.txt'),
      new DigestEntry('word3', 'book2.epub', 'source1.txt'),
    ];

    await repository.saveMany(entries);

    const allEntries = await repository.findAll();
    expect(allEntries).toHaveLength(3);
    expect(allEntries).toEqual(expect.arrayContaining(entries));
  });

  it('should return null for non-existent entries', async () => {
    const entry = await repository.findByWord('non-existent');
    expect(entry).toBeNull();
  });

  it('should return null for non-existent words', async () => {
    const entry = await repository.findByWord('non-existent');
    expect(entry).toBeNull();
  });

  it('should return empty array for non-existent books', async () => {
    const entries = await repository.findByBook('non-existent.epub');
    expect(entries).toEqual([]);
  });
});
