export class DigestEntry {
  constructor(
    public readonly word: string,
    public readonly bookFilename: string,
    public readonly sourceFile: string,
    public readonly createdAt: Date = new Date()
  ) {}

  static create(word: string, bookFilename: string, sourceFile: string): DigestEntry {
    return new DigestEntry(word.trim(), bookFilename.trim(), sourceFile);
  }

  getKey(): string {
    return `${this.word}:${this.bookFilename}`;
  }
}
