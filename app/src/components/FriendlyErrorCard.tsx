import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  AlertTriangle,
  WifiOff,
  BluetoothOff,
  ShieldAlert,
  Radio,
  Lock,
  RefreshCw,
  HelpCircle,
} from 'lucide-react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { strings } from '../constants/strings';

export type FriendlyErrorKey =
  | 'wrongPassword'
  | 'fiveGhzNetwork'
  | 'deviceNotFound'
  | 'bluetoothOff'
  | 'permissionDenied'
  | 'deviceOutOfRange'
  | 'hotspotWpa3'
  | 'wifiTimeout'
  | 'authRateLimited'
  | 'deviceNotResponding'
  | 'generalError';

interface FriendlyErrorCardProps {
  errorKey?: FriendlyErrorKey;
  customTitle?: string;
  customDescription?: string;
  customWhatToDo?: string;
  onAction?: () => void;
  actionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionLabel?: string;
}

export const FriendlyErrorCard: React.FC<FriendlyErrorCardProps> = ({
  errorKey = 'generalError',
  customTitle,
  customDescription,
  customWhatToDo,
  onAction,
  actionLabel,
  onSecondaryAction,
  secondaryActionLabel,
}) => {
  const errorInfo = strings.errors[errorKey] || strings.errors.generalError;

  const title = customTitle || errorInfo.title;
  const description = customDescription || errorInfo.description;
  const whatToDo = customWhatToDo || errorInfo.whatToDo;
  const primaryButtonLabel = actionLabel || errorInfo.action;

  const getIcon = () => {
    switch (errorKey) {
      case 'wrongPassword':
        return <Lock size={22} color={colors.warningText} />;
      case 'fiveGhzNetwork':
      case 'hotspotWpa3':
      case 'wifiTimeout':
        return <WifiOff size={22} color={colors.emergencyText} />;
      case 'bluetoothOff':
        return <BluetoothOff size={22} color={colors.emergencyText} />;
      case 'permissionDenied':
        return <ShieldAlert size={22} color={colors.warningText} />;
      case 'deviceNotFound':
      case 'deviceOutOfRange':
      case 'deviceNotResponding':
        return <Radio size={22} color={colors.emergencyText} />;
      default:
        return <AlertTriangle size={22} color={colors.emergencyText} />;
    }
  };

  return (
    <View
      style={styles.card}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${description}. What to do: ${whatToDo}`}
    >
      <View style={styles.headerRow}>
        <View style={styles.iconCircle}>{getIcon()}</View>
        <Text style={styles.titleText}>{title}</Text>
      </View>

      <Text style={styles.descText}>{description}</Text>

      {/* Explicit What To Do Action Box */}
      <View style={styles.whatToDoBox}>
        <View style={styles.whatToDoHeader}>
          <HelpCircle size={15} color={colors.primaryDark} />
          <Text style={styles.whatToDoLabel}>What to do:</Text>
        </View>
        <Text style={styles.whatToDoText}>{whatToDo}</Text>
      </View>

      {/* Buttons */}
      <View style={styles.actionsRow}>
        {onAction && (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onAction}
            activeOpacity={0.8}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={primaryButtonLabel}
          >
            <RefreshCw size={16} color={colors.surface} />
            <Text style={styles.primaryBtnText}>{primaryButtonLabel}</Text>
          </TouchableOpacity>
        )}

        {onSecondaryAction && (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onSecondaryAction}
            activeOpacity={0.8}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={secondaryActionLabel || strings.common.cancel}
          >
            <Text style={styles.secondaryBtnText}>{secondaryActionLabel || strings.common.cancel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginVertical: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  titleText: {
    ...typography.h3,
    fontSize: 16,
    fontWeight: '700',
    color: '#991B1B',
    flex: 1,
  },
  descText: {
    ...typography.body2,
    color: '#7F1D1D',
    marginBottom: spacing.sm,
    lineHeight: 20,
  },
  whatToDoBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  whatToDoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  whatToDoLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  whatToDoText: {
    ...typography.caption,
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 44, // WCAG 44px touch target
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  primaryBtnText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});

