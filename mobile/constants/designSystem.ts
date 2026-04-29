/**
 * Design System Constants
 * Unified design tokens for colors, spacing, shadows, typography, and more
 */

// Color Palette
export const COLORS = {
  // Primary (existing, enhanced)
  primary: {
    dark: '#1B4332',    // Base dark green
    main: '#2D6A4F',    // Accent green
    light: '#52B788',   // Light green
  },
  // New vibrancy
  accent: {
    orange: '#FFB703',  // Primary CTA
    orangeLight: '#FF8C42',
    blue: '#00B4D8',    // Data viz
    success: '#06D6A0', // Confirmations
    warning: '#FF6B6B', // Warnings
  },
  // Neutral
  neutral: {
    white: '#FFFFFF',
    lightBg: '#F0F4F8',
    muted: '#889AAA',
    dark: '#1A1A1A',
  },
} as const;

// Spacing System (8px grid base)
export const SPACING = {
  xs: 4,      // 4px - minimal spacing
  sm: 8,      // 8px - small spacing
  md: 12,     // 12px - medium spacing
  lg: 16,     // 16px - large spacing
  xl: 24,     // 24px - extra large spacing
  xxl: 32,    // 32px - double extra large spacing
  xxxl: 48,   // 48px - triple extra large spacing
} as const;

// Padding Shortcuts
export const PADDING = {
  container: 24,    // 24px - container padding
  card: 16,         // 16px - card/modal padding
  component: 12,    // 12px - component padding
} as const;

// Gap Shortcuts
export const GAP = {
  cards: 16,        // 16px - gap between cards
  sections: 32,     // 32px - gap between sections
} as const;

// Shadow Style Interface
interface ShadowStyle {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

// Shadow Elevation System
export const SHADOWS = {
  elevation1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  elevation2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 5,
  },
  elevation3: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
  },
} as const satisfies Record<string, ShadowStyle>;

// Border Radius Scale
export const BORDER_RADIUS = {
  none: 0,        // 0px - no rounding
  sm: 8,          // 8px - small radius
  md: 12,         // 12px - medium radius
  lg: 16,         // 16px - large radius
  xl: 20,         // 20px - extra large radius
  full: 9999,     // 9999px - fully rounded (circle)
} as const;

// Typography Hierarchy
export const TYPOGRAPHY = {
  h1: {
    fontSize: 32,
    fontWeight: 800,
    lineHeight: 40,
  },
  h2: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 36,
  },
  h3: {
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 32,
  },
  bodyLarge: {
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 16,
  },
} as const;

// Type exports for use with as const
export type Colors = typeof COLORS;
export type Spacing = typeof SPACING;
export type Padding = typeof PADDING;
export type Gap = typeof GAP;
export type Shadows = typeof SHADOWS;
export type BorderRadius = typeof BORDER_RADIUS;
export type Typography = typeof TYPOGRAPHY;
