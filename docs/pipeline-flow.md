# SuperAnki AI - Sequential Pipeline Flow

## Overview
The application implements a sequential pipeline that starts with file system monitoring and ends with vocabulary database storage. Here's the complete flow:

## Pipeline Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   File System   │───▶│   File Watcher   │───▶│  Hash Service   │───▶│ File Repository │
│   (Chokidar)    │    │   (Chokidar)     │    │   (Crypto)      │    │   (SQLite)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘    └─────────────────┘
                                │                                              │
                                ▼                                              ▼
                       ┌──────────────────┐                        ┌─────────────────┐
                       │ WatchFilesUseCase│                        │ Digest Detection│
                       │                  │                        │                 │
                       └──────────────────┘                        └─────────────────┘
                                │                                              │
                                ▼                                              ▼
                       ┌──────────────────┐                        ┌─────────────────┐
                       │ ProcessDigest    │                        │ Digest Parser   │
                       │ UseCase          │                        │ (Supernote)     │
                       └──────────────────┘                        └─────────────────┘
                                │                                              │
                                ▼                                              ▼
                       ┌──────────────────┐                        ┌─────────────────┐
                       │ Digest Repository│                        │ Vocabulary DB   │
                       │ (SQLite)         │                        │ (SQLite)        │
                       └──────────────────┘                        └─────────────────┘
```

## Detailed Sequential Flow

### 1. **Application Startup** (`src/index.ts`)
```typescript
// Dependency Injection Setup
const fileRepository = new SQLiteFileRepository();
const digestRepository = new SQLiteDigestRepository();
const fileWatcher = new ChokidarFileWatcher();
const hashService = new CryptoHashService();
const digestParser = new SupernoteDigestParser();

// Use Case Creation
const processDigestUseCase = new ProcessDigestUseCase(digestRepository, digestParser);
const watchFilesUseCase = new WatchFilesUseCase(fileRepository, fileWatcher, hashService, processDigestUseCase);

// Start Pipeline
await watchFilesUseCase.execute();
```

### 2. **File System Monitoring** (`WatchFilesUseCase.execute()`)
```typescript
await this.fileWatcher.watch(
  config.fileWatcher.pattern,  // "*.txt"
  config.fileWatcher.directory, // "./files"
  async (filePath) => {
    await this.handleFileChange(filePath);  // Callback for each file change
  }
);
```

### 3. **File Change Detection** (`WatchFilesUseCase.handleFileChange()`)
```typescript
// Step 1: Compute file hash
const newHash = await this.hashService.computeFileHash(filePath);

// Step 2: Check if file exists in database
const existingFile = await this.fileRepository.findByPath(filePath);

// Step 3: Determine if file is new or changed
if (existingFile) {
  if (existingFile.hasChanged(newHash)) {
    // File content changed - update hash
    await this.fileRepository.save(updatedFile);
    
    // Step 4: Check if it's a digest file
    if (this.isDigestFile(filePath)) {
      await this.processDigestUseCase.execute(filePath);
    }
  }
} else {
  // New file - save to database
  await this.fileRepository.save(newFile);
  
  // Step 4: Check if it's a digest file
  if (this.isDigestFile(filePath)) {
    await this.processDigestUseCase.execute(filePath);
  }
}
```

### 4. **Vocabulary Extraction Trigger**
All watched text files (e.g., `*.txt`) are processed for vocabulary extraction on add and on content change — no filename filter is applied.

### 5. **Digest Processing** (`ProcessDigestUseCase.execute()`)
```typescript
// Step 1: Read file content
const content = await fs.readFile(filePath, 'utf-8');

// Step 2: Parse digest entries
const entries = await this.digestParser.parse(content, filePath);

// Step 3: Process each entry
for (const entry of entries) {
  await this.digestRepository.upsert(entry);
}
```

### 6. **Digest Parsing** (`SupernoteDigestParser.parse()`)
```typescript
// Parse Supernote format:
// word
// [book_filename](Document/book_filename)
const entries = await this.digestParser.parse(content, filePath);
```

### 7. **Database Storage** (`SQLiteDigestRepository.upsert()`)
```typescript
// Step 1: Check if word already exists
const existing = await this.findByWord(entry.word);

if (existing) {
  console.log(`Word "${entry.word}" already exists, skipping...`);
  return; // Skip insertion
}

// Step 2: Insert new word
await this.db.run(
  'INSERT INTO digest_entries (word, book_filename, source_file, created_at) VALUES (?, ?, ?, ?)',
  [entry.word, entry.bookFilename, entry.sourceFile, entry.createdAt.getTime()]
);
```

## Pipeline Triggers

### **New File Detection**
1. File system event → Chokidar
2. Hash computation → Crypto service
3. Database check → File repository
4. New file save → File repository
5. Vocabulary extraction → ProcessDigestUseCase
6. Vocabulary storage → Digest repository

### **File Change Detection**
1. File system event → Chokidar
2. Hash computation → Crypto service
3. Database check → File repository
4. Hash comparison → WatchFilesUseCase
5. Hash update → File repository
6. Vocabulary extraction → ProcessDigestUseCase
7. Vocabulary storage → Digest repository

## Error Handling

Each step in the pipeline includes error handling:
- **File reading errors**: Caught in ProcessDigestUseCase
- **Database errors**: Caught in repository implementations
- **Parsing errors**: Caught in ProcessDigestUseCase
- **File system errors**: Caught in WatchFilesUseCase

## Performance Considerations

- **Debouncing**: File watcher uses configurable debounce (default: 1000ms)
- **Batch processing**: ProcessDigestUseCase supports batch file processing
- **Database transactions**: SQLiteDigestRepository uses transactions for bulk operations
- **Memory efficiency**: Files are read and processed one at a time

## Configuration

The pipeline is configurable through environment variables:
- `WATCH_PATTERN`: File pattern to watch (default: "*.txt")
- `WATCH_DIRECTORY`: Directory to monitor (default: "./files")
- `WATCH_DEBOUNCE_MS`: Debounce time in milliseconds (default: 1000)
- `DATABASE_PATH`: SQLite database path (all tables in one file)
