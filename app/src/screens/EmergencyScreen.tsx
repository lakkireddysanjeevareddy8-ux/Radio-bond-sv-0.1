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
import { useEmergencyContactStore } from '../store/useEmergencyContactStore';
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
  MapPin,
  ExternalLink,
  Users,
  XCircle,
  Radio,
} from 'lucide-react-native';
import { EmergencySoundService } from '../services/EmergencySoundService';
import { deviceService } from '../services/DeviceCommunicationService';
import { EscalationEngineService } from '../services/EscalationEngineService';
import { FalseAlarmFeedbackModal } from '../components/FalseAlarmFeedbackModal';

export const EmergencyScreen: React.FC = () => {
  const { activeEmergency, setActiveEmergency, deviceConfig, user } = useAppStore();
  const { getPrimaryContact, contacts } = useContactStore();
  const { contacts: trustedContacts, settings: emergencySettings } = useEmergencyContactStore();

  const [isMuted, setIsMuted] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [showPersonCheckModal, setShowPersonCheckModal] = useState(false);
  const [feedbackModalInfo, setFeedbackModalInfo] = useState<{ eventId: string; deviceId: string } | null>(null);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (activeEmergency) {
      // 1. Play continuous emergency alarm siren and continuous vibration
      EmergencySoundService.resetMute();
      setIsMuted(false);
      const isAck = activeEmergency.status === 'ACKNOWLEDGED' || activeEmergency.status === 'acknowledged';
      setIsAcknowledged(isAck);

      EmergencySoundService.dispatchEmergencyNotification(activeEmergency);

      // Listen to escalation countdown ticks
      EscalationEngineService.setCallbacks(
        (sec) => setCountdownSeconds(sec),
        (ev) => {
          setActiveEmergency({ ...ev, status: 'escalating' });
        }
      );

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
    } else {
      setCountdownSeconds(null);
      EscalationEngineService.stopEscalation();
    }

    return () => {
      EmergencySoundService.stopAll();
      EscalationEngineService.stopEscalation();
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

  const isTest = Boolean(activeEmergency.isTestAlert || activeEmergency.isTest || activeEmergency.trigger === 'TEST');
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
   * Stops escalation countdown.
   */
  const handleAcknowledge = async () => {
    setIsAcknowledged(true);
    setCountdownSeconds(null);
    EscalationEngineService.stopEscalation();
    EmergencySoundService.acknowledgeAlert();

    const eventId = activeEmergency.eventId || activeEmergency.id;
    await deviceService.acknowledgeEmergency(eventId, activeEmergency.deviceId);

    setActiveEmergency({
      ...activeEmergency,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
    });
  };

  /**
   * CANCEL / FALSE ALARM FLOW
   * Stops escalation, marks cancelled, silences sirens, dismisses alert.
   */
  const handleCancelAlert = async () => {
    Alert.alert(
      'Cancel Emergency Alert?',
      'Are you sure everyone is safe? This will immediately halt escalation to trusted contacts and silence the alarm.',
      [
        { text: 'Keep Alarm Active', style: 'cancel' },
        {
          text: 'Yes, Cancel (Safe)',
          style: 'destructive',
          onPress: async () => {
            setCountdownSeconds(null);
            EscalationEngineService.stopEscalation();
            EmergencySoundService.stopAll();
            const eventId = activeEmergency.eventId || activeEmergency.id;
            const devId = activeEmergency.deviceId;
            await deviceService.cancelEmergency(eventId, devId);
            setActiveEmergency(null);
          },
        },
      ]
    );
  };

  /**
   * STEP 10: RESOLVE FLOW
   * ACTIVE / ACKNOWLEDGED -> RESOLVED
   * Updates backend, dismisses alarm, and prompts for feedback.
   */
  const handleResolve = async () => {
    setCountdownSeconds(null);
    EscalationEngineService.stopEscalation();
    EmergencySoundService.stopAll();
    const eventId = activeEmergency.eventId || activeEmergency.id;
    const devId = activeEmergency.deviceId;
    await deviceService.resolveEmergency(eventId, devId);
    if (isTest) {
      setActiveEmergency(null);
    } else {
      setFeedbackModalInfo({ eventId, deviceId: devId });
    }
  };

  /**
   * STEP 11: CALL CONTACT FLOW
   * Uses normal dialer without silently placing calls.
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

  const handleOpenLocation = () => {
    if (activeEmergency.locationLat && activeEmergency.locationLng) {
      const url = `https://maps.google.com/?q=${activeEmergency.locationLat},${activeEmergency.locationLng}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('Location Coordinates', `Lat: ${activeEmergency.locationLat}, Lng: ${activeEmergency.locationLng}`);
      });
    }
  };

  const isTrustedContactViewer = Boolean(
    activeEmergency.ownerUserId && user?.id && activeEmergency.ownerUserId !== user.id
  );

  const enabledTrustedContacts = trustedContacts.filter((c) => c.isEnabled);

  return (
    <View style={styles.fullscreenOverlay}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.emergencyContainer, { transform: [{ scale: pulseAnim }] }]}>
          {/* Top Test Banner if in test mode */}
          {isTest && (
            <View style={[styles.testBanner, { backgroundColor: '#7C3AED' }]}>
              <Text style={styles.testBannerText}>🧪 TEST EMERGENCY ALERT — NO ACTION REQUIRED</Text>
            </View>
          )}

          {/* Viewer Banner if opened by a trusted caregiver */}
          {isTrustedContactViewer && (
            <View style={[styles.testBanner, { backgroundColor: '#0284C7' }]}>
              <Text style={styles.testBannerText}>
                🛡️ TRUSTED CAREGIVER ALERT — {activeEmergency.metadata?.ownerName || 'Owner'} Needs Attention
              </Text>
            </View>
          )}

          {/* Alarm Status & Audio Bar */}
          <View style={styles.statusHeaderBar}>
            <View style={[styles.alarmBadge, isTest && { backgroundColor: '#6D28D9' }]}>
              <ShieldAlert size={18} color="#FFFFFF" />
              <Text style={styles.alarmBadgeText}>
                {isTest
                  ? 'SYSTEM TEST ACTIVE'
                  : isAcknowledged
                  ? 'ACKNOWLEDGED'
                  : activeEmergency.status === 'escalating'
                  ? 'ESCALATING TO CONTACTS'
                  : 'CRITICAL ALARM ACTIVE'}
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
            <View style={[styles.alertIconCircle, isTest && { backgroundColor: '#7C3AED' }]}>
              <AlertTriangle size={56} color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>{isTest ? '🧪 SYSTEM TEST' : '🚨 EMERGENCY'}</Text>
            <Text style={styles.heroSubtitle}>
              {isTrustedContactViewer
                ? `ALERT FOR ${(activeEmergency.metadata?.ownerName || 'FAMILY MEMBER').toUpperCase()}`
                : isTest
                ? 'TEST ALARM ACTIVE — SAFE TO DISMISS'
                : 'WASHROOM SAFETY ALERT'}
            </Text>
            <Text style={styles.heroDescription}>
              {isTrustedContactViewer
                ? 'An emergency condition has been escalated to you as an authorized trusted contact.'
                : isTest
                ? 'This is a scheduled self-test of the washroom safety guardian hardware and alerts.'
                : 'A configured emergency condition has been detected by WSG-01.'}
            </Text>
          </View>

          {/* Escalation Countdown Banner */}
          {!isTrustedContactViewer && countdownSeconds !== null && countdownSeconds > 0 && !isAcknowledged && (
            <View style={styles.countdownBanner}>
              <Clock size={20} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={styles.countdownTitle}>Escalation Countdown Active</Text>
                <Text style={styles.countdownSubtitle}>
                  Escalating to trusted contacts via app push in{' '}
                  <Text style={{ fontWeight: '900', color: '#F59E0B' }}>{countdownSeconds}s</Text>
                </Text>
              </View>
            </View>
          )}

          {/* Escalated Status Banner */}
          {!isTrustedContactViewer && activeEmergency.status === 'escalating' && (
            <View style={styles.escalatedBanner}>
              <Radio size={20} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <Text style={styles.escalatedTitle}>Escalated to Trusted Contacts</Text>
                <Text style={styles.escalatedSubtitle}>
                  High-priority app push alerts have been dispatched to your enabled emergency contacts.
                </Text>
              </View>
            </View>
          )}

          {/* High Contrast Vital Data Box */}
          <View style={styles.vitalBox}>
            <View style={styles.vitalRow}>
              <Text style={styles.vitalLabel}>Device:</Text>
              <Text style={styles.vitalValue}>{deviceName}</Text>
            </View>

            <View style={styles.vitalDivider} />

            <View style={styles.vitalRow}>
              <Text style={styles.vitalLabel}>Trigger:</Text>
              <Text style={styles.vitalValue}>
                {activeEmergency.trigger === 'VOICE' ? '🎤 Voice Help Keyword' : activeEmergency.trigger}
              </Text>
            </View>

            <View style={styles.vitalDivider} />

            <View style={styles.vitalRow}>
              <Text style={styles.vitalLabel}>Status:</Text>
              <Text
                style={[
                  styles.vitalValueStatus,
                  isAcknowledged && { color: '#10B981' },
                  activeEmergency.status === 'escalating' && { color: '#F97316' },
                  isTest && { color: '#2563EB' },
                ]}
              >
                {String(activeEmergency.status).toUpperCase()}
              </Text>
            </View>

            <View style={styles.vitalDivider} />

            <View style={styles.vitalRow}>
              <Text style={styles.vitalLabel}>Detected at:</Text>
              <Text style={styles.vitalValue}>{detectedTimeString}</Text>
            </View>
          </View>

          {/* Location Box (if shared) */}
          {activeEmergency.locationShared && activeEmergency.locationLat && activeEmergency.locationLng && (
            <View style={styles.locationCard}>
              <View style={styles.locationHeader}>
                <MapPin size={20} color="#2563EB" />
                <Text style={styles.locationTitle}>Location Shared</Text>
              </View>
              <Text style={styles.locationCoords}>
                {activeEmergency.locationLat.toFixed(5)}, {activeEmergency.locationLng.toFixed(5)} (±
                {Math.round(activeEmergency.locationAccuracy || 10)}m)
              </Text>
              <TouchableOpacity
                style={styles.openMapBtn}
                onPress={handleOpenLocation}
                activeOpacity={0.8}
              >
                <ExternalLink size={16} color="#FFFFFF" />
                <Text style={styles.openMapBtnText}>Open in Maps</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action Buttons: Different for Owner vs Trusted Contact Viewer */}
          <View style={styles.actionsList}>
            {isTrustedContactViewer ? (
              // TRUSTED CONTACT ACTIONS
              <>
                <TouchableOpacity
                  style={[styles.checkingBtn, isAcknowledged && styles.checkingBtnAcknowledged]}
                  onPress={handleAcknowledge}
                  activeOpacity={0.88}
                >
                  <Check size={24} color={isAcknowledged ? '#065F46' : '#1E293B'} />
                  <Text style={isAcknowledged ? styles.checkingBtnTextAcknowledged : styles.checkingBtnText}>
                    {isAcknowledged ? 'ACKNOWLEDGED BY YOU' : 'ACKNOWLEDGE ALERT'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.callContactBtn}
                  onPress={() => handleCallContact()}
                  activeOpacity={0.88}
                >
                  <Phone size={24} color="#FFFFFF" />
                  <Text style={styles.callContactBtnText}>CALL OWNER</Text>
                </TouchableOpacity>

                {activeEmergency.locationShared && activeEmergency.locationLat && (
                  <TouchableOpacity
                    style={styles.openMapActionBtn}
                    onPress={handleOpenLocation}
                    activeOpacity={0.88}
                  >
                    <MapPin size={22} color="#FFFFFF" />
                    <Text style={styles.openMapActionBtnText}>VIEW LOCATION ON MAP</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              // OWNER ACTIONS
              <>
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

                {/* 2. I'M CHECKING (ACKNOWLEDGE) */}
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
                      <Text style={styles.checkingBtnText}>I'M CHECKING (ACKNOWLEDGE)</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* 3. CANCEL (FALSE ALARM) */}
                <TouchableOpacity
                  style={styles.cancelAlertBtn}
                  onPress={handleCancelAlert}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel alarm as false alarm"
                >
                  <XCircle size={22} color="#F87171" />
                  <Text style={styles.cancelAlertBtnText}>CANCEL (FALSE ALARM / SAFE)</Text>
                </TouchableOpacity>

                {/* 4. CALL CONTACT */}
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
                      : 'CALL EMERGENCY CONTACT'}
                  </Text>
                </TouchableOpacity>

                {/* 5. RESOLVE */}
                <TouchableOpacity
                  style={styles.resolveBtn}
                  onPress={handleResolve}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Mark emergency resolved"
                >
                  <CheckCircle size={22} color={isTest ? '#7C3AED' : '#059669'} />
                  <Text style={[styles.resolveBtnText, isTest && { color: '#7C3AED' }]}>
                    {isTest ? 'DISMISS TEST' : 'RESOLVE & DISMISS'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
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
  countdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#78350F',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  countdownTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FDE68A',
    letterSpacing: 0.5,
  },
  countdownSubtitle: {
    fontSize: 13,
    color: '#FFFFFF',
    marginTop: 2,
    lineHeight: 18,
  },
  escalatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#450A0A',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 14,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  escalatedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FCA5A5',
    letterSpacing: 0.5,
  },
  escalatedSubtitle: {
    fontSize: 13,
    color: '#FFFFFF',
    marginTop: 2,
    lineHeight: 18,
  },
  locationCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  locationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#60A5FA',
    letterSpacing: 0.5,
  },
  locationCoords: {
    fontSize: 13,
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 10,
  },
  openMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 10,
  },
  openMapBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  cancelAlertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#450A0A',
    borderWidth: 1.5,
    borderColor: '#DC2626',
    paddingVertical: 15,
    borderRadius: 16,
  },
  cancelAlertBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F87171',
    letterSpacing: 0.5,
  },
  openMapActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0284C7',
    paddingVertical: 16,
    borderRadius: 16,
  },
  openMapActionBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});

