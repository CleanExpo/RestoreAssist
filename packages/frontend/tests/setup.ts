/**
 * Vitest Test Setup
 *
 * Global test configuration and environment setup
 */

import { vi } from 'vitest';

// Mock import.meta.env for tests
vi.stubGlobal('import', {
  meta: {
    env: {
      VITE_GOOGLE_CLIENT_ID: '',
      VITE_API_URL: 'http://localhost:3001',
      MODE: 'test',
      DEV: false,
      PROD: false,
      SSR: false,
    },
  },
});
