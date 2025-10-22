/**
 * Frontend Test Utilities
 *
 * Common utilities for React component testing, E2E test fixtures,
 * and mock data generation.
 */

import { render, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

// ========================================
// React Testing Library Helpers
// ========================================

/**
 * Wrapper component for testing with Router
 */
function AllTheProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );
}

/**
 * Custom render function with providers
 */
export function renderWithRouter(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

/**
 * Custom render for component testing
 */
export function renderComponent(
  component: ReactElement,
  options?: RenderOptions
) {
  return render(component, options);
}

// ========================================
// Mock Data Factories
// ========================================

/**
 * Create a mock user object
 */
export function createMockUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-' + Date.now(),
    email: 'test@example.com',
    name: 'Test User',
    picture: 'https://example.com/avatar.jpg',
    googleId: 'google-123',
    ...overrides,
  };
}

/**
 * Create a mock subscription object
 */
export function createMockSubscription(overrides: Partial<any> = {}) {
  return {
    id: 'sub-' + Date.now(),
    userId: 'user-123',
    planType: 'monthly',
    status: 'active',
    reportsUsed: 0,
    reportsLimit: null,
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

/**
 * Create a mock report object
 */
export function createMockReport(overrides: Partial<any> = {}) {
  return {
    id: 'report-' + Date.now(),
    userId: 'user-123',
    propertyAddress: '123 Test Street',
    damageType: 'water',
    severity: 'moderate',
    description: 'Test damage description',
    aiAnalysis: 'AI analysis results',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock OAuth response
 */
export function createMockOAuthResponse(overrides: Partial<any> = {}) {
  return {
    credential: 'mock-jwt-token',
    clientId: 'test-client-id',
    select_by: 'btn',
    ...overrides,
  };
}

// ========================================
// Local Storage Helpers
// ========================================

/**
 * Mock localStorage for testing
 */
export class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }

  get length(): number {
    return Object.keys(this.store).length;
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
}

/**
 * Setup localStorage mock for tests
 */
export function setupLocalStorageMock() {
  const mockStorage = new MockLocalStorage();

  global.localStorage = mockStorage as any;

  return mockStorage;
}

/**
 * Set test data in localStorage
 */
export function setLocalStorageItem(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * Get test data from localStorage
 */
export function getLocalStorageItem<T>(key: string): T | null {
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : null;
}

// ========================================
// API Mocking Helpers
// ========================================

/**
 * Create a mock fetch response
 */
export function createMockFetchResponse<T>(data: T, options: { status?: number; ok?: boolean } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
    blob: async () => new Blob([JSON.stringify(data)]),
    headers: new Headers(),
  } as Response;
}

/**
 * Mock fetch globally
 */
export function mockFetch(responses: Array<{ url: string | RegExp; response: any }>) {
  global.fetch = jest.fn((url: string) => {
    const match = responses.find(r =>
      typeof r.url === 'string' ? r.url === url : r.url.test(url)
    );

    if (match) {
      return Promise.resolve(createMockFetchResponse(match.response));
    }

    return Promise.reject(new Error(`No mock response for ${url}`));
  }) as any;
}

/**
 * Reset fetch mock
 */
export function resetFetchMock() {
  if (global.fetch && typeof (global.fetch as any).mockReset === 'function') {
    (global.fetch as any).mockReset();
  }
}

// ========================================
// Form Testing Helpers
// ========================================

/**
 * Fill form input by label
 */
export async function fillInput(
  getByLabelText: any,
  label: string | RegExp,
  value: string
) {
  const input = getByLabelText(label);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Submit form
 */
export async function submitForm(form: HTMLFormElement) {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

// ========================================
// Async Testing Utilities
// ========================================

/**
 * Wait for condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 100 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Delay execution
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========================================
// Error Testing Helpers
// ========================================

/**
 * Suppress console errors during test
 */
export function suppressConsoleError() {
  const originalError = console.error;

  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  return () => {
    console.error = originalError;
  };
}

/**
 * Capture console errors
 */
export function captureConsoleErrors() {
  const errors: any[] = [];
  const originalError = console.error;

  console.error = (...args: any[]) => {
    errors.push(args);
    originalError(...args);
  };

  return {
    errors,
    restore: () => {
      console.error = originalError;
    },
  };
}

// ========================================
// Route Testing Helpers
// ========================================

/**
 * Mock window.location
 */
export function mockWindowLocation(url: string) {
  const location = new URL(url);

  delete (window as any).location;
  window.location = {
    ...location,
    ancestorOrigins: {} as any,
    assign: jest.fn(),
    reload: jest.fn(),
    replace: jest.fn(),
  } as any;
}

/**
 * Get current route from window.location
 */
export function getCurrentRoute(): string {
  return window.location.pathname + window.location.search;
}

// ========================================
// Performance Testing
// ========================================

/**
 * Measure component render time
 */
export async function measureRenderTime<T>(
  renderFn: () => T
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = renderFn();
  const duration = performance.now() - start;
  return { result, duration };
}

// ========================================
// Accessibility Testing Helpers
// ========================================

/**
 * Check if element has proper ARIA attributes
 */
export function hasProperAria(element: HTMLElement): boolean {
  // Check for role
  if (!element.getAttribute('role') && !element.tagName.match(/^(BUTTON|INPUT|A|TEXTAREA|SELECT)$/)) {
    return false;
  }

  // Check for label
  const label = element.getAttribute('aria-label') ||
    element.getAttribute('aria-labelledby') ||
    element.textContent;

  return !!label && label.trim().length > 0;
}

/**
 * Check if element is keyboard accessible
 */
export function isKeyboardAccessible(element: HTMLElement): boolean {
  const tabIndex = element.getAttribute('tabindex');
  return tabIndex === null || parseInt(tabIndex) >= 0;
}

// ========================================
// Visual Regression Helpers
// ========================================

/**
 * Wait for images to load
 */
export async function waitForImagesToLoad(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));

  await Promise.all(
    images.map(img =>
      new Promise<void>(resolve => {
        if (img.complete) {
          resolve();
        } else {
          img.addEventListener('load', () => resolve());
          img.addEventListener('error', () => resolve());
        }
      })
    )
  );
}

/**
 * Wait for CSS animations to complete
 */
export async function waitForAnimations(element: HTMLElement): Promise<void> {
  const animations = element.getAnimations();

  if (animations.length === 0) {
    return;
  }

  await Promise.all(animations.map(animation => animation.finished));
}

// ========================================
// Custom Matchers
// ========================================

/**
 * Check if element has specific class
 */
export function hasClass(element: HTMLElement, className: string): boolean {
  return element.classList.contains(className);
}

/**
 * Check if element is visible (not display:none or visibility:hidden)
 */
export function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

// ========================================
// Test Data Generators
// ========================================

/**
 * Generate random email
 */
export function randomEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
}

/**
 * Generate random string
 */
export function randomString(length: number = 10): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Generate test UUID
 */
export function testUUID(): string {
  return 'test-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ========================================
// Export all utilities
// ========================================

export default {
  renderWithRouter,
  renderComponent,
  createMockUser,
  createMockSubscription,
  createMockReport,
  createMockOAuthResponse,
  setupLocalStorageMock,
  setLocalStorageItem,
  getLocalStorageItem,
  createMockFetchResponse,
  mockFetch,
  resetFetchMock,
  fillInput,
  submitForm,
  waitFor,
  delay,
  suppressConsoleError,
  captureConsoleErrors,
  mockWindowLocation,
  getCurrentRoute,
  measureRenderTime,
  hasProperAria,
  isKeyboardAccessible,
  waitForImagesToLoad,
  waitForAnimations,
  hasClass,
  isVisible,
  randomEmail,
  randomString,
  testUUID,
};
