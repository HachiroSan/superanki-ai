import { WatchFilesUseCase } from '../WatchFilesUseCase';
import { ProcessDigestUseCase } from '../ProcessDigestUseCase';
import { FileRepository } from '../../core/repositories/FileRepository';
import { FileWatcher } from '../../core/services/FileWatcher';
import { HashService } from '../../core/services/HashService';
import { File } from '../../core/entities/File';
import { Logger } from '../../core/services/Logger';

// Mock implementations for testing
const mockFileRepository: jest.Mocked<FileRepository> = {
  save: jest.fn(),
  findByPath: jest.fn(),
  findAll: jest.fn(),
  deleteByPath: jest.fn(),
  exists: jest.fn(),
};

const mockFileWatcher: jest.Mocked<FileWatcher> = {
  watch: jest.fn(),
  stop: jest.fn(),
};

const mockHashService: jest.Mocked<HashService> = {
  computeHash: jest.fn(),
  computeFileHash: jest.fn(),
};

const mockProcessDigestUseCase = {
  execute: jest.fn(),
  executeBatch: jest.fn(),
} as unknown as jest.Mocked<ProcessDigestUseCase>;

const mockLogger: jest.Mocked<Logger> = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  time: jest.fn(),
  timeEnd: jest.fn().mockReturnValue(0),
  timeLog: jest.fn(),
};

describe('WatchFilesUseCase', () => {
  let useCase: WatchFilesUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new WatchFilesUseCase(
      mockFileRepository,
      mockFileWatcher,
      mockHashService,
      mockProcessDigestUseCase,
      mockLogger
    );
  });

  describe('execute', () => {
    it('should start watching files', async () => {
      await useCase.execute();

      expect(mockFileWatcher.watch).toHaveBeenCalled();
    });

    it('should handle file changes', async () => {
      const testFile = new File('/test/file.txt', 'old-hash', new Date());
      const updatedFile = new File('/test/file.txt', 'new-hash', new Date());

      mockFileRepository.findByPath.mockResolvedValue(testFile);
      mockHashService.computeFileHash.mockResolvedValue('new-hash');

      await useCase.execute();

      // Simulate file change event
      const changeHandler = mockFileWatcher.watch.mock.calls[0][2];
      await changeHandler('/test/file.txt');

      expect(mockFileRepository.findByPath).toHaveBeenCalledWith('/test/file.txt');
      expect(mockHashService.computeFileHash).toHaveBeenCalledWith('/test/file.txt');
      expect(mockFileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test/file.txt',
          hash: 'new-hash',
        })
      );

      // Digest should be processed for all watched text files
      expect(mockProcessDigestUseCase.execute).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should handle new files', async () => {
      mockFileRepository.findByPath.mockResolvedValue(null);
      mockHashService.computeFileHash.mockResolvedValue('new-hash');

      await useCase.execute();

      // Simulate file change event for new file
      const changeHandler = mockFileWatcher.watch.mock.calls[0][2];
      await changeHandler('/test/new-file.txt');

      expect(mockFileRepository.findByPath).toHaveBeenCalledWith('/test/new-file.txt');
      expect(mockHashService.computeFileHash).toHaveBeenCalledWith('/test/new-file.txt');
      expect(mockFileRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test/new-file.txt',
          hash: 'new-hash',
        })
      );

      // Digest should be processed for new text files
      expect(mockProcessDigestUseCase.execute).toHaveBeenCalledWith('/test/new-file.txt');
    });
  });

  describe('stop', () => {
    it('should stop watching files', async () => {
      await useCase.stop();

      expect(mockFileWatcher.stop).toHaveBeenCalled();
    });
  });
});
