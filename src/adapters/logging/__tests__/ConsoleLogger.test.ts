import { ConsoleLogger } from '../ConsoleLogger';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new ConsoleLogger('debug');
    consoleSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    // Clear any remaining timers
    jest.clearAllTimers();
  });

  describe('time tracking', () => {
    it('should track and log timing information', (done) => {
      const consoleTimeSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.time('test-timer-1');
      
      // Simulate some work
      setTimeout(() => {
        const duration = logger.timeEnd('test-timer-1');
        expect(duration).toBeGreaterThan(0);
        expect(consoleTimeSpy).toHaveBeenCalledWith(
          expect.stringContaining('[INFO] Timer \'test-timer-1\':')
        );
        consoleTimeSpy.mockRestore();
        done();
      }, 10);
    });

    it('should handle timeLog correctly', (done) => {
      const consoleTimeSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.time('test-timer-2');
      
      setTimeout(() => {
        logger.timeLog('test-timer-2', 'Custom message');
        expect(consoleTimeSpy).toHaveBeenCalledWith(
          expect.stringContaining('[INFO] Custom message')
        );
        consoleTimeSpy.mockRestore();
        done();
      }, 10);
    });

    it('should warn when timer does not exist', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      logger.timeEnd('non-existent-timer');
      
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] Timer \'non-existent-timer\' does not exist')
      );
      consoleWarnSpy.mockRestore();
    });
  });

  describe('log levels', () => {
    it('should respect log level filtering', () => {
      // Create a fresh logger instance for this test
      const infoLogger = new ConsoleLogger('info');
      
      // Mock console methods specifically for this test
      const originalDebug = console.debug;
      const originalInfo = console.info;
      
      let debugCalled = false;
      let infoCalled = false;
      
      console.debug = jest.fn(() => { debugCalled = true; });
      console.info = jest.fn(() => { infoCalled = true; });
      
      infoLogger.debug('Debug message');
      infoLogger.info('Info message');
      
      expect(debugCalled).toBe(false);
      expect(infoCalled).toBe(true);
      
      // Restore original methods
      console.debug = originalDebug;
      console.info = originalInfo;
    });
  });

  describe('message formatting', () => {
    it('should format messages with timestamp and level', () => {
      const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.info('Test message');
      
      expect(consoleInfoSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test message$/)
      );
      
      consoleInfoSpy.mockRestore();
    });
  });
});
