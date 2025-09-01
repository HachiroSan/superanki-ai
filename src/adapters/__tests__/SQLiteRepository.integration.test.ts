import { SQLiteFileRepository } from '../database/SQLiteRepository';
import { File } from '../../core/entities/File';
import fs from 'fs';
import path from 'path';

describe('SQLiteFileRepository Integration Tests', () => {
  let repository: SQLiteFileRepository;
  const testDbPath = path.join(__dirname, 'test.db');

  beforeAll(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    // Clean up test database before each test
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    repository = new SQLiteFileRepository(testDbPath);
  });

  afterEach(async () => {
    await repository.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterAll(async () => {
    // Final cleanup
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('save', () => {
    it('should save a new file', async () => {
      const file = new File('/test/file.txt', 'abc123', new Date('2024-01-01'));

      await repository.save(file);

      const savedFile = await repository.findByPath('/test/file.txt');
      expect(savedFile).toBeDefined();
      expect(savedFile?.path).toBe('/test/file.txt');
      expect(savedFile?.hash).toBe('abc123');
    });

    it('should throw error when saving file with duplicate path', async () => {
      const file1 = new File('/test/file.txt', 'abc123', new Date('2024-01-01'));
      const file2 = new File('/test/file.txt', 'def456', new Date('2024-01-02'));

      await repository.save(file1);

      await expect(repository.save(file2)).rejects.toThrow();
    });
  });

  describe('findByPath', () => {
    it('should find file by path', async () => {
      const file = new File('/test/file.txt', 'abc123', new Date('2024-01-01'));

      await repository.save(file);

      const foundFile = await repository.findByPath('/test/file.txt');
      expect(foundFile).toBeDefined();
      expect(foundFile?.path).toBe('/test/file.txt');
    });

    it('should return null for non-existent file', async () => {
      const foundFile = await repository.findByPath('/non/existent/file.txt');
      expect(foundFile).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const file = new File('/test/file.txt', 'abc123', new Date('2024-01-01'));
      await repository.save(file);

      const exists = await repository.exists('/test/file.txt');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const exists = await repository.exists('/non/existent/file.txt');
      expect(exists).toBe(false);
    });
  });

  describe('findAll', () => {
    it('should return all files', async () => {
      const file1 = new File('/test/file1.txt', 'abc123', new Date('2024-01-01'));
      const file2 = new File('/test/file2.txt', 'def456', new Date('2024-01-02'));

      await repository.save(file1);
      await repository.save(file2);

      const allFiles = await repository.findAll();
      expect(allFiles).toHaveLength(2);
      expect(allFiles.map((f: File) => f.path)).toContain('/test/file1.txt');
      expect(allFiles.map((f: File) => f.path)).toContain('/test/file2.txt');
    });

    it('should return empty array when no files exist', async () => {
      const allFiles = await repository.findAll();
      expect(allFiles).toHaveLength(0);
    });
  });

  describe('deleteByPath', () => {
    it('should delete file by path', async () => {
      const file = new File('/test/file.txt', 'abc123', new Date('2024-01-01'));
      await repository.save(file);

      await repository.deleteByPath('/test/file.txt');

      const foundFile = await repository.findByPath('/test/file.txt');
      expect(foundFile).toBeNull();
    });

    it('should not throw error when deleting non-existent file', async () => {
      await expect(repository.deleteByPath('/non/existent/file.txt')).resolves.not.toThrow();
    });
  });
});
