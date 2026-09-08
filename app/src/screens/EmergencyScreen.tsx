import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
  Animated,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { useContactStore } from '../store/useContactStore';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import {
  AlertTriangle,
  Phone,
  CheckCircle,
  Volume2,
  VolumeX,
  ShieldAlert,
  BellRing,
  CircleStop,
} from 'lucide-react-native';
import { EmergencySoundService } from '../services/EmergencySoundService';

export const EmergencyScreen: React.FC = () => {
  const { activeEmergency, setActiveEmergency, deviceConfig } = useAppStore();
  const { getPrimaryContact, contacts } = useContactStore();
  const [isMuted, setIsMuted] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (activeEmergency) {
      // 1. Play continuous emergency alarm siren and continuous vibration
      EmergencySoundService.resetMute();
      setIsMuted(false);
      EmergencySoundService.playEmergencySiren();
      EmergencySoundService.startContinuousVibration();

      // 2. Dispatch system OS notification popup (visible even outside browser/app)
      const triggerLabel = activeEmergency.trigger.replace(/_/g, ' ');
      const keywordInfo = activeEmergency.keyword ? ` (Detected: "${activeEmergency.keyword}")` : '';
      EmergencySoundService.sendSystemNotification(
        '🚨 EMERGENCY ALERT DETECTED!',
        `Immediate response needed! Washroom Safety device detected ${triggerLabel}${keywordInfo}. Tap to view details and call emergency contacts.`,
        activeEmergency.trigger
      );

      // 3. Pulse animation loop
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.04,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    return () => {
      EmergencySoundService.stopAll();
    };
  }, [activeEmergency?.id]);

  if (!activeEmergency) return null;

  const handleToggleMute = () => {
    const muted = EmergencySoundService.toggleMute();
    setIsMuted(muted);
  };

  const handleCall = async (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    const url = `tel:${cleanPhone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported || Platform.OS === 'web') {
        await Linking.openURL(url);
      } else {
        Alert.alert('Call Failed', `Unable to place call to ${phoneNumber}.`);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.open(url, '_self');
      } else {
        Alert.alert('Emergency Contact', `Please dial: ${phoneNumber}`);
      }
    }
  };

  const primaryContact = getPrimaryContact();

  const handleStopEmergency = () => {
    EmergencySoundService.stopAll();
    EmergencySoundService.resetMute();
    setActiveEmergency(null);
  };

  const handleResolve = () => {
    EmergencySoundService.stopAll();
    EmergencySoundService.resetMute();
    setActiveEmergency(null);
  };

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.card, { transform: [{ scale: pulseAnim }] }]}>
        {/* Urgent Alert Banner */}
        <View style={styles.topAlarmBar}>
          <View style={styles.alarmBadge}>
            <BellRing size={16} color="#DC2626" />
            <Text style={styles.alarmBadgeText}>SIREN & VIBRATION ACTIVE</Text>
          </View>

          <TouchableOpacity
            style={[styles.muteBtn, isMuted && styles.muteBtnActive]}
            onPress={handleToggleMute}
            accessibilityRole="button"
            accessibilityLabel={isMuted ? 'Unmute siren' : 'Mute siren'}
          >
            {isMuted ? (
              <>
                <VolumeX size={15} color="#DC2626" />
                <Text style={styles.muteBtnText}>Muted</Text>
              </>
            ) : (
              <>
                <Volume2 size={15} color="#FFFFFF" />
                <Text style={[styles.muteBtnText, { color: '#FFFFFF' }]}>Mute Siren</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <AlertTriangle color="#DC2626" size={44} />
          </View>
          <Text style={styles.title}>EMERGENCY DETECTED</Text>
          <Text style={styles.subtitle}>
            Critical safety event received from your Washroom Safety Gadget.
          </Text>
        </View>

        <View style={styles.detailsContainer}>
          <DetailRow label="Location" value="Main Washroom" />
          <DetailRow label="Device" value={deviceConfig?.deviceName || 'Washroom Safety Gadget'} />
          <DetailRow label="Trigger Source" value={activeEmergency.trigger.replace(/_/g, ' ')} highlight />
          {activeEmergency.keyword && (
            <DetailRow label="Keyword Detected" value={`"${activeEmergency.keyword}"`} highlight />
          )}
          {activeEmergency.confidence !== undefined && (
            <DetailRow label="Confidence" value={`${Math.round(activeEmergency.confidence * 100)}%`} />
          )}
          <DetailRow
            label="Time of Incident"
            value={new Date(activeEmergency.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          />
        </View>

        <View style={styles.actionsContainer}>
          {/* Prominent Stop Button to stop popup, alarm & continuous vibration */}
          <TouchableOpacity
            style={[styles.button, styles.stopAlarmButton]}
            onPress={handleStopEmergency}
            accessibilityRole="button"
            accessibilityLabel="Stop emergency popup, alarm and vibration"
          >
            <CircleStop color="#FFFFFF" size={22} />
            <Text style={styles.stopAlarmButtonText}>STOP ALARM & VIBRATION</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={() => {
              const targetPhone = primaryContact?.phone || (contacts.length > 0 ? contacts[0].phone : '911');
              handleCall(targetPhone);
            }}
          >
            <Phone color="#FFFFFF" size={18} />
            <Text style={styles.primaryButtonText}>
              {primaryContact ? `CALL PRIMARY (${primaryContact.name.toUpperCase()})` : 'CALL EMERGENCY SERVICES'}
            </Text>
          </TouchableOpacity>

          {primaryContact && contacts.length > 1 && (
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={() => {
                const secondary = contacts.find((c) => !c.isPrimary) || primaryContact;
                handleCall(secondary.phone);
              }}
            >
              <Phone color={colors.textPrimary} size={18} />
              <Text style={styles.secondaryButtonText}>
                CALL BACKUP ({contacts.find((c) => !c.isPrimary)?.name.toUpperCase() || 'CONTACT'})
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.button, styles.resolveButton]} onPress={handleResolve}>
            <CheckCircle color={colors.safe} size={18} />
            <Text style={styles.resolveButtonText}>MARK AS RESOLVED & DISMISS</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

const DetailRow = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, highlight && styles.detailValueHighlight]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    zIndex: 999999,
    elevation: 999,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 440,
    borderWidth: 2,
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  topAlarmBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  alarmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  alarmBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  muteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  muteBtnActive: {
    backgroundColor: '#FEE2E2',
  },
  muteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  detailsContainer: {
    marginBottom: spacing.lg,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  detailValueHighlight: {
    color: '#DC2626',
    fontWeight: '800',
  },
  actionsContainer: {
    gap: spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  stopAlarmButton: {
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#B91C1C',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
    paddingVertical: 14,
  },
  stopAlarmButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  primaryButton: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  resolveButton: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: colors.safe,
    marginTop: 4,
  },
  resolveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.safe,
  },
});
