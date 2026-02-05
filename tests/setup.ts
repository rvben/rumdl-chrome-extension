// Test setup - Mock Chrome APIs

import { vi } from 'vitest';

// Mock chrome.storage
const mockStorage: Record<string, unknown> = {};

const mockChrome = {
  storage: {
    sync: {
      get: vi.fn((key: string) => Promise.resolve({ [key]: mockStorage[key] })),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
    onMessage: {
      addListener: vi.fn(),
    },
  },
};

// Expose mock chrome globally
(globalThis as unknown as { chrome: typeof mockChrome }).chrome = mockChrome;

// Helper to reset mocks between tests
export function resetChromeMocks(): void {
  Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
  vi.clearAllMocks();
}

// Helper to set mock storage data
export function setMockStorage(key: string, value: unknown): void {
  mockStorage[key] = value;
}

// Helper to get mock storage data
export function getMockStorage(key: string): unknown {
  return mockStorage[key];
}

// Export mock for direct access in tests
export { mockChrome };
