import { ProcessDigestUseCase } from '../ProcessDigestUseCase';
import { DigestRepository } from '../../core/repositories/DigestRepository';
import { DigestParser } from '../../core/services/DigestParser';
import { DigestEntry } from '../../core/entities/DigestEntry';
import { Logger } from '../../core/services/Logger';
import fs from 'fs/promises';

// Mock fs module
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('ProcessDigestUseCase', () => {
  let useCase: ProcessDigestUseCase;
  let mockDigestRepository: jest.Mocked<DigestRepository>;
  let mockDigestParser: jest.Mocked<DigestParser>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockDigestRepository = {
      save: jest.fn(),
      saveMany: jest.fn(),
      saveManyIfNew: jest.fn(),
      findByWord: jest.fn(),
      findByBook: jest.fn(),
      findAll: jest.fn(),
      deleteByWord: jest.fn(),
      exists: jest.fn(),
      upsert: jest.fn(),
    };

    mockDigestParser = {
      parse: jest.fn(),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      time: jest.fn(),
      timeEnd: jest.fn().mockReturnValue(0),
      timeLog: jest.fn(),
    };

    useCase = new ProcessDigestUseCase(mockDigestRepository, mockDigestParser, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process digest file successfully', async () => {
    const filePath = 'test-digest.txt';
    const content = 'test content';
    const mockEntries = [
      new DigestEntry('word1', 'book1.epub', filePath),
      new DigestEntry('word2', 'book1.epub', filePath),
    ];

    mockedFs.readFile.mockResolvedValue(content);
    mockDigestParser.parse.mockResolvedValue(mockEntries);

    mockDigestRepository.saveManyIfNew.mockResolvedValue(2);

    await useCase.execute(filePath);

    expect(mockedFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
    expect(mockDigestParser.parse).toHaveBeenCalledWith(content, filePath);
    expect(mockDigestRepository.saveManyIfNew).toHaveBeenCalledTimes(1);
    expect(mockDigestRepository.saveManyIfNew).toHaveBeenCalledWith(mockEntries);
  });

  it('should handle empty digest entries', async () => {
    const filePath = 'test-digest.txt';
    const content = 'test content';

    mockedFs.readFile.mockResolvedValue(content);
    mockDigestParser.parse.mockResolvedValue([]);

    await useCase.execute(filePath);

    expect(mockedFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
    expect(mockDigestParser.parse).toHaveBeenCalledWith(content, filePath);
    expect(mockDigestRepository.saveManyIfNew).not.toHaveBeenCalled();
  });

  it('should handle file read errors', async () => {
    const filePath = 'test-digest.txt';
    const error = new Error('File not found');

    mockedFs.readFile.mockRejectedValue(error);

    await expect(useCase.execute(filePath)).rejects.toThrow('File not found');

    expect(mockedFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
    expect(mockDigestParser.parse).not.toHaveBeenCalled();
    expect(mockDigestRepository.saveManyIfNew).not.toHaveBeenCalled();
  });

  it('should handle parser errors', async () => {
    const filePath = 'test-digest.txt';
    const content = 'test content';
    const error = new Error('Parse error');

    mockedFs.readFile.mockResolvedValue(content);
    mockDigestParser.parse.mockRejectedValue(error);

    await expect(useCase.execute(filePath)).rejects.toThrow('Parse error');

    expect(mockedFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
    expect(mockDigestParser.parse).toHaveBeenCalledWith(content, filePath);
    expect(mockDigestRepository.saveManyIfNew).not.toHaveBeenCalled();
  });

  it('should handle repository errors', async () => {
    const filePath = 'test-digest.txt';
    const content = 'test content';
    const mockEntries = [new DigestEntry('word1', 'book1.epub', filePath)];
    const error = new Error('Database error');

    mockedFs.readFile.mockResolvedValue(content);
    mockDigestParser.parse.mockResolvedValue(mockEntries);
    mockDigestRepository.saveManyIfNew.mockRejectedValue(error);

    await expect(useCase.execute(filePath)).rejects.toThrow('Database error');

    expect(mockedFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
    expect(mockDigestParser.parse).toHaveBeenCalledWith(content, filePath);
    expect(mockDigestRepository.saveManyIfNew).toHaveBeenCalledWith(mockEntries);
  });

  it('should process batch of files', async () => {
    const filePaths = ['file1.txt', 'file2.txt'];
    const content = 'test content';
    const mockEntries = [new DigestEntry('word1', 'book1.epub', 'file1.txt')];

    mockedFs.readFile.mockResolvedValue(content);
    mockDigestParser.parse.mockResolvedValue(mockEntries);

    mockDigestRepository.saveManyIfNew.mockResolvedValue(1);
    await useCase.executeBatch(filePaths);

    expect(mockedFs.readFile).toHaveBeenCalledTimes(2);
    expect(mockDigestParser.parse).toHaveBeenCalledTimes(2);
    expect(mockDigestRepository.saveManyIfNew).toHaveBeenCalledTimes(2);
  });
});
