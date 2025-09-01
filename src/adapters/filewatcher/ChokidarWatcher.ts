import chokidar from 'chokidar';
import { FileWatcher } from '../../core/services/FileWatcher';
import { config } from '../../config';

export class ChokidarFileWatcher implements FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;

  async watch(pattern: string, directory: string, onChanged: (filePath: string) => void): Promise<void> {
    const fullPattern = `${directory}/${pattern}`;
    
    this.watcher = chokidar.watch(fullPattern, {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: config.fileWatcher.debounceMs,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (filePath) => {
        console.log(`File added: ${filePath}`);
        onChanged(filePath);
      })
      .on('change', (filePath) => {
        console.log(`File changed: ${filePath}`);
        onChanged(filePath);
      })
      .on('unlink', (filePath) => {
        console.log(`File removed: ${filePath}`);
        // You might want to handle file deletion here
      })
      .on('error', (error) => {
        console.error('Watcher error:', error);
      });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
