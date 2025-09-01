import { SupernoteDigestParser } from '../DigestParser';

describe('SupernoteDigestParser', () => {
  let parser: SupernoteDigestParser;

  beforeEach(() => {
    parser = new SupernoteDigestParser();
  });

  it('should parse digest entries correctly', async () => {
    const content = `swoon
[Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub](Document/Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub)

juniper
[Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub](Document/Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub)

third crowing of the cock
[Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub](Document/Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub)`;

    const entries = await parser.parse(content, 'test-digest.txt');

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      word: 'swoon',
      bookFilename: 'Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub',
      sourceFile: 'test-digest.txt',
      createdAt: expect.any(Date)
    });
    expect(entries[1]).toEqual({
      word: 'juniper',
      bookFilename: 'Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub',
      sourceFile: 'test-digest.txt',
      createdAt: expect.any(Date)
    });
    expect(entries[2]).toEqual({
      word: 'third crowing of the cock',
      bookFilename: 'Introducing The Witcher - The Last Wish, Sword of Destiny and Blood of Elves (Andrzej Sapkowski, Orion 2020).epub',
      sourceFile: 'test-digest.txt',
      createdAt: expect.any(Date)
    });
  });

  it('should handle empty content', async () => {
    const entries = await parser.parse('', 'test-digest.txt');
    expect(entries).toHaveLength(0);
  });

  it('should handle content with only book references', async () => {
    const content = `[Some Book.epub](Document/Some Book.epub)
[Another Book.epub](Document/Another Book.epub)`;
    
    const entries = await parser.parse(content, 'test-digest.txt');
    expect(entries).toHaveLength(0);
  });

  it('should handle content with words but no book references', async () => {
    const content = `word1
word2
word3`;
    
    const entries = await parser.parse(content, 'test-digest.txt');
    expect(entries).toHaveLength(0);
  });

  it('should handle malformed book references', async () => {
    const content = `word1
[Malformed reference
word2
[Another malformed reference]`;
    
    const entries = await parser.parse(content, 'test-digest.txt');
    expect(entries).toHaveLength(0);
  });

  it('should trim whitespace from words and book filenames', async () => {
    const content = `  swoon  
[  Introducing The Witcher.epub  ](Document/Introducing The Witcher.epub)`;

    const entries = await parser.parse(content, 'test-digest.txt');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      word: 'swoon',
      bookFilename: 'Introducing The Witcher.epub',
      sourceFile: 'test-digest.txt',
      createdAt: expect.any(Date)
    });
  });
});
