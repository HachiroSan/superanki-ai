import { File } from '../entities/File';

describe('File Domain Entity', () => {
  describe('constructor', () => {
    it('should create a file with required properties', () => {
      const file = new File('/test/file.txt', 'abc123', new Date('2024-01-01'));

      expect(file.path).toBe('/test/file.txt');
      expect(file.hash).toBe('abc123');
      expect(file.lastSeen).toEqual(new Date('2024-01-01'));
    });
  });

  describe('hasChanged', () => {
    it('should return true when hash has changed', () => {
      const file = new File('/test/file.txt', 'old-hash', new Date('2024-01-01'));

      const hasChanged = file.hasChanged('new-hash');

      expect(hasChanged).toBe(true);
    });

    it('should return false when hash is the same', () => {
      const file = new File('/test/file.txt', 'same-hash', new Date('2024-01-01'));

      const hasChanged = file.hasChanged('same-hash');

      expect(hasChanged).toBe(false);
    });
  });

  describe('updateHash', () => {
    it('should create a new file with updated hash and timestamp', () => {
      const originalFile = new File('/test/file.txt', 'old-hash', new Date('2024-01-01'));
      const beforeUpdate = new Date();

      const updatedFile = originalFile.updateHash('new-hash');
      const afterUpdate = new Date();

      expect(updatedFile.path).toBe('/test/file.txt');
      expect(updatedFile.hash).toBe('new-hash');
      expect(updatedFile.lastSeen.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      expect(updatedFile.lastSeen.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
      
      // Original file should remain unchanged
      expect(originalFile.hash).toBe('old-hash');
    });
  });
});
