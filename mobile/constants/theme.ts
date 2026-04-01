/**
 * Design tokens — dark theme for field use.
 * Glove-compatible targets (56px min), high contrast for sunlight readability.
 */

export const colors = {
  bg: '#050505',
  surface: '#0A0A0A',
  card: '#111111',
  border: '#1C2E47',
  muted: '#8A6B4E',
  text: '#FFFFFF',
  textSecondary: '#999999',
  accent: '#00F5FF',
  success: '#22C55E',
  error: '#EF4444',
  warning: '#F59E0B',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const input = {
  height: 56,
  borderRadius: 12,
  fontSize: 16,
  paddingHorizontal: 16,
} as const;

export const tapTarget = {
  minHeight: 56,
  minWidth: 56,
} as const;
