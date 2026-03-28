// RestoreAssist Design Tokens
// Matches web app color system for brand consistency

export const Colors = {
  light: {
    primary: '#0F172A',       // Slate 900
    primaryLight: '#1E293B',  // Slate 800
    accent: '#2563EB',        // Blue 600
    accentLight: '#3B82F6',   // Blue 500
    success: '#16A34A',       // Green 600
    warning: '#D97706',       // Amber 600
    danger: '#DC2626',        // Red 600
    background: '#FFFFFF',
    surface: '#F8FAFC',       // Slate 50
    surfaceAlt: '#F1F5F9',    // Slate 100
    border: '#E2E8F0',        // Slate 200
    text: '#0F172A',          // Slate 900
    textSecondary: '#64748B', // Slate 500
    textMuted: '#94A3B8',     // Slate 400
  },
  dark: {
    primary: '#F8FAFC',
    primaryLight: '#E2E8F0',
    accent: '#3B82F6',
    accentLight: '#60A5FA',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    background: '#0F172A',
    surface: '#1E293B',
    surfaceAlt: '#334155',
    border: '#475569',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  display: 40,
} as const;

export const BorderRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
// S500:2025 Water Damage Category Colors
export const CategoryColors = {
  CAT_1: '#3B82F6', // Blue - Clean water
  CAT_2: '#F59E0B', // Amber - Grey water
  CAT_3: '#DC2626', // Red - Black water (hazardous)
} as const;

// S500:2025 Water Damage Class Colors
export const ClassColors = {
  CLASS_1: '#22C55E', // Green - Least damage
  CLASS_2: '#3B82F6', // Blue - Moderate
  CLASS_3: '#F59E0B', // Amber - Significant
  CLASS_4: '#DC2626', // Red - Specialty drying
} as const;