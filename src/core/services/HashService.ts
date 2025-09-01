export interface HashService {
  computeHash(content: string): Promise<string>;
  computeFileHash(filePath: string): Promise<string>;
}
