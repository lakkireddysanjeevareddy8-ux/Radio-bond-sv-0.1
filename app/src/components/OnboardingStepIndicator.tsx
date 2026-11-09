import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Bluetooth, Search, Wifi, ShieldCheck, Check } from 'lucide-react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { strings } from '../constants/strings';

export type OnboardingPhase = 'bluetooth' | 'find_device' | 'wifi' | 'verify' | 'done';

interface OnboardingStepIndicatorProps {
  currentPhase: OnboardingPhase;
}

const PHASES: { key: OnboardingPhase; label: string; icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }> }[] = [
  { key: 'bluetooth', label: strings.onboarding.steps.bluetooth, icon: Bluetooth },
  { key: 'find_device', label: strings.onboarding.steps.findDevice, icon: Search },
  { key: 'wifi', label: strings.onboarding.steps.wifi, icon: Wifi },
  { key: 'verify', label: strings.onboarding.steps.verify, icon: ShieldCheck },
  { key: 'done', label: strings.onboarding.steps.done, icon: Check },
];

export const OnboardingStepIndicator: React.FC<OnboardingStepIndicatorProps> = ({ currentPhase }) => {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase);

  return (
    <View
      style={styles.container}
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${currentIndex + 1} of ${PHASES.length}: ${PHASES[currentIndex]?.label}`}
    >
      <View style={styles.track}>
        {PHASES.map((phase, index) => {
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          const Icon = phase.icon;

          return (
            <React.Fragment key={phase.key}>
              {/* Connector line between steps */}
              {index > 0 && (
                <View
                  style={[
                    styles.connector,
                    isCompleted ? styles.connectorCompleted : styles.connectorPending,
                  ]}
                />
              )}

              {/* Step Circle & Label */}
              <View style={styles.stepWrapper}>
                <View
                  style={[
                    styles.circle,
                    isCompleted && styles.circleCompleted,
                    isActive && styles.circleActive,
                  ]}
                  accessible={true}
                  accessibilityLabel={`${phase.label}: ${isCompleted ? 'Completed' : isActive ? 'In Progress' : 'Pending'}`}
                >
                  {isCompleted ? (
                    <Check size={16} color={colors.surface} strokeWidth={2.5} />
                  ) : (
                    <Icon
                      size={16}
                      color={isActive ? colors.surface : colors.textMuted}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.label,
                    isActive && styles.labelActive,
                    isCompleted && styles.labelCompleted,
                  ]}
                  numberOfLines={1}
                >
                  {phase.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connector: {
    flex: 1,
    height: 2,
    marginHorizontal: 2,
    marginBottom: 20, // Align with center of circles
  },
  connectorCompleted: {
    backgroundColor: colors.safe,
  },
  connectorPending: {
    backgroundColor: colors.border,
  },
  stepWrapper: {
    alignItems: 'center',
    width: 62,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  circleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  circleCompleted: {
    backgroundColor: colors.safe,
    borderColor: colors.safe,
  },
  label: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  labelCompleted: {
    color: colors.safeText,
    fontWeight: '600',
  },
});

