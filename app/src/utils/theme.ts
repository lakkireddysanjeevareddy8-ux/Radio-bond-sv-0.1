import { TextStyle } from 'react-native';

export const colors = {
  background: '#F9FAFB',
  surface: '#FFFFFF',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',

  // Status Colors
  safe: '#10B981',
  warning: '#F59E0B',
  emergency: '#EF4444',
  offline: '#9CA3AF',
  info: '#3B82F6',

  // Primary brand
  primary: '#0EA5E9',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 9999,
};

export const typography = {
  h1: { fontSize: 32, fontWeight: '700' as TextStyle['fontWeight'] },
  h2: { fontSize: 24, fontWeight: '700' as TextStyle['fontWeight'] },
  h3: { fontSize: 20, fontWeight: '600' as TextStyle['fontWeight'] },
  body1: { fontSize: 16, fontWeight: '400' as TextStyle['fontWeight'] },
  body2: { fontSize: 14, fontWeight: '400' as TextStyle['fontWeight'] },
  caption: { fontSize: 12, fontWeight: '400' as TextStyle['fontWeight'] },
};
