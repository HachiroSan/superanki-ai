export interface FileWatcher {
  watch(pattern: string, directory: string, onChanged: (filePath: string) => void): Promise<void>;
  stop(): Promise<void>;
}
