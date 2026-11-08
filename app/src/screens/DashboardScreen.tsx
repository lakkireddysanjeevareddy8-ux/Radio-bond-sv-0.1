import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../store/useAppStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { useConnectionStore } from '../store/useConnectionStore';
import { DeviceConnectionService } from '../services/deviceConnectionService';
import { colors, typography, spacing, borderRadius, TOUCH_TARGET } from '../utils/theme';
import { APP_VERSION_STRING } from '../utils/version';
import { SafetyStatusCard } from '../components/SafetyStatusCard';
import { DeviceHealthBar, DeviceDiagnosticsSection } from '../components/DeviceHealthBar';
import { WellnessTabView } from '../components/WellnessTabView';
import { ManageTrustedContactsScreen } from './ManageTrustedContactsScreen';
import {
  Card,
  Button,
  Pill,
  Collapsible,
  IconBadge,
} from '../components/ui';
import {
  Shield,
  Wifi,
  WifiOff,
  Bluetooth,
  BluetoothOff,
  User,
  Activity,
  Clock,
  Volume2,
  ChevronDown,
  Check,
  Users,
  HeartPulse,
  Radio,
  X,
  AlertTriangle,
  Lock,
} from 'lucide-react-native';

export const DashboardScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  const {
    deviceConfig,
    telemetry,
    isOnline,
    bluetoothStatus,
    wifiStatus,
    activeEmergency,
    setActiveEmergency,
    voicePrompt,
    setIsOnline,
    setTelemetry,
    hardwareMode,
    deviceHealth,
  } = useAppStore();

  const { devices, activeDeviceId, setActiveDeviceId, getActiveDevice } = useDeviceStore();
  const activeDevice = getActiveDevice();
  const isSharedViewer = Boolean(activeDevice?.userRole === 'SHARED_VIEWER' || activeDevice?.isShared);

  const {
    status: connStatus,
    connectedDevice,
    disconnect: disconnectDevice,
  } = useConnectionStore();

  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ROUTINE'>('OVERVIEW');
  const [showDeviceDropdown, setShowDeviceDropdown] = useState<boolean>(false);
  const [showCaregiversModal, setShowCaregiversModal] = useState<boolean>(false);

  // Live Wi-Fi telemetry polling - ONLY runs when connected device is WIFI and status is 'connected'
  // Treats BLE as primary: never calls setIsOnline(false) or touches status while BLE is active
  useEffect(() => {
    if (
      connStatus === 'connected' &&
      connectedDevice?.connectionType === 'WIFI' &&
      connectedDevice.ipAddress &&
      connectedDevice.ipAddress !== '0.0.0.0'
    ) {
      const targetIp = connectedDevice.ipAddress;
      const unsubscribe = DeviceConnectionService.subscribe(targetIp, {
        onStatusChange: (status) => {
          // Guard: Never change status or call setIsOnline if a BLE device is active
          const currentStore = useConnectionStore.getState();
          if (currentStore.connectedDevice?.connectionType === 'BLE') {
            return;
          }
          if (status === 'CONNECTED') {
            setIsReconnecting(false);
          } else if (status === 'OFFLINE') {
            useConnectionStore.getState().setDisconnected('Wi-Fi device offline');
          }
        },
        onTelemetry: (t) => {
          setTelemetry(t);
          if (t.state === 'EMERGENCY' && !activeEmergency) {
            setActiveEmergency({
              id: `emg-wifi-${Date.now()}`,
              deviceId: t.deviceId || connectedDevice?.id || 'ESP32-LIVE',
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
  }, [connStatus, connectedDevice?.id, connectedDevice?.connectionType, connectedDevice?.ipAddress]);

  const handleManualReconnect = async () => {
    const ip = connectedDevice?.ipAddress || activeDevice?.ipAddress;
    if (!ip) return;
    setIsReconnecting(true);
    const success = await DeviceConnectionService.reconnect(ip);
    setIsReconnecting(false);
    if (success) {
      useConnectionStore.getState().setConnected({
        id: activeDevice?.deviceId || 'ESP32-LIVE',
        name: activeDevice?.name || 'Washroom Guardian',
        connectionType: 'WIFI',
        ipAddress: ip,
      });
    }
  };

  const isBleConnected =
    (connStatus === 'connected' && connectedDevice?.connectionType === 'BLE') ||
    bluetoothStatus === 'CONNECTED';
  const isWifiConnected =
    wifiStatus === 'CONNECTED' ||
    Boolean(connectedDevice?.connectionType === 'WIFI' && connStatus === 'connected');
  const activeSsid = connectedDevice?.ssid || activeDevice?.ssid;
  const hasFreshTelemetry = Boolean(
    telemetry?.timestamp && Date.now() - new Date(telemetry.timestamp).getTime() < 30000
  );
  const isDeviceConnected = isBleConnected || (isWifiConnected && (isOnline || hasFreshTelemetry));

  let safetyStatus:
    | 'SAFE'
    | 'MONITORING'
    | 'CHECKING'
    | 'INACTIVE_DETECTED'
    | 'NO_RESPONSE'
    | 'ALARM'
    | 'EMERGENCY'
    | 'OFFLINE' = 'SAFE';

  if (!isDeviceConnected && !isBleConnected) {
    safetyStatus = 'OFFLINE';
  } else if (
    telemetry?.state === 'ALARM' ||
    telemetry?.state === 'EMERGENCY' ||
    (activeEmergency && activeEmergency.status === 'ACTIVE' && telemetry?.state !== 'IDLE')
  ) {
    safetyStatus = 'ALARM';
  } else if (telemetry?.state === 'NO_RESPONSE') {
    safetyStatus = 'NO_RESPONSE';
  } else if (
    telemetry?.state === 'INACTIVE_DETECTED' ||
    telemetry?.state === 'CHECKING_WELLBEING' ||
    telemetry?.state === 'WAITING_FOR_RESPONSE'
  ) {
    safetyStatus = 'INACTIVE_DETECTED';
  } else if (
    telemetry?.state === 'PERSON_PRESENT' ||
    telemetry?.state === 'MOVING' ||
    telemetry?.state === 'STILL_MONITORING'
  ) {
    safetyStatus = 'MONITORING';
  }

  const currentDisplayName =
    connectedDevice?.name || activeDevice?.name || deviceConfig?.deviceName || 'Washroom Guardian';
  const currentRoom = activeDevice?.room || 'Main Bathroom';
  const currentDeviceId =
    connectedDevice?.id || activeDevice?.deviceId || deviceConfig?.deviceId || 'WSG-000001';

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 12) }]}>
      {/* Custom Safe-Area Header */}
      <View style={styles.customHeader}>
        {/* Device Switcher */}
        <TouchableOpacity
          style={styles.devicePickerBtn}
          onPress={() => setShowDeviceDropdown(true)}
          onLongPress={() => navigation.navigate('DebugLogs')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Switch device, currently selected ${currentDisplayName}. Long press for debug logs.`}
        >
          <View style={styles.devicePickerLeft}>
            <View style={styles.deviceNameRow}>
              <Text style={styles.deviceNameText} numberOfLines={1}>
                {currentDisplayName}
              </Text>
              <ChevronDown size={18} color={colors.textSecondary} style={{ marginLeft: 4 }} />
            </View>
            <View style={styles.deviceSubRow}>
              <Text style={styles.roomBadgeText}>{currentRoom}</Text>
              {isSharedViewer && (
                <View style={styles.sharedRoleBadge}>
                  <Users size={11} color="#1D4ED8" />
                  <Text style={styles.sharedRoleBadgeText}>Caregiver</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>

        {/* Status Badges: Bluetooth and Wi-Fi */}
        <View style={styles.statusBadgesContainer}>
          <Pill
            tone={isBleConnected ? 'safe' : 'offline'}
            icon={<Bluetooth size={12} color={isBleConnected ? colors.safeText : colors.offlineText} />}
            label={isBleConnected ? 'Bluetooth: Connected' : 'Bluetooth: Disconnected'}
            size="sm"
          />
          <TouchableOpacity
            activeOpacity={isWifiConnected ? 1 : 0.7}
            onPress={() => {
              if (!isWifiConnected) {
                navigation.navigate('Devices');
              }
            }}
            accessibilityRole={isWifiConnected ? 'text' : 'button'}
            accessibilityLabel={isWifiConnected ? 'Wi-Fi Connected' : 'Wi-Fi Not connected, tap to set up'}
          >
            <Pill
              tone={isWifiConnected ? 'safe' : 'warning'}
              icon={
                isWifiConnected ? (
                  <Wifi size={12} color={colors.safeText} />
                ) : (
                  <WifiOff size={12} color={colors.warningText} />
                )
              }
              label={
                isWifiConnected
                  ? `Wi-Fi: Connected${activeSsid ? ` (${activeSsid})` : ''}`
                  : 'Wi-Fi: Not connected - tap to set up'
              }
              size="sm"
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 2-Way Segmented Control */}
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeTab === 'OVERVIEW' && styles.segmentBtnActive,
            ]}
            onPress={() => setActiveTab('OVERVIEW')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'OVERVIEW' }}
            accessibilityLabel="Overview tab"
          >
            <Activity
              size={16}
              color={activeTab === 'OVERVIEW' ? colors.primaryDark : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'OVERVIEW' && styles.segmentTextActive,
              ]}
            >
              Overview
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentBtn,
              activeTab === 'ROUTINE' && styles.segmentBtnActive,
            ]}
            onPress={() => setActiveTab('ROUTINE')}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'ROUTINE' }}
            accessibilityLabel="Daily routine tab"
          >
            <HeartPulse
              size={16}
              color={activeTab === 'ROUTINE' ? colors.primaryDark : colors.textSecondary}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.segmentText,
                activeTab === 'ROUTINE' && styles.segmentTextActive,
              ]}
            >
              Daily routine
            </Text>
          </TouchableOpacity>
        </View>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'OVERVIEW' && (
          <View style={styles.tabContent}>
            {/* Big Status Hero */}
            <SafetyStatusCard status={safetyStatus} />

            {/* 3 Metric Chips: Battery, Signal, Last seen (Real data, never fake defaults) */}
            <DeviceHealthBar
              batteryPct={telemetry?.batteryPct ?? connectedDevice?.batteryLevel}
              rssi={telemetry?.wifiRSSI ?? connectedDevice?.rssi}
              lastSeen={activeDevice?.lastSeen}
              isOnline={isDeviceConnected}
              health={deviceHealth}
            />

            {/* Offline Friendly Card: NEVER shown when BLE is connected */}
            {!isDeviceConnected && !isBleConnected && (
              <Card tone="warning" style={styles.offlineCard}>
                <View style={styles.offlineHeader}>
                  <View style={styles.offlineTitleWrap}>
                    <AlertTriangle size={18} color={colors.warningText} style={{ marginRight: 8 }} />
                    <Text style={styles.offlineTitle}>
                      Not connected. The device still sounds its own alarm
                    </Text>
                  </View>
                </View>
                <Text style={styles.offlineDesc}>
                  We cannot communicate with the washroom unit right now over the network, but its
                  built-in millimeter-wave radar sensor and local siren remain completely active.
                </Text>
                {activeDevice?.ipAddress && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={isReconnecting}
                    title={isReconnecting ? 'Reconnecting...' : 'Try again'}
                    onPress={handleManualReconnect}
                    style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
                  />
                )}
              </Card>
            )}

            {/* Device Voice Prompt Banner */}
            {voicePrompt && (
              <Card tone="info" style={styles.voiceCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <IconBadge
                    icon={<Volume2 size={18} color={colors.primaryDark} />}
                    tone="primary"
                    size={36}
                    style={{ marginRight: spacing.sm }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.voiceTitle}>Device Voice Check-in</Text>
                    <Text style={styles.voiceText}>"{voicePrompt}"</Text>
                  </View>
                </View>
              </Card>
            )}

            {/* Collapsed Device Details Section */}
            <Collapsible
              title="Device details"
              subtitle="Live sensors, radar, and diagnostics"
              icon={
                <IconBadge
                  icon={<Radio size={18} color={colors.primaryDark} />}
                  tone="primary"
                  size={36}
                />
              }
              defaultOpen={false}
              style={{ marginTop: spacing.sm }}
            >
              <Text style={styles.detailsGroupTitle}>Sensor Grid</Text>
              <View style={styles.sensorGrid}>
                <View style={styles.sensorItem}>
                  <View style={styles.sensorIconRow}>
                    <User
                      size={16}
                      color={telemetry?.presence ? colors.info : colors.textSecondary}
                    />
                    <Text style={styles.sensorLabel}>Person</Text>
                  </View>
                  <Text style={styles.sensorValue}>
                    {telemetry ? (telemetry.presence ? 'Detected' : 'Not detected') : 'Unknown'}
                  </Text>
                </View>

                <View style={styles.sensorItem}>
                  <View style={styles.sensorIconRow}>
                    <Activity
                      size={16}
                      color={telemetry?.movement ? colors.safe : colors.textSecondary}
                    />
                    <Text style={styles.sensorLabel}>Movement</Text>
                  </View>
                  <Text style={styles.sensorValue}>
                    {telemetry ? (telemetry.movement ? 'Moving' : 'Still') : 'Unknown'}
                  </Text>
                </View>

                <View style={styles.sensorItem}>
                  <View style={styles.sensorIconRow}>
                    <Clock size={16} color={colors.textSecondary} />
                    <Text style={styles.sensorLabel}>Stillness</Text>
                  </View>
                  <Text style={styles.sensorValue}>
                    {telemetry?.stillnessSeconds !== undefined
                      ? `${telemetry.stillnessSeconds}s`
                      : 'Unknown'}
                  </Text>
                </View>

                <View style={styles.sensorItem}>
                  <View style={styles.sensorIconRow}>
                    <Wifi size={16} color={isOnline ? colors.info : colors.textSecondary} />
                    <Text style={styles.sensorLabel}>Wi-Fi</Text>
                  </View>
                  <Text style={styles.sensorValue}>
                    {telemetry?.wifiRSSI !== undefined ? `${telemetry.wifiRSSI} dBm` : 'Unknown'}
                  </Text>
                </View>

                <View style={styles.sensorItem}>
                  <View style={styles.sensorIconRow}>
                    <Radio size={16} color={colors.safe} />
                    <Text style={styles.sensorLabel}>Radar</Text>
                  </View>
                  <Text style={styles.sensorValue}>
                    {deviceHealth?.radarStatus ??
                      (telemetry?.presence !== undefined ? 'Active' : 'Unknown')}
                  </Text>
                </View>

                <View style={styles.sensorItem}>
                  <View style={styles.sensorIconRow}>
                    <Shield size={16} color={colors.textSecondary} />
                    <Text style={styles.sensorLabel}>State</Text>
                  </View>
                  <Text style={styles.sensorValue}>
                    {telemetry?.state ? telemetry.state.replace(/_/g, ' ') : 'Unknown'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.detailsGroupTitle, { marginTop: spacing.md }]}>
                Diagnostics & Hardware Health
              </Text>
              <DeviceDiagnosticsSection
                health={deviceHealth}
                radarActive={telemetry?.presence !== undefined}
              />

              {isDeviceConnected && (
                <Button
                  variant="danger"
                  size="sm"
                  title="Disconnect Device"
                  onPress={() => disconnectDevice()}
                  style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
                />
              )}
            </Collapsible>

            {/* Privacy Note */}
            <View style={styles.privacyBox}>
              <Lock size={15} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <Text style={styles.privacyText}>
                Voice detection listens for emergency keywords only. Audio is never stored or
                uploaded.
              </Text>
            </View>

            {/* Version Footer */}
            <View style={styles.versionFooter}>
              <Text style={styles.versionFooterText}>
                WSG-01 Guardian App • {APP_VERSION_STRING}
              </Text>
            </View>
          </View>
        )}

        {/* TAB 2: ROUTINE */}
        {activeTab === 'ROUTINE' && (
          <View style={styles.tabContent}>
            <WellnessTabView
              deviceId={currentDeviceId}
              isSimulatorMode={hardwareMode === 'DEMO_SIMULATOR'}
            />
          </View>
        )}
      </ScrollView>

      {/* Multi-Device Selector Sheet Modal */}
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
              <TouchableOpacity
                onPress={() => setShowDeviceDropdown(false)}
                accessibilityRole="button"
                accessibilityLabel="Close device switcher"
                style={styles.closeBtn}
              >
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
                const isSelected =
                  dev.deviceId === activeDeviceId ||
                  (!activeDeviceId && dev.deviceId === currentDeviceId);
                const isDevShared = dev.userRole === 'SHARED_VIEWER' || dev.isShared;
                return (
                  <TouchableOpacity
                    key={dev.deviceId}
                    style={[styles.deviceOptionRow, isSelected && styles.deviceOptionSelected]}
                    onPress={() => {
                      setActiveDeviceId(dev.deviceId);
                      setShowDeviceDropdown(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Select device ${dev.name || dev.deviceId}`}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text
                          style={[
                            styles.deviceOptionName,
                            isSelected && { color: colors.primaryDark, fontWeight: '700' },
                          ]}
                        >
                          {dev.name || dev.deviceId}
                        </Text>
                        {isDevShared && (
                          <View style={styles.dropdownSharedPill}>
                            <Text style={styles.dropdownSharedPillText}>Caregiver</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.deviceOptionRoom}>
                        {dev.room || 'Washroom'} • {dev.deviceId}
                      </Text>
                    </View>
                    {isSelected && <Check size={18} color={colors.primaryDark} />}
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
        <ManageTrustedContactsScreen
          onClose={() => setShowCaregiversModal(false)}
          isReadOnlyViewer={isSharedViewer}
        />
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusBadgesContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
    marginLeft: spacing.sm,
  },
  devicePickerBtn: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  devicePickerLeft: {
    justifyContent: 'center',
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceNameText: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
    maxWidth: 220,
  },
  deviceSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 6,
  },
  roomBadgeText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  sharedRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    gap: 3,
  },
  sharedRoleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.lg,
    padding: 3,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET - 6,
    borderRadius: borderRadius.md,
  },
  segmentBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    ...typography.body2,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  segmentTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  tabContent: {
    marginTop: spacing.xs,
  },
  offlineCard: {
    marginTop: spacing.sm,
  },
  offlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  offlineTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  offlineTitle: {
    ...typography.body2,
    color: colors.warningText,
    fontWeight: '700',
    flex: 1,
  },
  offlineDesc: {
    ...typography.caption,
    color: colors.warningText,
    lineHeight: 18,
    marginVertical: 4,
  },
  voiceCard: {
    marginTop: spacing.xs,
  },
  voiceTitle: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  voiceText: {
    ...typography.body2,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  detailsGroupTitle: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  sensorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  sensorItem: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  sensorIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  sensorLabel: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
  },
  sensorValue: {
    ...typography.body2,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  privacyText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    flex: 1,
  },
  versionFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  versionFooterText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  dropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dropdownCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  dropdownTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: TOUCH_TARGET,
  },
  deviceOptionSelected: {
    backgroundColor: colors.primarySoft,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    borderColor: 'transparent',
  },
  deviceOptionName: {
    ...typography.body1,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  deviceOptionRoom: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dropdownSharedPill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    marginLeft: 6,
  },
  dropdownSharedPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1D4ED8',
  },
});
