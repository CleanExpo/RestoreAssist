/**
 * Vitest-only replacement for Next.js's `server-only` boundary marker.
 *
 * Production builds still resolve the real Next.js marker. This file exists
 * solely because the standalone Vite resolver does not install Next's alias.
 */
export {};
