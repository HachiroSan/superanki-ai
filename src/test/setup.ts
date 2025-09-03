// Global test setup
import { config } from 'dotenv';

// Load environment variables for tests
config({ path: '.env.test' });

// Global test timeout: longer for live integration runs
const baseTimeout = process.env.RUN_LLM_INTEGRATION === '1' ? 60000 : 10000;
jest.setTimeout(baseTimeout);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
