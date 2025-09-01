import { DigestEntry } from '../entities/DigestEntry';

export interface DigestParser {
  parse(content: string, sourceFile: string): Promise<DigestEntry[]>;
}

export class SupernoteDigestParser implements DigestParser {
  async parse(content: string, sourceFile: string): Promise<DigestEntry[]> {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const entries: DigestEntry[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Check if this line is a word/phrase (not a book reference)
      if (!this.isBookReference(line)) {
        const word = line;
        
        // Look for the next line that contains a book reference
        const nextLine = lines[i + 1];
        if (nextLine && this.isBookReference(nextLine)) {
          const bookFilename = this.extractBookFilename(nextLine);
          if (bookFilename) {
            entries.push(DigestEntry.create(word, bookFilename, sourceFile));
          }
        }
      }
    }
    
    return entries;
  }
  
  private isBookReference(line: string): boolean {
    // Check if line contains markdown link pattern [text](Document/path)
    return line.includes('[') && line.includes('](') && line.includes(')');
  }
  
  private extractBookFilename(line: string): string | null {
    // Extract filename from markdown link pattern [filename](Document/path)
    const match = line.match(/\[([^\]]+)\]\([^)]+\)/);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  }
}
