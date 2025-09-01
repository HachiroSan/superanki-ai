import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { HashService } from '../../core/services/HashService';
import { config } from '../../config';

export class CryptoHashService implements HashService {
  async computeHash(content: string): Promise<string> {
    const hash = createHash(config.hash.algorithm.toLowerCase());
    hash.update(content);
    return hash.digest('hex');
  }

  async computeFileHash(filePath: string): Promise<string> {
    try {
      const content = await readFile(filePath, 'utf-8');
      return this.computeHash(content);
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw error;
    }
  }
}
