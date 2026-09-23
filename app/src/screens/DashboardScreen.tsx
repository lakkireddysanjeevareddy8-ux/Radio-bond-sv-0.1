import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { useDeviceStore, SavedDevice } from '../store/useDeviceStore';
import { DeviceConnectionService } from '../services/deviceConnectionService';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { APP_VERSION_STRING } from '../utils/version';
import { SafetyStatusCard } from '../components/SafetyStatusCard';
import { DeviceHealthBar } from '../components/DeviceHealthBar';
import { WellnessTabView } from '../components/WellnessTabView';
import { ManageTrustedContactsScreen } from './ManageTrustedContactsScreen';
import {
  Shield,
  Wifi,
  User,
  Activity,
  Clock,
  Volume2,
  RefreshCw,
  ChevronDown,
  Check,
  Users,
  HeartPulse,
  Sliders,
  AlertTriangle,
  X,
} from 'lucide-react-native';

export const DashboardScreen: React.FC = () => {
  const {
    deviceConfig,
    telemetry,
    isOnline,
    activeEmergency,
    setActiveEmergency,
    voicePrompt,
    setIsOnline,
    setTelemetry,
    hardwareMode,
  } = useAppStore();

  const { devices, activeDeviceId, setActiveDeviceId, getActiveDevice } = useDeviceStore();
  const activeDevice = getActiveDevice();
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'STATUS' | 'WELLNESS' | 'CAREGIVERS'>('STATUS');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState<boolean>(false);
  const [showCaregiversModal, setShowCaregiversModal] = useState<boolean>(false);

  // Live Wi-Fi telemetry polling
  useEffect(() => {
    if (activeDevice && activeDevice.connectionType === 'WIFI' && activeDevice.ipAddress) {
      const unsubscribe = DeviceConnectionService.subscribe(activeDevice.ipAddress, {
        onStatusChange: (status) => {
          setIsOnline(status === 'CONNECTED');
          if (status === 'CONNECTED') {
            setIsReconnecting(false);
          }
        },
        onTelemetry: (t) => {
          setTelemetry(t);
          if (t.state === 'EMERGENCY' && !activeEmergency) {
            setActiveEmergency({
              id: `emg-wifi-${Date.now()}`,
              deviceId: t.deviceId || activeDevice?.deviceId || 'ESP32-LIVE',
              eventType: 'EMERGENCY',
              trigger: 'BUTTON',
              timestamp: new Date().toISOString(),
              status: 'ACTIVE',
            });
          }
        },
      });

      return () => {
        unsubscribe();
      };
    }
  }, [activeDevice?.deviceId, activeDevice?.ipAddress]);

  const handleManualReconnect = async () => {
    if (!activeDevice?.ipAddress) return;
    setIsReconnecting(true);
    const success = await DeviceConnectionService.reconnect(activeDevice.ipAddress);
    setIsReconnecting(false);
    if (success) {
      setIsOnline(true);
    }
  };

  let safetyStatus: 'SAFE' | 'MONITORING' | 'CHECKING' | 'EMERGENCY' | 'OFFLINE' = 'SAFE';

  if (!isOnline || telemetry?.state === 'DEVICE_OFFLINE') {
    safetyStatus = 'OFFLINE';
  } else if (
    telemetry?.state === 'EMERGENCY' ||
    (activeEmergency && activeEmergency.status === 'ACTIVE' && telemetry?.state !== 'IDLE')
  ) {
    safetyStatus = 'EMERGENCY';
  } else if (telemetry?.state === 'CHECKING_WELLBEING' || telemetry?.state === 'WAITING_FOR_RESPONSE') {
    safetyStatus = 'CHECKING';
  } else if (
    telemetry?.state === 'PERSON_PRESENT' ||
    telemetry?.state === 'MOVING' ||
    telemetry?.state === 'STILL_MONITORING'
  ) {
    safetyStatus = 'MONITORING';
  }

  const currentDisplayName = activeDevice?.name || deviceConfig?.deviceName || 'Washroom Guardian';
  const currentRoom = activeDevice?.room || 'Main Bathroom';
  const currentDeviceId = activeDevice?.deviceId || deviceConfig?.deviceId || 'WSG-000001';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header with Multi-Device Selector */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              style={styles.devicePickerBtn}
              onPress={() => setShowDeviceDropdown(true)}
              activeOpacity={0.8}
            >
              <View>
                <Text style={styles.deviceName} numberOfLines={1}>
                  {currentDisplayName}
                </Text>
                <View style={styles.deviceSubRow}>
                  <Text style={styles.roomBadgeText}>{currentRoom}</Text>
                  <ChevronDown size={14} color={colors.textSecondary} />
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.safe : colors.offline }]} />
              <Text style={[styles.statusText, { color: isOnline ? colors.safe : colors.offline }]}>
                {isOnline ? '● ONLINE' : '● OFFLINE (LOCAL SAFEGUARD)'}
              </Text>
            </View>
          </View>

          <View style={styles.shieldIcon}>
            <Shield color={colors.primary} size={30} />
          </View>
        </View>

        {/* Device Health Bar (Battery %, RSSI, Maintenance Warning) */}
        <DeviceHealthBar
          batteryPct={telemetry?.batteryPct ?? 94}
          rssi={telemetry?.wifiRSSI ?? -62}
          isOnline={isOnline}
        />

        {/* Tab Navigation Segmented Bar */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'STATUS' && styles.tabBtnActive]}
            onPress={() => setActiveTab('STATUS')}
          >
            <Activity size={15} color={activeTab === 'STATUS' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'STATUS' && styles.tabBtnTextActive]}>
              Live Status
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'WELLNESS' && styles.tabBtnActive]}
            onPress={() => setActiveTab('WELLNESS')}
          >
            <HeartPulse size={15} color={activeTab === 'WELLNESS' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'WELLNESS' && styles.tabBtnTextActive]}>
              Routine
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'CAREGIVERS' && styles.tabBtnActive]}
            onPress={() => setActiveTab('CAREGIVERS')}
          >
            <Users size={15} color={activeTab === 'CAREGIVERS' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabBtnText, activeTab === 'CAREGIVERS' && styles.tabBtnTextActive]}>
              Caregivers
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: Live Status */}
        {activeTab === 'STATUS' && (
          <View>
            {/* Safety Status Card */}
            <SafetyStatusCard status={safetyStatus} />

            {/* Voice Prompt Banner */}
            {voicePrompt && (
              <View style={styles.voiceBanner}>
                <Volume2 size={20} color="#0284C7" />
                <Text style={styles.voiceBannerText}>Device says: "{voicePrompt}"</Text>
              </View>
            )}

            {/* Offline Warning with Controlled Reconnect & Local Alarm Guarantee */}
            {!isOnline && (
              <View style={styles.offlineCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={styles.offlineTitle}>⚠️ Device Cloud Sync Offline</Text>
                  {activeDevice?.ipAddress && (
                    <TouchableOpacity
                      style={styles.reconnectBtn}
                      onPress={handleManualReconnect}
                      disabled={isReconnecting}
                      activeOpacity={0.8}
                    >
                      {isReconnecting ? (
                        <ActivityIndicator size="small" color="#DC2626" style={{ marginRight: 4 }} />
                      ) : (
                        <RefreshCw size={14} color="#DC2626" style={{ marginRight: 4 }} />
                      )}
                      <Text style={styles.reconnectBtnText}>
                        {isReconnecting ? 'Reconnecting...' : 'Reconnect'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.offlineText}>
                  Cloud connectivity is paused. <Text style={{ fontWeight: '700' }}>Local Safety Guard is ACTIVE</Text>: The physical LD2410C millimeter-wave radar and piezo buzzer continue to run directly on the hardware in the washroom.
                </Text>
              </View>
            )}

            {/* Live Metrics */}
            {isOnline && telemetry && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Live Sensor Telemetry</Text>
                <View style={styles.metricsGrid}>
                  <MetricBox
                    icon={<User size={18} color={telemetry.presence ? colors.info : colors.textSecondary} />}
                    title="Person"
                    value={telemetry.presence ? 'Detected' : 'Not detected'}
                    active={telemetry.presence}
                  />
                  <MetricBox
                    icon={<Activity size={18} color={telemetry.movement ? colors.safe : colors.textSecondary} />}
                    title="Movement"
                    value={telemetry.movement ? 'Moving' : 'Still'}
                    active={telemetry.movement}
                  />
                  <MetricBox
                    icon={<Clock size={18} color={colors.textSecondary} />}
                    title="Stillness"
                    value={`${telemetry.stillnessSeconds}s`}
                    active={false}
                  />
                  <MetricBox
                    icon={<Wifi size={18} color={colors.info} />}
                    title="Wi-Fi"
                    value={`${telemetry.wifiRSSI} dBm`}
                    active={true}
                  />
                  <MetricBox
                    icon={<Activity size={18} color="#059669" />}
                    title="Radar Sensor"
                    value="LD2410C Active"
                    active={true}
                  />
                  <MetricBox
                    icon={<Shield size={18} color={colors.textSecondary} />}
                    title="Safety State"
                    value={telemetry.state.replace(/_/g, ' ')}
                    active={false}
                  />
                </View>
              </View>
            )}

            {/* Privacy note */}
            <View style={styles.privacyNote}>
              <Text style={styles.privacyText}>
                🔒 Voice detection listens for emergency keywords only. Audio is never stored or uploaded.
              </Text>
            </View>
          </View>
        )}

        {/* TAB 2: Wellness & Routine */}
        {activeTab === 'WELLNESS' && (
          <WellnessTabView
            deviceId={currentDeviceId}
            isSimulatorMode={hardwareMode === 'DEMO_SIMULATOR'}
          />
        )}

        {/* TAB 3: Caregivers & Trusted Contacts */}
        {activeTab === 'CAREGIVERS' && (
          <View style={styles.caregiverSummaryCard}>
            <View style={styles.caregiverHeaderRow}>
              <View style={styles.caregiverIconWrapper}>
                <Users size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.caregiverCardTitle}>Trusted Contacts & Caregivers</Text>
                <Text style={styles.caregiverCardSubtitle}>
                  Device: {currentDisplayName} ({currentDeviceId})
                </Text>
              </View>
            </View>

            <Text style={styles.caregiverDesc}>
              Caregivers receive push alerts simultaneously when an emergency is verified on this unit. They can inspect live device status with a secure, read-only dashboard.
            </Text>

            <TouchableOpacity
              style={styles.openCaregiversBtn}
              onPress={() => setShowCaregiversModal(true)}
              activeOpacity={0.85}
            >
              <Users size={16} color="#FFFFFF" />
              <Text style={styles.openCaregiversBtnText}>Manage Trusted Contacts</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* App Version Tag */}
        <View style={styles.versionFooter}>
          <Text style={styles.versionFooterText}>WSG-01 Guardian App • {APP_VERSION_STRING}</Text>
        </View>
      </ScrollView>

      {/* Multi-Device Selector Dropdown Modal */}
      <Modal
        visible={showDeviceDropdown}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeviceDropdown(false)}
      >
        <TouchableOpacity
          style={styles.dropdownBackdrop}
          activeOpacity={1}
          onPress={() => setShowDeviceDropdown(false)}
        >
          <View style={styles.dropdownCard}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Switch Monitored Device</Text>
              <TouchableOpacity onPress={() => setShowDeviceDropdown(false)}>
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {devices.length === 0 ? (
              <View style={styles.deviceOptionRow}>
                <Text style={styles.deviceOptionName}>{currentDisplayName}</Text>
                <Check size={18} color={colors.primary} />
              </View>
            ) : (
              devices.map((dev) => {
                const isSelected = (dev.deviceId === activeDeviceId) || (!activeDeviceId && dev.deviceId === currentDeviceId);
                return (
                  <TouchableOpacity
                    key={dev.deviceId}
                    style={[styles.deviceOptionRow, isSelected && styles.deviceOptionSelected]}
                    onPress={() => {
                      setActiveDeviceId(dev.deviceId);
                      setShowDeviceDropdown(false);
                    }}
                  >
                    <View>
                      <Text style={[styles.deviceOptionName, isSelected && { color: colors.primary }]}>
                        {dev.name || dev.deviceId}
                      </Text>
                      <Text style={styles.deviceOptionRoom}>
                        {dev.room || 'Washroom'} • {dev.deviceId}
                      </Text>
                    </View>
                    {isSelected && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Manage Trusted Contacts Modal */}
      <Modal
        visible={showCaregiversModal}
        animationType="slide"
        onRequestClose={() => setShowCaregiversModal(false)}
      >
        <ManageTrustedContactsScreen onClose={() => setShowCaregiversModal(false)} />
      </Modal>
    </View>
  );
};

const MetricBox = ({
  icon,
  title,
  value,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  active: boolean;
}) => (
  <View style={[styles.metricBox, active && styles.metricBoxActive]}>
    <View style={styles.metricIconRow}>{icon}</View>
    <Text style={styles.metricTitle}>{title}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  devicePickerBtn: {
    marginBottom: 4,
  },
  deviceName: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  deviceSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    marginBottom: 4,
  },
  roomBadgeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { ...typography.caption, fontWeight: '700' },
  shieldIcon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.md,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Tabs Segmented Control */
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: borderRadius.md,
    padding: 3,
    marginVertical: spacing.sm,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },

  voiceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#E0F2FE',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  voiceBannerText: { ...typography.body2, color: '#0284C7', fontWeight: '600', flex: 1 },
  offlineCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  offlineTitle: { ...typography.body2, color: colors.emergency, fontWeight: '700' },
  reconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: borderRadius.full,
    backgroundColor: '#FEE2E2',
  },
  reconnectBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  offlineText: { ...typography.body2, color: '#991B1B', lineHeight: 18 },
  section: { marginTop: spacing.xs },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricBox: {
    width: '47%',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  metricBoxActive: { borderColor: colors.primary + '60', backgroundColor: '#F0F9FF' },
  metricIconRow: { marginBottom: spacing.xs },
  metricTitle: { ...typography.caption, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 2 },
  metricValue: { ...typography.body2, color: colors.textPrimary, fontWeight: '700' },
  privacyNote: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: '#F0FDF4',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  privacyText: { ...typography.caption, color: '#166534' },

  /* Caregivers Card in Tab 3 */
  caregiverSummaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  caregiverHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.sm,
  },
  caregiverIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  caregiverCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  caregiverCardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  caregiverDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  openCaregiversBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
  },
  openCaregiversBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  versionFooter: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  versionFooterText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
  },

  /* Dropdown Modal Styles */
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  dropdownCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  deviceOptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: borderRadius.md,
  },
  deviceOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  deviceOptionName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  deviceOptionRoom: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
