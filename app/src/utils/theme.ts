import { TextStyle, Platform, ViewStyle } from 'react-native';

export const TOUCH_TARGET = 48;

export const colors = {
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#94A3B8',
  border: '#E5E7EB',

  // Status Colors (Solid)
  safe: '#10B981',
  warning: '#F59E0B',
  emergency: '#EF4444',
  offline: '#9CA3AF',
  info: '#3B82F6',

  // Soft Status Tints with Readable Dark Text
  safeSoft: '#DCFCE7',
  safeText: '#166534',
  warningSoft: '#FEF3C7',
  warningText: '#92400E',
  emergencySoft: '#FEE2E2',
  emergencyText: '#991B1B',
  infoSoft: '#E0F2FE',
  infoText: '#075985',
  offlineSoft: '#F1F5F9',
  offlineText: '#475569',

  // Primary Brand
  primary: '#0EA5E9',
  primaryDark: '#0284C7',
  primarySoft: '#E0F2FE',
  primaryText: '#0369A1',
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
  xl: 24,
  full: 9999,
};

export const shadows = {
  sm: Platform.select<ViewStyle>({
    web: { boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' } as any,
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
  }) || {},
  md: Platform.select<ViewStyle>({
    web: { boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)' } as any,
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
  }) || {},
  lg: Platform.select<ViewStyle>({
    web: { boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)' } as any,
    default: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 5,
    },
  }) || {},
};

export const typography = {
  display: { fontSize: 32, fontWeight: '700' as TextStyle['fontWeight'], letterSpacing: -0.5 },
  h1: { fontSize: 32, fontWeight: '700' as TextStyle['fontWeight'] },
  h2: { fontSize: 24, fontWeight: '700' as TextStyle['fontWeight'] },
  h3: { fontSize: 20, fontWeight: '600' as TextStyle['fontWeight'] },
  body1: { fontSize: 16, fontWeight: '400' as TextStyle['fontWeight'] },
  body2: { fontSize: 14, fontWeight: '400' as TextStyle['fontWeight'] },
  label: { fontSize: 13, fontWeight: '600' as TextStyle['fontWeight'] },
  caption: { fontSize: 12, fontWeight: '400' as TextStyle['fontWeight'] },
};

export type Tone = 'safe' | 'warning' | 'emergency' | 'info' | 'offline' | 'primary' | 'neutral';

export interface ToneColorSet {
  solid: string;
  bg: string;
  text: string;
  border: string;
  icon: string;
}

export const toneColors = (tone: Tone): ToneColorSet => {
  switch (tone) {
    case 'safe':
      return {
        solid: colors.safe,
        bg: colors.safeSoft,
        text: colors.safeText,
        border: '#86EFAC',
        icon: '#15803D',
      };
    case 'warning':
      return {
        solid: colors.warning,
        bg: colors.warningSoft,
        text: colors.warningText,
        border: '#FDE68A',
        icon: '#B45309',
      };
    case 'emergency':
      return {
        solid: colors.emergency,
        bg: colors.emergencySoft,
        text: colors.emergencyText,
        border: '#FECACA',
        icon: '#DC2626',
      };
    case 'info':
      return {
        solid: colors.info,
        bg: colors.infoSoft,
        text: colors.infoText,
        border: '#BAE6FD',
        icon: '#0284C7',
      };
    case 'primary':
      return {
        solid: colors.primary,
        bg: colors.primarySoft,
        text: colors.primaryText,
        border: '#BAE6FD',
        icon: colors.primaryDark,
      };
    case 'offline':
      return {
        solid: colors.offline,
        bg: colors.offlineSoft,
        text: colors.offlineText,
        border: '#E2E8F0',
        icon: '#64748B',
      };
    case 'neutral':
    default:
      return {
        solid: colors.textSecondary,
        bg: colors.surfaceAlt,
        text: colors.textPrimary,
        border: colors.border,
        icon: colors.textSecondary,
      };
  }
};
