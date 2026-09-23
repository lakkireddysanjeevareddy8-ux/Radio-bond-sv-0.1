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
  ScrollView,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { useContactStore } from '../store/useContactStore';
import { colors, spacing, borderRadius } from '../utils/theme';
import {
  AlertTriangle,
  Phone,
  CheckCircle,
  Volume2,
  VolumeX,
  ShieldAlert,
  Clock,
  UserCheck,
  Check,
} from 'lucide-react-native';
import { EmergencySoundService } from '../services/EmergencySoundService';
import { deviceService } from '../services/DeviceCommunicationService';
import { FalseAlarmFeedbackModal } from '../components/FalseAlarmFeedbackModal';

export const EmergencyScreen: React.FC = () => {
  const { activeEmergency, setActiveEmergency, deviceConfig } = useAppStore();
  const { getPrimaryContact, contacts } = useContactStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [showPersonCheckModal, setShowPersonCheckModal] = useState(false);
  const [feedbackModalInfo, setFeedbackModalInfo] = useState<{ eventId: string; deviceId: string } | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (activeEmergency) {
      // 1. Play continuous emergency alarm siren and continuous vibration
      EmergencySoundService.resetMute();
      setIsMuted(false);
      setIsAcknowledged(activeEmergency.status === 'ACKNOWLEDGED');

      EmergencySoundService.dispatchEmergencyNotification(activeEmergency);

      // 2. High-urgency pulsating animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.03,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }

    return () => {
      EmergencySoundService.stopAll();
    };
  }, [activeEmergency?.id, activeEmergency?.eventId]);

  if (feedbackModalInfo) {
    return (
      <FalseAlarmFeedbackModal
        visible={true}
        eventId={feedbackModalInfo.eventId}
        deviceId={feedbackModalInfo.deviceId}
        onDismiss={() => {
          setFeedbackModalInfo(null);
          setActiveEmergency(null);
        }}
        onSubmitComplete={() => {
          setFeedbackModalInfo(null);
          setActiveEmergency(null);
        }}
      />
    );
  }

  if (!activeEmergency) return null;

  const isTest = Boolean(activeEmergency.isTestAlert);
  const deviceName =
    activeEmergency.deviceName ||
    deviceConfig?.deviceName ||
    'Washroom Safety Guardian';

  const durationString = EmergencySoundService.formatDuration(
    activeEmergency.presenceDuration
  );

  const detectedTimeString = activeEmergency.timestamp
    ? new Date(activeEmergency.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const primaryContact = getPrimaryContact();

  const handleToggleMute = () => {
    const muted = EmergencySoundService.toggleMute();
    setIsMuted(muted);
  };

  /**
   * STEP 9: ACKNOWLEDGEMENT FLOW ("I'M CHECKING")
   * ACTIVE -> ACKNOWLEDGED
   * Updates backend and silences loud siren so user can attend to person.
   */
  const handleAcknowledge = async () => {
    setIsAcknowledged(true);
    EmergencySoundService.acknowledgeAlert();

    const eventId = activeEmergency.eventId || activeEmergency.id;
    await deviceService.acknowledgeEmergency(eventId, activeEmergency.deviceId);

    setActiveEmergency({
      ...activeEmergency,
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date().toISOString(),
    });
  };

  /**
   * STEP 10: RESOLVE FLOW
   * ACTIVE / ACKNOWLEDGED -> RESOLVED
   * Updates backend, dismisses alarm, and prompts for feedback.
   */
  const handleResolve = async () => {
    EmergencySoundService.stopAll();
    const eventId = activeEmergency.eventId || activeEmergency.id;
    const devId = activeEmergency.deviceId;
    await deviceService.resolveEmergency(eventId, devId);
    setFeedbackModalInfo({ eventId, deviceId: devId });
  };

  /**
   * STEP 11: CALL CONTACT FLOW
   * Uses normal Android dialer without silently placing calls.
   */
  const handleCallContact = async (phoneNumber?: string) => {
    const phone = phoneNumber || primaryContact?.phone || (contacts.length > 0 ? contacts[0].phone : '');
    if (!phone) {
      Alert.alert('No Contact Configured', 'Please add an emergency contact in the Contacts tab.');
      return;
    }
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const url = `tel:${cleanPhone}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported || Platform.OS === 'web') {
        await Linking.openURL(url);
      } else {
        Alert.alert('Call Failed', `Unable to place call to ${phone}.`);
      }
    } catch {
      if (Platform.OS === 'web') {
        window.open(url, '_self');
      } else {
        Alert.alert('Emergency Contact', `Please dial: ${phone}`);
      }
    }
  };

  return (
    <View style={styles.fullscreenOverlay}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.emergencyContainer, { transform: [{ scale: pulseAnim }] }]}>
          {/* Top Test Banner if in test mode */}
          {isTest && (
            <View style={styles.testBanner}>
              <Text style={styles.testBannerText}>🚨 TEST EMERGENCY ALERT (SIMULATION)</Text>
            </View>
          )}

          {/* Alarm Status & Audio Bar */}
          <View style={styles.statusHeaderBar}>
            <View style={styles.alarmBadge}>
              <ShieldAlert size={18} color="#FFFFFF" />
              <Text style={styles.alarmBadgeText}>
                {isAcknowledged ? 'ACKNOWLEDGED (CHECKING)' : 'CRITICAL ALARM ACTIVE'}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.muteButton, isMuted && styles.muteButtonMuted]}
              onPress={handleToggleMute}
              accessibilityRole="button"
              accessibilityLabel={isMuted ? 'Unmute alarm' : 'Mute alarm'}
            >
              {isMuted ? (
                <>
                  <VolumeX size={16} color="#DC2626" />
                  <Text style={styles.muteButtonTextMuted}>Muted</Text>
                </>
              ) : (
                <>
                  <Volume2 size={16} color="#FFFFFF" />
                  <Text style={styles.muteButtonText}>Mute</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Emergency Title Section */}
          <View style={styles.heroSection}>
            <View style={styles.alertIconCircle}>
              <AlertTriangle size={56} color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>🚨 EMERGENCY</Text>
            <Text style={styles.heroSubtitle}>WASHROOM SAFETY ALERT</Text>
            <Text style={styles.heroDescription}>
              {isTest
                ? 'This is a test of the emergency alarm pipeline.'
                : 'A configured emergency condition has been detected.'}
            </Text>
          </View>

          {/* High Contrast Vital Data Box */}
          <View style={styles.vitalBox}>
            <View style={styles.vitalRow}>
              <Text style={styles.vitalLabel}>Device:</Text>
              <Text style={styles.vitalValue}>{deviceName}</Text>
            </View>

            <View style={styles.vitalDivider} />

            <View style={styles.vitalRow}>
              <Text style={styles.vitalLabel}>Status:</Text>
              <Text
                style={[
                  styles.vitalValueStatus,
                  isAcknowledged && { color: '#D97706' },
                  isTest && { color: '#2563EB' },
                ]}
              >
                {isTest
                  ? 'TEST ALERT'
                  : isAcknowledged
                  ? 'ACKNOWLEDGED'
                  : 'CRITICAL'}
              </Text>
            </View>

            <View style={styles.vitalDivider} />

            <View style={styles.vitalRow}>
              <Text style={styles.vitalLabel}>Presence duration:</Text>
              <Text style={styles.vitalValue}>{durationString}</Text>
            </View>

            <View style={styles.vitalDivider} />

            <View style={styles.vitalRow}>
              <Text style={styles.vitalLabel}>Detected:</Text>
              <Text style={styles.vitalValue}>{detectedTimeString}</Text>
            </View>
          </View>

          {/* Action Buttons: 4 Large High-Contrast Buttons */}
          <View style={styles.actionsList}>
            {/* 1. CHECK ON PERSON */}
            <TouchableOpacity
              style={styles.checkPersonBtn}
              onPress={() => setShowPersonCheckModal(true)}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Check on person in washroom"
            >
              <UserCheck size={26} color="#FFFFFF" />
              <Text style={styles.checkPersonBtnText}>CHECK ON PERSON</Text>
            </TouchableOpacity>

            {/* 2. I'M CHECKING */}
            <TouchableOpacity
              style={[styles.checkingBtn, isAcknowledged && styles.checkingBtnAcknowledged]}
              onPress={handleAcknowledge}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="I am checking on the occupant"
            >
              {isAcknowledged ? (
                <>
                  <Check size={24} color="#065F46" />
                  <Text style={styles.checkingBtnTextAcknowledged}>I'M CHECKING (IN PROGRESS)</Text>
                </>
              ) : (
                <>
                  <UserCheck size={24} color="#1E293B" />
                  <Text style={styles.checkingBtnText}>I'M CHECKING</Text>
                </>
              )}
            </TouchableOpacity>

            {/* 3. CALL CONTACT */}
            <TouchableOpacity
              style={styles.callContactBtn}
              onPress={() => handleCallContact()}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Call emergency contact"
            >
              <Phone size={24} color="#FFFFFF" />
              <Text style={styles.callContactBtnText}>
                {primaryContact
                  ? `CALL CONTACT (${primaryContact.name.toUpperCase()})`
                  : 'CALL CONTACT'}
              </Text>
            </TouchableOpacity>

            {/* 4. RESOLVE */}
            <TouchableOpacity
              style={styles.resolveBtn}
              onPress={handleResolve}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Mark emergency resolved"
            >
              <CheckCircle size={22} color="#059669" />
              <Text style={styles.resolveBtnText}>RESOLVE & DISMISS</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Modal: Check On Person Instructions */}
        {showPersonCheckModal && (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>🚨 Check on Person Now</Text>
              <Text style={styles.modalBody}>
                1. Go immediately to {deviceName} location (Washroom).{'\n\n'}
                2. Knock firmly and call out to the occupant.{'\n\n'}
                3. If there is no response or occupant requires help, open door safely or use emergency override.{'\n\n'}
                4. Keep phone with you in case you need to call emergency contacts.
              </Text>

              <TouchableOpacity
                style={styles.modalAcknowledgeBtn}
                onPress={() => {
                  setShowPersonCheckModal(false);
                  handleAcknowledge();
                }}
              >
                <Text style={styles.modalAcknowledgeBtnText}>I Am Checking Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowPersonCheckModal(false)}
              >
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F172A',
    zIndex: 999999,
    elevation: 999999,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    minHeight: '100%',
  },
  emergencyContainer: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    borderWidth: 3,
    borderColor: '#EF4444',
    padding: spacing.xl,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  testBanner: {
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  testBannerText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  statusHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  alarmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  alarmBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.6,
  },
  muteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#475569',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  muteButtonMuted: {
    backgroundColor: '#FEE2E2',
  },
  muteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  muteButtonTextMuted: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 13,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  alertIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 4,
    borderColor: '#F87171',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#EF4444',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
    marginTop: 4,
    textAlign: 'center',
  },
  heroDescription: {
    fontSize: 15,
    color: '#CBD5E1',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
    maxWidth: 380,
  },
  vitalBox: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#334155',
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  vitalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  vitalDivider: {
    height: 1,
    backgroundColor: '#334155',
  },
  vitalLabel: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '600',
  },
  vitalValue: {
    fontSize: 17,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  vitalValueStatus: {
    fontSize: 18,
    color: '#EF4444',
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  actionsList: {
    gap: 12,
  },
  checkPersonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#DC2626',
    paddingVertical: 18,
    borderRadius: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  checkPersonBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  checkingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F1F5F9',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  checkingBtnAcknowledged: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  checkingBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  checkingBtnTextAcknowledged: {
    fontSize: 16,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  callContactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 16,
  },
  callContactBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#064E3B',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#059669',
    marginTop: 4,
  },
  resolveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#A7F3D0',
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    zIndex: 1000000,
  },
  modalCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 420,
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: spacing.md,
  },
  modalBody: {
    fontSize: 15,
    color: '#CBD5E1',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  modalAcknowledgeBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  modalAcknowledgeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  modalCloseBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
});
