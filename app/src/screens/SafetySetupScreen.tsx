import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, borderRadius } from '../utils/theme';
import {
  PermissionService,
  PermissionStatus,
  SafetyPermissionsReport,
} from '../services/PermissionService';
import { useAppStore } from '../store/useAppStore';
import {
  ShieldAlert,
  Bluetooth,
  Bell,
  Volume2,
  Cpu,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react-native';

interface SafetySetupScreenProps {
  onComplete?: () => void;
  onSkip?: () => void;
  isSettingsModal?: boolean;
}

export const SafetySetupScreen: React.FC<SafetySetupScreenProps> = ({
  onComplete,
  onSkip,
  isSettingsModal = false,
}) => {
  const insets = useSafeAreaInsets();
  const { setHasCompletedSafetyOnboarding } = useAppStore();

  const [loading, setLoading] = useState<boolean>(true);
  const [report, setReport] = useState<SafetyPermissionsReport>({
    bluetooth: 'denied',
    notifications: 'denied',
    emergencyAudio: 'denied',
    backgroundAlerts: 'denied',
    allEssentialGranted: false,
  });

  const [requestingItem, setRequestingItem] = useState<string | null>(null);

  // Audit real permissions
  const refreshPermissions = useCallback(async () => {
    try {
      const res = await PermissionService.checkAllPermissions();
      setReport(res);
    } catch (e) {
      console.warn('Permissions audit error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPermissions();

    // Re-check when app resumes from system settings
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshPermissions();
      }
    });

    return () => {
      sub.remove();
    };
  }, [refreshPermissions]);

  // Request Bluetooth
  const handleRequestBluetooth = async () => {
    setRequestingItem('bluetooth');
    try {
      await PermissionService.requestBluetoothPermission();
    } finally {
      await refreshPermissions();
      setRequestingItem(null);
    }
  };

  // Request Notifications
  const handleRequestNotifications = async () => {
    setRequestingItem('notifications');
    try {
      await PermissionService.requestNotificationPermission();
    } finally {
      await refreshPermissions();
      setRequestingItem(null);
    }
  };

  // Request Emergency Audio & Siren
  const handleRequestAudio = async () => {
    setRequestingItem('emergencyAudio');
    try {
      await PermissionService.unlockEmergencyAudio();
    } finally {
      await refreshPermissions();
      setRequestingItem(null);
    }
  };

  // Open System Settings
  const handleOpenSettings = async () => {
    await PermissionService.openSettings();
  };

  // Complete onboarding
  const handleComplete = () => {
    setHasCompletedSafetyOnboarding(true);
    if (onComplete) {
      onComplete();
    }
  };

  const handleSkip = () => {
    setHasCompletedSafetyOnboarding(true);
    if (onSkip) {
      onSkip();
    } else if (onComplete) {
      onComplete();
    }
  };

  const renderBadge = (status: PermissionStatus) => {
    switch (status) {
      case 'granted':
        return (
          <View style={[styles.badge, styles.badgeGranted]}>
            <CheckCircle2 size={13} color="#059669" />
            <Text style={styles.badgeTextGranted}>✓ Allowed</Text>
          </View>
        );
      case 'blocked':
        return (
          <View style={[styles.badge, styles.badgeBlocked]}>
            <AlertTriangle size={13} color="#D97706" />
            <Text style={styles.badgeTextBlocked}>⚠ Needs Settings</Text>
          </View>
        );
      case 'unsupported':
        return (
          <View style={[styles.badge, styles.badgeUnsupported]}>
            <HelpCircle size={13} color="#64748B" />
            <Text style={styles.badgeTextUnsupported}>Unsupported</Text>
          </View>
        );
      case 'denied':
      default:
        return (
          <View style={[styles.badge, styles.badgeDenied]}>
            <XCircle size={13} color="#DC2626" />
            <Text style={styles.badgeTextDenied}>✕ Denied</Text>
          </View>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: (insets.bottom || 16) + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Header */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconWrapper}>
            <ShieldAlert size={36} color="#2563EB" />
          </View>
          <Text style={styles.title}>WSG-01 Safety Setup</Text>
          <Text style={styles.subtitle}>
            Allow the required permissions so WSG-01 can connect to your safety gadget and deliver
            emergency alerts.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Auditing device safety permissions...</Text>
          </View>
        ) : (
          <View style={styles.cardsList}>
            {/* Card 1: Bluetooth */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Bluetooth size={22} color="#2563EB" />
                </View>
                <View style={styles.cardTitleContainer}>
                  <Text style={styles.cardTitle}>Bluetooth Discovery & GATT</Text>
                  <Text style={styles.cardDesc}>
                    Allows secure connection and fast Wi-Fi provisioning to the WSG-01 ESP32 gadget.
                  </Text>
                </View>
                {renderBadge(report.bluetooth)}
              </View>

              <View style={styles.cardFooter}>
                {report.bluetooth === 'granted' ? (
                  <Text style={styles.confirmedText}>Bluetooth access enabled</Text>
                ) : report.bluetooth === 'blocked' ? (
                  <TouchableOpacity
                    style={styles.settingsActionBtn}
                    onPress={handleOpenSettings}
                    activeOpacity={0.8}
                  >
                    <ExternalLink size={14} color="#2563EB" />
                    <Text style={styles.settingsActionBtnText}>Open Settings to Allow</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={handleRequestBluetooth}
                    disabled={requestingItem === 'bluetooth'}
                    activeOpacity={0.8}
                  >
                    {requestingItem === 'bluetooth' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.actionBtnText}>Allow Bluetooth</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Card 2: Notifications */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2' }]}>
                  <Bell size={22} color="#DC2626" />
                </View>
                <View style={styles.cardTitleContainer}>
                  <Text style={styles.cardTitle}>Emergency Notifications</Text>
                  <Text style={styles.cardDesc}>
                    Delivers high-importance alarm popups over social media, video, and locked screen.
                  </Text>
                </View>
                {renderBadge(report.notifications)}
              </View>

              <View style={styles.cardFooter}>
                {report.notifications === 'granted' ? (
                  <Text style={styles.confirmedText}>Notifications enabled</Text>
                ) : report.notifications === 'blocked' ? (
                  <TouchableOpacity
                    style={styles.settingsActionBtn}
                    onPress={handleOpenSettings}
                    activeOpacity={0.8}
                  >
                    <ExternalLink size={14} color="#2563EB" />
                    <Text style={styles.settingsActionBtnText}>Open Settings to Allow</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={handleRequestNotifications}
                    disabled={requestingItem === 'notifications'}
                    activeOpacity={0.8}
                  >
                    {requestingItem === 'notifications' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.actionBtnText}>Allow Notifications</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Card 3: Emergency Sound & Siren */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#F0FDF4' }]}>
                  <Volume2 size={22} color="#16A34A" />
                </View>
                <View style={styles.cardTitleContainer}>
                  <Text style={styles.cardTitle}>Emergency Siren & Vibration</Text>
                  <Text style={styles.cardDesc}>
                    Enables dual-tone 960Hz / 770Hz sirens and urgent vibration patterns during critical events.
                  </Text>
                </View>
                {renderBadge(report.emergencyAudio)}
              </View>

              <View style={styles.cardFooter}>
                {report.emergencyAudio === 'granted' ? (
                  <Text style={styles.confirmedText}>Audio & vibration ready</Text>
                ) : (
                  <TouchableOpacity
                    style={styles.actionBtnSecondary}
                    onPress={handleRequestAudio}
                    disabled={requestingItem === 'emergencyAudio'}
                    activeOpacity={0.8}
                  >
                    {requestingItem === 'emergencyAudio' ? (
                      <ActivityIndicator size="small" color="#1E293B" />
                    ) : (
                      <Text style={styles.actionBtnSecondaryText}>Test & Enable Siren</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Card 4: Background Operation */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#FAF5FF' }]}>
                  <Cpu size={22} color="#9333EA" />
                </View>
                <View style={styles.cardTitleContainer}>
                  <Text style={styles.cardTitle}>Background & Full-Screen Alerts</Text>
                  <Text style={styles.cardDesc}>
                    Uses system high-priority channels and wake locks to reach you instantly when occupant needs help.
                  </Text>
                </View>
                {renderBadge(report.backgroundAlerts)}
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.confirmedText}>Hardware channel ready</Text>
              </View>
            </View>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              !report.allEssentialGranted && styles.primaryBtnWarning,
            ]}
            onPress={handleComplete}
            activeOpacity={0.85}
          >
            <Sparkles size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>
              {report.allEssentialGranted ? 'Setup Complete — Continue' : 'Continue with Selected'}
            </Text>
          </TouchableOpacity>

          {!isSettingsModal && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkip}
              activeOpacity={0.7}
            >
              <Text style={styles.skipBtnText}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  heroIconWrapper: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 440,
  },
  loadingContainer: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  cardsList: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitleContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  badgeGranted: {
    backgroundColor: '#ECFDF5',
  },
  badgeTextGranted: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  badgeDenied: {
    backgroundColor: '#FEF2F2',
  },
  badgeTextDenied: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  badgeBlocked: {
    backgroundColor: '#FFFBEB',
  },
  badgeTextBlocked: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  badgeUnsupported: {
    backgroundColor: '#F1F5F9',
  },
  badgeTextUnsupported: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  cardFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    alignItems: 'flex-end',
  },
  confirmedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  actionBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  actionBtnSecondary: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  settingsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  settingsActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
  buttonGroup: {
    gap: 10,
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 15,
    borderRadius: borderRadius.md,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnWarning: {
    backgroundColor: '#0F172A',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  skipBtn: {
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
});
