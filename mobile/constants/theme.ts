/**
 * Design tokens — Precision Field Instrument theme.
 * Dark navy foundation + warm ochre structure + cyan interaction layer.
 * Glove-compatible targets (56px min), WCAG AA contrast for sunlight readability.
 */

export const colors = {
  // Backgrounds — depth through blue-grey tint
  bg: '#050505',
  surface: '#08111B',
  card: '#0B1928',        // deep navy — feels purposeful, not generic grey
  cardHeader: '#0E2038',  // slightly elevated header within cards

  // Borders
  border: '#1C2E47',
  borderLight: '#243D60',
  borderFocus: '#00F5FF',

  // Warm structure — ochre for labels, section titles, UI scaffolding
  muted: '#8A6B4E',       // section titles, decorative
  label: '#C49B7A',       // input labels — warm, readable, not "disabled"-looking

  // Text
  text: '#FFFFFF',
  textSecondary: '#7A8B9A',  // cool-grey, reads well on navy

  // Action / interaction
  accent: '#00F5FF',
  accentDim: 'rgba(0, 245, 255, 0.10)',
  accentPress: 'rgba(0, 245, 255, 0.20)',

  // Status
  success: '#22C55E',
  successDim: 'rgba(34, 197, 94, 0.12)',
  error: '#EF4444',
  errorDim: 'rgba(239, 68, 68, 0.12)',
  warning: '#F59E0B',
  warningDim: 'rgba(245, 158, 11, 0.12)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 16,
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

// Elevation / shadow tokens
export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 4,
  },
  fab: {
    shadowColor: '#00F5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
} as const;
