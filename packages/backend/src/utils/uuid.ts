/**
 * UUID Generation Utility
 * Uses native crypto.randomUUID() to avoid ES Module issues in serverless
 */

/**
 * Generate a v4 UUID
 * Uses Node.js built-in crypto module (Node 14.17+)
 */
export function uuidv4(): string {
  // Use native crypto.randomUUID() if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation for older Node versions
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
