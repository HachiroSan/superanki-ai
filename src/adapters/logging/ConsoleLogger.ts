import { Logger } from '../../core/services/Logger';
import fs from 'fs';
import path from 'path';

type RotationMode = 'none' | 'daily' | 'size';

export class ConsoleLogger implements Logger {
  private timers: Map<string, number> = new Map();
  private logLevel: 'debug' | 'info' | 'warn' | 'error';
  private filePath?: string;
  private stream?: fs.WriteStream;
  private rotation: RotationMode = 'none';
  private maxSizeBytes: number = 10 * 1024 * 1024; // 10MB default
  private maxFiles: number = 5;
  private currentDateToken?: string; // YYYY-MM-DD for daily rotation
  private currentSize: number = 0;

  constructor(
    logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info',
    filePath?: string,
    options?: { rotate?: RotationMode; maxSizeBytes?: number; maxFiles?: number }
  ) {
    this.logLevel = logLevel;
    this.filePath = filePath;
    this.rotation = options?.rotate ?? 'none';
    if (options?.maxSizeBytes) this.maxSizeBytes = options.maxSizeBytes;
    if (options?.maxFiles) this.maxFiles = options.maxFiles;
    if (filePath) this.openStreamForPath(filePath);
  }

  private ensureDirectory(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  private dateToken(d: Date = new Date()): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private buildDailyPath(basePath: string, token: string): string {
    const ext = path.extname(basePath);
    const name = path.basename(basePath, ext);
    const dir = path.dirname(basePath);
    const filename = `${name}-${token}${ext || '.log'}`;
    return path.join(dir, filename);
  }

  private getInitialSize(p: string): number {
    try {
      const st = fs.statSync(p);
      return st.size;
    } catch {
      return 0;
    }
  }

  private openStreamForPath(basePath: string): void {
    this.ensureDirectory(basePath);
    let targetPath = basePath;
    if (this.rotation === 'daily') {
      const tok = this.dateToken();
      this.currentDateToken = tok;
      targetPath = this.buildDailyPath(basePath, tok);
    }
    this.stream = fs.createWriteStream(targetPath, { flags: 'a', encoding: 'utf8' });
    this.currentSize = this.getInitialSize(targetPath);

    const close = () => {
      if (this.stream) {
        try { this.stream.end(); } catch {}
        this.stream = undefined;
      }
    };
    process.once('exit', close);
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  }

  private rotateIfNeeded(extraBytes: number): void {
    if (!this.filePath || !this.stream) return;
    if (this.rotation === 'daily') {
      const tok = this.dateToken();
      if (tok !== this.currentDateToken) {
        // Open new dated file
        try { this.stream.end(); } catch {}
        this.stream = undefined;
        this.openStreamForPath(this.filePath);
        this.pruneDailyFiles();
      }
      return;
    }
    if (this.rotation === 'size') {
      if (this.currentSize + extraBytes <= this.maxSizeBytes) return;
      // Size-based rotation: app.log -> app.log.1, shift up to maxFiles-1
      const dir = path.dirname(this.filePath);
      const base = path.basename(this.filePath);
      try { this.stream.end(); } catch {}
      this.stream = undefined;
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const src = path.join(dir, `${base}.${i}`);
        const dst = path.join(dir, `${base}.${i + 1}`);
        if (fs.existsSync(src)) {
          try { fs.renameSync(src, dst); } catch {}
        }
      }
      const first = path.join(dir, `${base}.1`);
      if (fs.existsSync(this.filePath)) {
        try { fs.renameSync(this.filePath, first); } catch {}
      }
      this.openStreamForPath(this.filePath);
      // currentSize reset by openStreamForPath
      return;
    }
  }

  private pruneDailyFiles(): void {
    if (!this.filePath) return;
    if (this.maxFiles <= 0) return;
    const dir = path.dirname(this.filePath);
    const ext = path.extname(this.filePath);
    const name = path.basename(this.filePath, ext);
    const prefix = name + '-';
    const entries = fs.readdirSync(dir).filter(f => f.startsWith(prefix) && f.endsWith(ext || '.log'));
    if (entries.length <= this.maxFiles) return;
    // Sort lexicographically which works for YYYY-MM-DD tokens
    entries.sort();
    const toDelete = entries.slice(0, entries.length - this.maxFiles);
    for (const f of toDelete) {
      try { fs.unlinkSync(path.join(dir, f)); } catch {}
    }
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  private safeStringify(arg: any): string {
    if (arg instanceof Error) {
      return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`;
    }
    if (typeof arg === 'string') return arg;
    try {
      return JSON.stringify(arg);
    } catch {
      return String(arg);
    }
  }

  private writeToFile(level: 'debug' | 'info' | 'warn' | 'error', message: string, args: any[]): void {
    if (!this.stream) return;
    const line = this.formatMessage(level, message);
    const extras = args && args.length ? ' ' + args.map(a => this.safeStringify(a)).join(' ') : '';
    const bytes = Buffer.byteLength(line + extras + '\n', 'utf8');
    this.rotateIfNeeded(bytes);
    try {
      if (!this.stream) return; // may have rotated
      this.stream.write(line + extras + '\n');
      this.currentSize += bytes;
    } catch {}
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      const line = this.formatMessage('debug', message);
      console.debug(line, ...args);
      this.writeToFile('debug', message, args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      const line = this.formatMessage('info', message);
      console.info(line, ...args);
      this.writeToFile('info', message, args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      const line = this.formatMessage('warn', message);
      console.warn(line, ...args);
      this.writeToFile('warn', message, args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      const line = this.formatMessage('error', message);
      console.error(line, ...args);
      this.writeToFile('error', message, args);
    }
  }

  time(label: string): void {
    this.timers.set(label, Date.now());
    this.debug(`Timer '${label}' started`);
  }

  timeEnd(label: string): number {
    const startTime = this.timers.get(label);
    if (startTime === undefined) {
      this.warn(`Timer '${label}' does not exist`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.timers.delete(label);
    this.info(`Timer '${label}': ${duration}ms`);
    return duration;
  }

  timeLog(label: string, message?: string, ...args: any[]): void {
    const startTime = this.timers.get(label);
    if (startTime === undefined) {
      this.warn(`Timer '${label}' does not exist`);
      return;
    }

    const duration = Date.now() - startTime;
    const logMessage = message ? `${message} (${duration}ms)` : `Timer '${label}': ${duration}ms`;
    this.info(logMessage, ...args);
  }
}
