/**
 * @file remotion/lib/brand.ts
 * Canonical RestoreAssist brand constants for all Remotion compositions.
 * Source of truth: AGENTS.md line 14 — navy #1C2E47 · warm #8A6B4E · light #D4A574 · bg #050505
 */

export const RA = {
  /* Brand primitives */
  navy: '#1C2E47',
  navyLight: '#2C4A6F',
  warm: '#8A6B4E',
  warmLight: '#D4A574',
  bgDark: '#050505',
  bgCard: '#0A0A0A',

  /* Derived semantic colours */
  textPrimary: '#FFFFFF',
  textSecondary: '#D4A574',
  textMuted: '#A0937D',
  accent: '#8A6B4E',
  accentLight: '#D4A574',

  /* Functional — sparing use only */
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',

  /* Layout */
  border: '#2A3A55',
  surface: '#1C2E47',
  surfaceLight: '#2C4A6F',
} as const;

export const RA_FONTS = {
  body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  heading: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace',
} as const;

export const RA_URL = 'restoreassist.com.au';

export type RAColour = typeof RA[keyof typeof RA];
