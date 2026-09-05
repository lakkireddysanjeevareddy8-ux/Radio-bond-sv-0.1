import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { AlertTriangle, Phone, CheckCircle } from 'lucide-react-native';

export const EmergencyScreen: React.FC = () => {
  const { activeEmergency, setActiveEmergency, deviceConfig } = useAppStore();

  if (!activeEmergency) return null;

  const handleResolve = () => {
    setActiveEmergency(null);
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <AlertTriangle color={colors.emergency} size={48} />
          <Text style={styles.title}>POSSIBLE EMERGENCY</Text>
          <Text style={styles.subtitle}>Unusual situation detected. Please respond.</Text>
        </View>

        <View style={styles.detailsContainer}>
          <DetailRow label="Bathroom" value="Main Bathroom" />
          <DetailRow label="Device" value={deviceConfig?.deviceName || 'Unknown'} />
          <DetailRow label="Trigger" value={activeEmergency.trigger.replace(/_/g, ' ')} />
          {activeEmergency.keyword && (
            <DetailRow label="Detected Keyword" value={`"${activeEmergency.keyword}"`} />
          )}
          {activeEmergency.confidence !== undefined && (
            <DetailRow label="Confidence" value={`${Math.round(activeEmergency.confidence * 100)}%`} />
          )}
          <DetailRow
            label="Time"
            value={new Date(activeEmergency.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          />
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={[styles.button, styles.primaryButton]}>
            <Phone color={colors.surface} size={20} />
            <Text style={styles.primaryButtonText}>CALL EMERGENCY CONTACT</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.secondaryButton]}>
            <Phone color={colors.textPrimary} size={20} />
            <Text style={styles.secondaryButtonText}>CALL PRIMARY CONTACT</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.resolveButton]} onPress={handleResolve}>
            <CheckCircle color={colors.safe} size={20} />
            <Text style={styles.resolveButtonText}>MARK AS RESOLVED</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    zIndex: 1000,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.emergency,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  detailsContainer: {
    marginBottom: spacing.xl,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    ...typography.body2,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionsContainer: {
    gap: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.emergency,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.surface,
  },
  secondaryButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  resolveButton: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: colors.safe,
  },
  resolveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.safe,
  },
});
