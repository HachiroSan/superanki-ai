export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  
  // Time tracking methods
  time(label: string): void;
  timeEnd(label: string): number; // Returns duration in ms
  timeLog(label: string, message?: string, ...args: any[]): void;
}
