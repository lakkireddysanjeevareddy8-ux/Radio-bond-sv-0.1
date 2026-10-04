import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  TextInput,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { useContactStore } from '../store/useContactStore';
import { EmergencyPushService } from '../services/EmergencyPushService';
import { EmergencySoundService } from '../services/EmergencySoundService';
import { BluetoothService } from '../services/bluetoothService';
import { DeviceConfig } from '../types';
import { SafetySetupScreen } from './SafetySetupScreen';
import { ManageTrustedContactsScreen } from './ManageTrustedContactsScreen';
import { useEmergencyContactStore } from '../store/useEmergencyContactStore';
import { EmergencyContactService } from '../services/EmergencyContactService';
import { APP_VERSION_STRING, APP_DETAILS } from '../utils/version';
import {
  Pencil,
  Save,
  X,
  Check,
  Lock,
  Unlock,
  AlertCircle,
  Plus,
  Trash2,
  CheckCircle2,
  Bell,
  Volume2,
  Smartphone,
  ShieldAlert,
  Phone,
  ChevronRight,
  Info,
  Activity,
  Moon,
  ShieldCheck,
  Users,
  MapPin,
} from 'lucide-react-native';
import { QuietHoursService, BypassPermissionStatus } from '../services/QuietHoursService';

const thresholdOptions = [15, 30, 60, 90, 120];
const timeoutOptions = [5, 10, 15, 30];
const t1Options = [60, 180, 300, 420, 600]; // 1m, 3m, 5m (default), 7m, 10m
const repeatOptions = [10, 15, 30, 45];
const volumeOptions = [40, 60, 80, 100];
const quietStartOptions = ['21:00', '22:00', '23:00', '00:00'];
const quietEndOptions = ['05:00', '06:00', '07:00', '08:00'];

export const SettingsScreen: React.FC = () => {
  const {
    deviceConfig,
    setDeviceConfig,
    isSimulatorMode,
    setIsSimulatorMode,
    hardwareMode,
    setHardwareMode,
    isOnline,
    user,
    signOut,
    setActiveEmergency,
    escalationLogs,
  } = useAppStore();

  const { getPrimaryContact } = useContactStore();
  const primaryContact = getPrimaryContact();

  const { getActiveDevice } = useDeviceStore();
  const activeDevice = getActiveDevice();
  const isSharedViewer = Boolean(activeDevice?.userRole === 'SHARED_VIEWER' || activeDevice?.isShared);

  const [isEditing, setIsEditing] = useState(false);
  const [draftConfig, setDraftConfig] = useState<DeviceConfig | null>(deviceConfig);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [showKeywordInput, setShowKeywordInput] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showCaregiversModal, setShowCaregiversModal] = useState(false);

  // Emergency Alert Settings State
  const [showTestConfirmModal, setShowTestConfirmModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [emergencyAlertsEnabled, setEmergencyAlertsEnabled] = useState(true);
  const [emergencySoundEnabled, setEmergencySoundEnabled] = useState(true);
  const [emergencyVibrationEnabled, setEmergencyVibrationEnabled] = useState(true);
  const [bypassStatus, setBypassStatus] = useState<BypassPermissionStatus | null>(null);

  useEffect(() => {
    QuietHoursService.checkBypassPermissions().then(setBypassStatus);
  }, []);

  // Emergency Escalation & App-Only Trusted Contact Settings
  const { settings: emgSettings, saveSettings: saveEmgSettings, loadAll: loadEmgData } = useEmergencyContactStore();
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  useEffect(() => {
    loadEmgData();
  }, []);

  const handleOpenAuditModal = async () => {
    setShowAuditModal(true);
    setIsLoadingAudit(true);
    try {
      const data = await EmergencyContactService.getEmergencyHistory();
      setAuditLogs(data);
    } catch (err) {
      console.warn('Error fetching emergency history:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const [isTestRunning, setIsTestRunning] = useState(false);

  const handleTriggerTestAlert = async () => {
    console.log('[TEST DEBUG 1] Button pressed');
    setShowTestConfirmModal(false);
    setIsTestRunning(true);

    try {
      console.log('[Settings] Triggering real TEST_EMERGENCY over BLE GATT...');
      await BluetoothService.triggerTestEmergency();
      console.log('[Settings] TEST_EMERGENCY command successfully sent to ESP32. Awaiting real device event notification...');
      // Note: The emergency alert UI will be activated when the ESP32 generates and notifies TEST_EMERGENCY over BLE.
    } catch (err: any) {
      console.error('[Settings] Failed to trigger TEST_EMERGENCY over BLE:', err);
      setIsTestRunning(false);
      Alert.alert(
        'Device Not Connected',
        'WSG-01 is not connected. Please reconnect the device.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleCancelTestAlert = async () => {
    setIsTestRunning(false);
    try {
      await BluetoothService.cancelTestEmergency();
    } catch (e) {
      console.warn('[Settings] Cancel test note:', e);
    }
    setActiveEmergency(null);
  };

  // Sync draftConfig when deviceConfig changes outside of editing
  useEffect(() => {
    if (!isEditing && deviceConfig) {
      setDraftConfig(deviceConfig);
    }
  }, [deviceConfig, isEditing]);

  const activeConfig = isEditing && draftConfig ? draftConfig : deviceConfig;

  // Determine if any settings differ from original
  const hasChanges = useMemo(() => {
    if (!isEditing || !draftConfig || !deviceConfig) return false;
    return (
      draftConfig.deviceName !== deviceConfig.deviceName ||
      draftConfig.stillnessThreshold !== deviceConfig.stillnessThreshold ||
      draftConfig.responseTimeout !== deviceConfig.responseTimeout ||
      draftConfig.t1ThresholdSeconds !== deviceConfig.t1ThresholdSeconds ||
      draftConfig.repeatIntervalSeconds !== deviceConfig.repeatIntervalSeconds ||
      draftConfig.alarmVolume !== deviceConfig.alarmVolume ||
      draftConfig.voiceDetectionEnabled !== deviceConfig.voiceDetectionEnabled ||
      draftConfig.speakerEnabled !== deviceConfig.speakerEnabled ||
      draftConfig.emergencyEscalation !== deviceConfig.emergencyEscalation ||
      JSON.stringify(draftConfig.quietHours) !== JSON.stringify(deviceConfig.quietHours) ||
      JSON.stringify(draftConfig.emergencyKeywords) !== JSON.stringify(deviceConfig.emergencyKeywords)
    );
  }, [isEditing, draftConfig, deviceConfig]);

  const updateDraft = (partial: Partial<DeviceConfig>) => {
    if (!isEditing) return;
    setDraftConfig((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const handleStartEdit = () => {
    if (isSharedViewer) {
      Alert.alert(
        'Caregiver View Only',
        'You are monitoring this device as an authorized family member or caregiver. Safety configuration changes are restricted to the device owner.'
      );
      return;
    }
    if (deviceConfig) {
      setDraftConfig({ ...deviceConfig });
    }
    setIsEditing(true);
    setSaveSuccessMessage(null);
  };

  const handleCancelEdit = () => {
    if (deviceConfig) {
      setDraftConfig({ ...deviceConfig });
    }
    setIsEditing(false);
    setShowKeywordInput(false);
    setNewKeyword('');
  };

  const handleSaveSettings = () => {
    if (!draftConfig) return;
    setDeviceConfig(draftConfig);
    if (draftConfig.quietHours && draftConfig.deviceId) {
      QuietHoursService.saveQuietHours(draftConfig.deviceId, draftConfig.quietHours);
    }
    setIsEditing(false);
    setShowKeywordInput(false);
    setNewKeyword('');
    setSaveSuccessMessage('Settings saved successfully!');
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 4000);
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim().toUpperCase();
    if (!trimmed || !draftConfig) return;
    if (draftConfig.emergencyKeywords.includes(trimmed)) {
      setNewKeyword('');
      setShowKeywordInput(false);
      return;
    }
    updateDraft({
      emergencyKeywords: [...draftConfig.emergencyKeywords, trimmed],
    });
    setNewKeyword('');
    setShowKeywordInput(false);
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    if (!draftConfig) return;
    updateDraft({
      emergencyKeywords: draftConfig.emergencyKeywords.filter((k) => k !== keywordToRemove),
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e: any) {
      Alert.alert('Sign Out Error', e?.message || 'Could not sign out');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Success Banner */}
        {saveSuccessMessage && (
          <View style={styles.successBanner}>
            <CheckCircle2 size={20} color="#065F46" />
            <Text style={styles.successBannerText}>{saveSuccessMessage}</Text>
          </View>
        )}

        {/* Caregiver Notice Banner */}
        {isSharedViewer && (
          <View style={styles.caregiverNoticeBanner}>
            <View style={styles.caregiverNoticeIconWrapper}>
              <ShieldCheck size={24} color="#1D4ED8" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.caregiverNoticeTitle}>👥 Shared Caregiver Mode (View Only)</Text>
              <Text style={styles.caregiverNoticeText}>
                You are monitoring {activeDevice?.name || 'this device'} as an authorized family member or caregiver. Live status, health telemetry, and emergency alerts are active, but hardware configuration changes and device deletion are reserved for the device owner.
              </Text>
            </View>
          </View>
        )}

        {/* Edit / Save Action Bar Header */}
        <View style={[styles.controlBar, isSharedViewer ? styles.controlBarCaregiver : isEditing ? styles.controlBarEditing : styles.controlBarLocked]}>
          <View style={styles.controlBarInfo}>
            <View style={styles.controlBarTitleRow}>
              {isSharedViewer ? (
                <Lock size={18} color="#2563EB" />
              ) : isEditing ? (
                <Unlock size={18} color="#D97706" />
              ) : (
                <Lock size={18} color={colors.textSecondary} />
              )}
              <Text style={[styles.controlBarTitle, isSharedViewer ? { color: '#1D4ED8' } : isEditing ? { color: '#92400E' } : undefined]}>
                {isSharedViewer ? 'Caregiver View Only' : isEditing ? 'Editing Settings' : 'Settings View Only'}
              </Text>
            </View>
            <Text style={styles.controlBarSubtitle}>
              {isSharedViewer
                ? 'Monitored under caregiver authorization'
                : isEditing
                ? hasChanges
                  ? '⚠️ You have unsaved changes'
                  : 'Modify any settings below, then tap Save'
                : 'Click Edit Settings to make changes'}
            </Text>
          </View>

          <View style={styles.controlBarActions}>
            {isSharedViewer ? (
              <View style={styles.caregiverLockPill}>
                <Lock size={12} color="#1D4ED8" />
                <Text style={styles.caregiverLockPillText}>Read-Only</Text>
              </View>
            ) : !isEditing ? (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={handleStartEdit}
                accessibilityRole="button"
                accessibilityLabel="Edit settings"
              >
                <Pencil size={16} color={colors.surface} />
                <Text style={styles.editBtnText}>Edit Settings</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.editingActionsGroup}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCancelEdit}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <X size={16} color={colors.textSecondary} />
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, !hasChanges && styles.saveBtnMuted]}
                  onPress={handleSaveSettings}
                  accessibilityRole="button"
                  accessibilityLabel="Save settings"
                >
                  <Save size={16} color={colors.surface} />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Account Section */}
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Logged In As</Text>
            <Text style={styles.settingValue}>{user?.email || 'Authenticated User'}</Text>
          </View>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutBtnText}>🚪 Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Family & Caregiver Sharing */}
        <SectionHeader title="Family & Caregiver Sharing" />
        <View style={styles.card}>
          <View style={styles.sharingHeaderRow}>
            <View style={[styles.permissionsIconWrapper, { backgroundColor: '#DBEAFE' }]}>
              <Users size={20} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sharingTitle}>Caregiver Network</Text>
              <Text style={styles.sharingSubtitle}>
                {isSharedViewer
                  ? 'You have secure caregiver access to this unit. Emergency alerts and wellness data are shared in real-time.'
                  : 'Authorize family members and trusted caregivers to monitor status and receive simultaneous emergency sirens.'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.manageSharingBtn}
            onPress={() => setShowCaregiversModal(true)}
            activeOpacity={0.85}
          >
            <Users size={16} color="#FFFFFF" />
            <Text style={styles.manageSharingBtnText}>
              {isSharedViewer ? 'View Connected Caregivers' : 'Manage & Invite Caregivers'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Safety Permissions & Onboarding */}
        <SectionHeader title="Safety Permissions & Onboarding" />
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.permissionsRowBtn}
            onPress={() => setShowPermissionsModal(true)}
            activeOpacity={0.8}
          >
            <View style={styles.permissionsBtnLeft}>
              <View style={styles.permissionsIconWrapper}>
                <ShieldAlert size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permissionsRowTitle}>WSG-01 Safety Setup & Permissions</Text>
                <Text style={styles.permissionsRowSubtitle}>
                  Verify Bluetooth, Notifications, Emergency Sirens, and Background Operation
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* Hardware & Data Source Mode */}
        <SectionHeader title="Hardware & Runtime Mode" />
        <View style={styles.card}>
          <ToggleRow
            label="Demo Simulator Mode"
            value={hardwareMode === 'DEMO_SIMULATOR'}
            onToggle={(val) => setHardwareMode(val ? 'DEMO_SIMULATOR' : 'REAL_HARDWARE')}
            disabled={false}
          />
          <View style={styles.modeInfoBox}>
            <Text style={styles.modeInfoTitle}>
              {hardwareMode === 'DEMO_SIMULATOR'
                ? '🎮 Demo Simulator Active'
                : '📡 Real Hardware Mode (Production)'}
            </Text>
            <Text style={styles.modeInfoSubtitle}>
              {hardwareMode === 'DEMO_SIMULATOR'
                ? 'Running in software simulator mode. Great for UI design and scenario testing.'
                : 'Production real-hardware architecture active. Requires verified physical BLE GATT & ESP32 connection.'}
            </Text>
          </View>
          <View style={[styles.settingRow, { borderBottomWidth: 0, marginTop: 8 }]}>
            <Text style={styles.settingLabel}>Device UUID</Text>
            <Text style={[styles.settingValue, { fontSize: 13, fontFamily: 'monospace' }]}>
              {activeConfig?.deviceId || 'Not set'}
            </Text>
          </View>
          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.settingLabel}>Live Connection</Text>
            <Text style={[styles.settingValue, { color: isOnline ? '#10B981' : '#EF4444', fontWeight: '700' }]}>
              {isOnline ? '● CONNECTED' : '○ DISCONNECTED'}
            </Text>
          </View>
        </View>

        {/* Emergency Alert System Section */}
        <SectionHeader title="Emergency Alert System" />
        <View style={styles.card}>
          <View style={styles.emergencyChannelHeader}>
            <View style={styles.emergencyChannelIconWrap}>
              <ShieldAlert size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emergencyChannelTitle}>Channel: Emergency Alerts</Text>
              <Text style={styles.emergencyChannelSubtitle}>
                Highest Android importance (MAX) • Alarm sound & continuous vibration
              </Text>
            </View>
          </View>

          <ToggleRow
            label="Emergency Push Alerts"
            value={emergencyAlertsEnabled}
            onToggle={(v) => setEmergencyAlertsEnabled(v)}
            disabled={false}
          />
          <ToggleRow
            label="Emergency Siren (960Hz / 770Hz)"
            value={emergencySoundEnabled}
            onToggle={(v) => setEmergencySoundEnabled(v)}
            disabled={false}
          />
          <ToggleRow
            label="Urgent Vibration Pattern"
            value={emergencyVibrationEnabled}
            onToggle={(v) => setEmergencyVibrationEnabled(v)}
            disabled={false}
          />

          <View style={[styles.settingRow, { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View>
              <Text style={styles.settingLabel}>Emergency Contact</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {primaryContact ? `${primaryContact.name} (${primaryContact.relationship})` : 'No primary contact'}
              </Text>
            </View>
            <Text style={[styles.settingValue, { color: colors.primary, fontWeight: '700' }]}>
              {primaryContact ? primaryContact.phone : 'Not set'}
            </Text>
          </View>

          {/* Test Emergency Alert Button */}
          <View style={styles.testAlertBox}>
            <Text style={styles.testAlertTitle}>Verify Alert Pipeline</Text>
            <Text style={styles.testAlertSubtitle}>
              Simulate an urgent LD2410C emergency event to test push delivery, alarm siren, vibration, and full-screen display.
            </Text>
            <TouchableOpacity
              style={styles.testAlertBtn}
              onPress={() => setShowTestConfirmModal(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Test Emergency Alert"
            >
              <ShieldAlert size={18} color="#FFFFFF" />
              <Text style={styles.testAlertBtnText}>Test Emergency Alert</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Emergency Escalation & Trusted Settings Section */}
        <SectionHeader title="Emergency Escalation & Safety Settings" />
        <View style={styles.card}>
          <View style={styles.emergencyChannelHeader}>
            <View style={[styles.emergencyChannelIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <ShieldAlert size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.emergencyChannelTitle}>Automated Escalation Engine</Text>
              <Text style={styles.emergencyChannelSubtitle}>
                App-only cloud notification pipeline for verified trusted contacts
              </Text>
            </View>
          </View>

          <ToggleRow
            label="Automatic Escalation"
            value={emgSettings.automaticEscalationEnabled}
            onToggle={(val) => saveEmgSettings({ automaticEscalationEnabled: val })}
            disabled={false}
          />

          <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 6 }}>
              <Text style={styles.settingLabel}>Escalation Delay</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                {emgSettings.escalationDelaySeconds} seconds
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
              Countdown before emergency escalates to trusted contact WSG-01 apps if unacknowledged:
            </Text>
            <View style={styles.optionGroup}>
              {[10, 30, 60, 120].map((sec) => {
                const isSelected = emgSettings.escalationDelaySeconds === sec;
                return (
                  <TouchableOpacity
                    key={sec}
                    style={[
                      styles.optionPill,
                      isSelected && styles.optionPillActive,
                    ]}
                    onPress={() => saveEmgSettings({ escalationDelaySeconds: sec as any })}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextActive,
                      ]}
                    >
                      {sec}s
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
            <Text style={styles.settingLabel}>Escalation Strategy</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginVertical: 4 }}>
              Choose how notifications are dispatched to registered emergency contacts:
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, width: '100%' }}>
              <TouchableOpacity
                style={[
                  styles.strategyPill,
                  emgSettings.escalationStrategy === 'all' && styles.strategyPillActive,
                ]}
                onPress={() => saveEmgSettings({ escalationStrategy: 'all' })}
              >
                <Users size={15} color={emgSettings.escalationStrategy === 'all' ? '#FFFFFF' : colors.textPrimary} />
                <Text
                  style={[
                    styles.strategyPillText,
                    emgSettings.escalationStrategy === 'all' && styles.strategyPillTextActive,
                  ]}
                >
                  Notify All Contacts
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.strategyPill,
                  emgSettings.escalationStrategy === 'priority' && styles.strategyPillActive,
                ]}
                onPress={() => saveEmgSettings({ escalationStrategy: 'priority' })}
              >
                <Activity size={15} color={emgSettings.escalationStrategy === 'priority' ? '#FFFFFF' : colors.textPrimary} />
                <Text
                  style={[
                    styles.strategyPillText,
                    emgSettings.escalationStrategy === 'priority' && styles.strategyPillTextActive,
                  ]}
                >
                  Priority (1 → 2 → 3)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <ToggleRow
            label="Share My Location During Emergencies"
            value={emgSettings.shareLocationOnEmergency}
            onToggle={(val) => saveEmgSettings({ shareLocationOnEmergency: val })}
            disabled={false}
          />
          <Text style={{ fontSize: 12, color: colors.textSecondary, paddingHorizontal: spacing.sm, marginBottom: 8, marginTop: -4 }}>
            When enabled, emergency alerts include GPS coordinates and map links for trusted caregivers.
          </Text>

          <ToggleRow
            label="Notify Device Owner Immediately"
            value={emgSettings.notifyOwner}
            onToggle={(val) => saveEmgSettings({ notifyOwner: val })}
            disabled={false}
          />

          <TouchableOpacity
            style={styles.auditLogBtn}
            onPress={handleOpenAuditModal}
            activeOpacity={0.85}
          >
            <Activity size={16} color="#2563EB" />
            <Text style={styles.auditLogBtnText}>View Emergency History & Push Logs</Text>
            <ChevronRight size={16} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* Quiet Hours & Emergency Bypass Section */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="Quiet Hours & Emergency Bypass" />
          {!isEditing && <Text style={styles.viewModeNotice}>Locked</Text>}
        </View>
        <View style={styles.card}>
          <View style={styles.quietHoursHeader}>
            <View style={[styles.permissionsIconWrapper, { backgroundColor: '#EDE9FE' }]}>
              <Moon size={20} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quietHoursTitle}>Do Not Disturb (Sleep Schedule)</Text>
              <Text style={styles.quietHoursSubtitle}>
                Silences routine maintenance, offline alerts, and low battery notices while you sleep.
              </Text>
            </View>
          </View>

          <ToggleRow
            label="Enable Quiet Hours"
            value={Boolean(activeConfig?.quietHours?.enabled)}
            onToggle={(val) =>
              updateDraft({
                quietHours: {
                  enabled: val,
                  startTime: activeConfig?.quietHours?.startTime || '22:00',
                  endTime: activeConfig?.quietHours?.endTime || '07:00',
                  emergencyBypass: true,
                },
              })
            }
            disabled={!isEditing}
          />

          {Boolean(activeConfig?.quietHours?.enabled) && (
            <View style={styles.quietHoursTimeSection}>
              {/* Start Time Selection */}
              <Text style={styles.quietHoursFieldTitle}>Quiet Hours Start (Evening)</Text>
              <View style={styles.optionGroup}>
                {quietStartOptions.map((time) => {
                  const isSelected = (activeConfig?.quietHours?.startTime || '22:00') === time;
                  return (
                    <TouchableOpacity
                      key={time}
                      disabled={!isEditing}
                      style={[
                        styles.optionPill,
                        isSelected && styles.optionPillActive,
                        !isEditing && !isSelected && styles.optionPillDisabled,
                      ]}
                      onPress={() =>
                        updateDraft({
                          quietHours: {
                            ...(activeConfig?.quietHours || { enabled: true, emergencyBypass: true, endTime: '07:00' }),
                            enabled: true,
                            startTime: time,
                            emergencyBypass: true,
                          },
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextActive,
                          !isEditing && !isSelected && styles.optionTextDisabled,
                        ]}
                      >
                        {time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* End Time Selection */}
              <Text style={[styles.quietHoursFieldTitle, { marginTop: 12 }]}>Quiet Hours End (Morning)</Text>
              <View style={styles.optionGroup}>
                {quietEndOptions.map((time) => {
                  const isSelected = (activeConfig?.quietHours?.endTime || '07:00') === time;
                  return (
                    <TouchableOpacity
                      key={time}
                      disabled={!isEditing}
                      style={[
                        styles.optionPill,
                        isSelected && styles.optionPillActive,
                        !isEditing && !isSelected && styles.optionPillDisabled,
                      ]}
                      onPress={() =>
                        updateDraft({
                          quietHours: {
                            ...(activeConfig?.quietHours || { enabled: true, emergencyBypass: true, startTime: '22:00' }),
                            enabled: true,
                            endTime: time,
                            emergencyBypass: true,
                          },
                        })
                      }
                    >
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && styles.optionTextActive,
                          !isEditing && !isSelected && styles.optionTextDisabled,
                        ]}
                      >
                        {time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Immutable Emergency Bypass Badge */}
          <View style={styles.emergencyBypassBadge}>
            <ShieldCheck size={20} color="#059669" />
            <View style={{ flex: 1 }}>
              <Text style={styles.emergencyBypassTitle}>Life-Safety Emergency Bypass Active</Text>
              <Text style={styles.emergencyBypassBody}>
                Emergency alarms, fall detection sirens, and SOS voice keywords strictly bypass quiet hours and DND at maximum volume. This protection cannot be disabled.
              </Text>
            </View>
          </View>

          {/* Warning Banner if DND override is not provisioned */}
          {bypassStatus && !bypassStatus.canBypassDnd && (
            <View style={styles.bypassWarningBanner}>
              <AlertCircle size={18} color="#B45309" />
              <View style={{ flex: 1 }}>
                <Text style={styles.bypassWarningTitle}>Permission Advisory</Text>
                <Text style={styles.bypassWarningText}>
                  {bypassStatus.warningMessage || 'Enable Do Not Disturb Override in device settings so emergency sirens can sound while your phone is silenced.'}
                </Text>
                <TouchableOpacity
                  style={styles.bypassSettingsBtn}
                  onPress={() => QuietHoursService.openSystemNotificationSettings()}
                >
                  <Text style={styles.bypassSettingsBtnText}>Open System Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Device Name */}
        <SectionHeader title="Device Configuration" />
        <View style={styles.card}>
          <View style={styles.deviceFieldRow}>
            <Text style={styles.settingLabel}>Device Name</Text>
            {isEditing ? (
              <TextInput
                style={styles.deviceNameInput}
                value={activeConfig?.deviceName || ''}
                onChangeText={(text) => updateDraft({ deviceName: text })}
                placeholder="Enter device name"
                placeholderTextColor="#94A3B8"
              />
            ) : (
              <Text style={styles.settingValue}>{activeConfig?.deviceName || ''}</Text>
            )}
          </View>
        </View>

        {/* Stillness Threshold */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="Stillness Threshold" />
          {!isEditing && <Text style={styles.viewModeNotice}>Locked</Text>}
        </View>
        <View style={styles.optionGroup}>
          {thresholdOptions.map((val) => {
            const isSelected = activeConfig?.stillnessThreshold === val;
            return (
              <TouchableOpacity
                key={val}
                disabled={!isEditing}
                style={[
                  styles.optionPill,
                  isSelected && styles.optionPillActive,
                  !isEditing && !isSelected && styles.optionPillDisabled,
                ]}
                onPress={() => updateDraft({ stillnessThreshold: val })}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextActive,
                    !isEditing && !isSelected && styles.optionTextDisabled,
                  ]}
                >
                  {val}s
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* False-Alarm Adaptive Tuning Recommendation */}
        <View style={styles.tuningRecommendationCard}>
          <View style={styles.tuningHeader}>
            <AlertCircle size={16} color="#D97706" />
            <Text style={styles.tuningTitle}>Adaptive Tuning Advice</Text>
          </View>
          <Text style={styles.tuningBody}>
            Frequent false alarms during still bathing or quiet moments? Increasing Stillness Threshold to 45s or 60s prevents premature alerts while maintaining fall-detection safety.
          </Text>
          {isEditing && (activeConfig?.stillnessThreshold ?? 30) < 60 && (
            <TouchableOpacity
              style={styles.tuningBtn}
              onPress={() => updateDraft({ stillnessThreshold: 60 })}
            >
              <Text style={styles.tuningBtnText}>Apply Recommended 60s Threshold</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Response Timeout */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="Response Timeout" />
          {!isEditing && <Text style={styles.viewModeNotice}>Locked</Text>}
        </View>
        <View style={styles.optionGroup}>
          {timeoutOptions.map((val) => {
            const isSelected = activeConfig?.responseTimeout === val;
            return (
              <TouchableOpacity
                key={val}
                disabled={!isEditing}
                style={[
                  styles.optionPill,
                  isSelected && styles.optionPillActive,
                  !isEditing && !isSelected && styles.optionPillDisabled,
                ]}
                onPress={() => updateDraft({ responseTimeout: val })}
              >
                <Text
                  style={[
                    styles.optionText,
                    isSelected && styles.optionTextActive,
                    !isEditing && !isSelected && styles.optionTextDisabled,
                  ]}
                >
                  {val}s
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Staged Escalation State Machine Configuration */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="Staged Inactivity Escalation (WSG-01)" />
          {!isEditing && <Text style={styles.viewModeNotice}>Locked</Text>}
        </View>
        <View style={styles.card}>
          <Text style={styles.escalationFieldTitle}>
            T1 Inactivity Threshold (triggers Voice Check-in)
          </Text>
          <Text style={styles.escalationFieldSubtitle}>
            Radar monitors stillness. Default: 5 min (300s).
          </Text>
          <View style={styles.optionGroup}>
            {t1Options.map((val) => {
              const isSelected = (activeConfig?.t1ThresholdSeconds ?? 300) === val;
              return (
                <TouchableOpacity
                  key={val}
                  disabled={!isEditing}
                  style={[
                    styles.optionPill,
                    isSelected && styles.optionPillActive,
                    !isEditing && !isSelected && styles.optionPillDisabled,
                  ]}
                  onPress={() => updateDraft({ t1ThresholdSeconds: val })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextActive,
                      !isEditing && !isSelected && styles.optionTextDisabled,
                    ]}
                  >
                    {val >= 60 ? `${val / 60}m` : `${val}s`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.escalationFieldTitle, { marginTop: 14 }]}>
            Repeat Check-in Interval (louder repeat + local buzzer)
          </Text>
          <Text style={styles.escalationFieldSubtitle}>
            Window before escalation to full emergency ALARM. Default: 15s.
          </Text>
          <View style={styles.optionGroup}>
            {repeatOptions.map((val) => {
              const isSelected = (activeConfig?.repeatIntervalSeconds ?? 15) === val;
              return (
                <TouchableOpacity
                  key={val}
                  disabled={!isEditing}
                  style={[
                    styles.optionPill,
                    isSelected && styles.optionPillActive,
                    !isEditing && !isSelected && styles.optionPillDisabled,
                  ]}
                  onPress={() => updateDraft({ repeatIntervalSeconds: val })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextActive,
                      !isEditing && !isSelected && styles.optionTextDisabled,
                    ]}
                  >
                    {val}s
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.escalationFieldTitle, { marginTop: 14 }]}>
            Escalation Alarm Volume
          </Text>
          <Text style={styles.escalationFieldSubtitle}>
            Hardware buzzer decibel output level. Default: 80%.
          </Text>
          <View style={styles.optionGroup}>
            {volumeOptions.map((val) => {
              const isSelected = (activeConfig?.alarmVolume ?? 80) === val;
              return (
                <TouchableOpacity
                  key={val}
                  disabled={!isEditing}
                  style={[
                    styles.optionPill,
                    isSelected && styles.optionPillActive,
                    !isEditing && !isSelected && styles.optionPillDisabled,
                  ]}
                  onPress={() => updateDraft({ alarmVolume: val })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextActive,
                      !isEditing && !isSelected && styles.optionTextDisabled,
                    ]}
                  >
                    {val}%
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.viewHistoryBtn}
            onPress={() => setShowHistoryModal(true)}
            activeOpacity={0.8}
          >
            <Activity size={16} color={colors.primary} />
            <Text style={styles.viewHistoryBtnText}>View Circular Event Log (Last 20 Transitions)</Text>
          </TouchableOpacity>
        </View>

        {/* Voice Detection */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="Voice Detection" />
          {!isEditing && <Text style={styles.viewModeNotice}>Locked</Text>}
        </View>
        <View style={styles.card}>
          <ToggleRow
            label="Enable Voice Detection"
            value={activeConfig?.voiceDetectionEnabled ?? true}
            onToggle={(v) => updateDraft({ voiceDetectionEnabled: v })}
            disabled={!isEditing}
          />
          <ToggleRow
            label="Enable Speaker"
            value={activeConfig?.speakerEnabled ?? true}
            onToggle={(v) => updateDraft({ speakerEnabled: v })}
            disabled={!isEditing}
          />
        </View>

        {/* Emergency Keywords */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="Emergency Keywords" />
          {!isEditing && <Text style={styles.viewModeNotice}>Locked</Text>}
        </View>
        <View style={styles.card}>
          <View style={styles.keywordsContainer}>
            {(activeConfig?.emergencyKeywords ?? []).map((kw) => (
              <View key={kw} style={styles.keywordBadge}>
                <Text style={styles.keywordText}>{kw}</Text>
                {isEditing && (
                  <TouchableOpacity
                    onPress={() => handleRemoveKeyword(kw)}
                    style={styles.keywordRemoveBtn}
                    accessibilityLabel={`Remove keyword ${kw}`}
                  >
                    <X size={12} color="#92400E" />
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {isEditing && !showKeywordInput && (
              <TouchableOpacity
                style={styles.addKeywordBtn}
                onPress={() => setShowKeywordInput(true)}
              >
                <Plus size={14} color={colors.primary} />
                <Text style={styles.addKeywordBtnText}>Add Keyword</Text>
              </TouchableOpacity>
            )}
          </View>

          {isEditing && showKeywordInput && (
            <View style={styles.keywordInputRow}>
              <TextInput
                style={styles.keywordTextInput}
                placeholder="e.g. DANGER"
                placeholderTextColor="#94A3B8"
                value={newKeyword}
                onChangeText={setNewKeyword}
                autoCapitalize="characters"
                onSubmitEditing={handleAddKeyword}
                autoFocus
              />
              <TouchableOpacity style={styles.keywordConfirmBtn} onPress={handleAddKeyword}>
                <Check size={16} color={colors.surface} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.keywordCancelBtn}
                onPress={() => {
                  setShowKeywordInput(false);
                  setNewKeyword('');
                }}
              >
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Escalation Policy */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="Emergency Escalation" />
          {!isEditing && <Text style={styles.viewModeNotice}>Locked</Text>}
        </View>
        <View style={styles.card}>
          {(['WARNING_ONLY', 'VOICE_AND_ALERT', 'IMMEDIATE_ALERT'] as const).map((policy) => {
            const isSelected = activeConfig?.emergencyEscalation === policy;
            return (
              <TouchableOpacity
                key={policy}
                disabled={!isEditing}
                style={[
                  styles.policyRow,
                  isSelected && styles.policyRowActive,
                  !isEditing && !isSelected && styles.policyRowDisabled,
                ]}
                onPress={() => updateDraft({ emergencyEscalation: policy })}
              >
                <View style={[styles.radio, isSelected && styles.radioActive]} />
                <Text style={[styles.policyLabel, isSelected && styles.policyLabelActive]}>
                  {policy.replace(/_/g, ' ')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* About Application & Version Info */}
        <View style={styles.sectionHeaderRow}>
          <SectionHeader title="About Application" />
        </View>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <View style={styles.aboutLeft}>
              <View style={[styles.permissionsIconWrapper, { backgroundColor: '#EFF6FF' }]}>
                <Info size={18} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.aboutTitle}>Application Version</Text>
                <Text style={styles.aboutSubtitle}>{APP_DETAILS.name}</Text>
              </View>
            </View>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>{APP_VERSION_STRING}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Platform & Architecture</Text>
            <Text style={styles.aboutValue}>{APP_DETAILS.platform.toUpperCase()} • Build {APP_DETAILS.build}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Package ID</Text>
            <Text style={styles.aboutValueMonospace}>com.sanjuamazing.app</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Build Status</Text>
            <View style={styles.statusBadge}>
              <CheckCircle2 size={12} color="#059669" />
              <Text style={styles.statusBadgeText}>Installed & Ready</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Bottom Action Bar when in Edit Mode */}
      {isEditing && (
        <View style={styles.floatingBottomBar}>
          <View style={styles.floatingContent}>
            <View style={{ flex: 1 }}>
              <Text style={styles.floatingTitle}>
                {hasChanges ? 'Unsaved Changes' : 'Editing Mode Active'}
              </Text>
              <Text style={styles.floatingSubtitle}>
                {hasChanges ? 'Save your settings to persist them' : 'Make modifications above'}
              </Text>
            </View>
            <View style={styles.floatingActions}>
              <TouchableOpacity style={styles.floatingCancelBtn} onPress={handleCancelEdit}>
                <Text style={styles.floatingCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.floatingSaveBtn, !hasChanges && styles.floatingSaveBtnMuted]}
                onPress={handleSaveSettings}
              >
                <Save size={16} color={colors.surface} />
                <Text style={styles.floatingSaveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Test Emergency Alert Confirmation Modal */}
      {showTestConfirmModal && (
        <View style={styles.testModalBackdrop}>
          <View style={styles.testModalCard}>
            <View style={styles.testModalHeader}>
              <ShieldAlert size={28} color="#DC2626" />
              <Text style={styles.testModalTitle}>Send a test emergency alert?</Text>
            </View>
            <Text style={styles.testModalBody}>
              This will test the complete emergency notification pipeline:
              {'\n'}• High-importance push notification
              {'\n'}• Emergency audio siren (960Hz / 770Hz)
              {'\n'}• Urgent vibration pattern
              {'\n'}• Full-screen emergency alarm interface
              {'\n'}• Acknowledge and Resolve actions
              {'\n\n'}
              The test alert will be clearly labeled 🚨 TEST EMERGENCY ALERT.
            </Text>
            <View style={styles.testModalActions}>
              <TouchableOpacity
                style={styles.testModalCancelBtn}
                onPress={() => setShowTestConfirmModal(false)}
              >
                <Text style={styles.testModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.testModalSendBtn}
                onPress={handleTriggerTestAlert}
              >
                <Text style={styles.testModalSendText}>Send Test</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Safety Permissions Audit Modal */}
      {showPermissionsModal && (
        <Modal
          visible={showPermissionsModal}
          animationType="slide"
          onRequestClose={() => setShowPermissionsModal(false)}
        >
          <SafetySetupScreen
            isSettingsModal={true}
            onComplete={() => setShowPermissionsModal(false)}
            onSkip={() => setShowPermissionsModal(false)}
          />
        </Modal>
      )}

      {/* Circular Buffer Transition History Modal */}
      {showHistoryModal && (
        <Modal
          visible={showHistoryModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowHistoryModal(false)}
        >
          <View style={styles.testModalBackdrop}>
            <View style={[styles.testModalCard, { maxHeight: '80%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Activity size={20} color={colors.primary} />
                  <Text style={styles.testModalTitle}>Escalation Event Log</Text>
                </View>
                <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
                Last 20 staged escalation state transitions recorded in ESP32 firmware circular buffer:
              </Text>

              <ScrollView style={{ maxHeight: 350 }}>
                {escalationLogs && escalationLogs.length > 0 ? (
                  escalationLogs.map((entry, idx) => (
                    <View key={entry.id || idx} style={styles.historyLogItem}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={styles.historyLogTransition}>
                          {entry.fromState} ➔ {entry.toState}
                        </Text>
                        <Text style={styles.historyLogTime}>
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </Text>
                      </View>
                      <Text style={styles.historyLogTrigger}>
                        Trigger: {entry.trigger} • Stillness: {entry.stillnessSeconds}s
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                      No transition events recorded yet. Transitions will appear as the device monitors the washroom.
                    </Text>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={[styles.testModalCancelBtn, { marginTop: 16, alignSelf: 'stretch', alignItems: 'center' }]}
                onPress={() => setShowHistoryModal(false)}
              >
                <Text style={styles.testModalCancelText}>Close History</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Manage Trusted Contacts Modal */}
      {showCaregiversModal && (
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
      )}

      {/* Emergency Event & Notification Audit Modal */}
      {showAuditModal && (
        <Modal
          visible={showAuditModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowAuditModal(false)}
        >
          <View style={styles.testModalBackdrop}>
            <View style={[styles.testModalCard, { maxHeight: '85%', width: '92%' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={20} color="#DC2626" />
                  <Text style={styles.testModalTitle}>Emergency Event Audit</Text>
                </View>
                <TouchableOpacity onPress={() => setShowAuditModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 14 }}>
                Real safety logs, trigger sources, and push delivery status recorded for this account:
              </Text>

              {isLoadingAudit ? (
                <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 13 }}>Loading audit records...</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 380 }}>
                  {auditLogs && auditLogs.length > 0 ? (
                    auditLogs.map((ev) => (
                      <View key={ev.id} style={styles.auditItemCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[
                              styles.auditStatusDot,
                              { backgroundColor: ev.status === 'resolved' || ev.status === 'RESOLVED' ? '#10B981' : ev.status === 'cancelled' || ev.status === 'CANCELLED' ? '#6B7280' : '#EF4444' }
                            ]} />
                            <Text style={styles.auditItemTitle}>
                              {ev.eventType || 'EMERGENCY'}
                            </Text>
                          </View>
                          <Text style={styles.auditItemTime}>
                            {new Date(ev.detectedAt).toLocaleDateString()} {new Date(ev.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                          <View style={styles.auditMetaPill}>
                            <Text style={styles.auditMetaPillText}>Trigger: {ev.source || 'voice_keyword'}</Text>
                          </View>
                          <View style={styles.auditMetaPill}>
                            <Text style={styles.auditMetaPillText}>Status: {ev.status}</Text>
                          </View>
                          {ev.locationShared ? (
                            <View style={[styles.auditMetaPill, { backgroundColor: '#DCFCE7' }]}>
                              <Text style={[styles.auditMetaPillText, { color: '#166534' }]}>📍 Location Shared</Text>
                            </View>
                          ) : (
                            <View style={[styles.auditMetaPill, { backgroundColor: '#F3F4F6' }]}>
                              <Text style={[styles.auditMetaPillText, { color: '#6B7280' }]}>🔒 Location Off</Text>
                            </View>
                          )}
                        </View>

                        {/* Push Notification Delivery Records */}
                        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 }}>
                          App Push Notifications ({ev.notifications?.length || 0}):
                        </Text>
                        {ev.notifications && ev.notifications.length > 0 ? (
                          ev.notifications.map((notif: any) => (
                            <View key={notif.id} style={styles.auditNotificationRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.auditRecipientText} numberOfLines={1}>
                                  Recipient: {notif.recipientUserId?.slice(0, 8)}... ({notif.notificationType})
                                </Text>
                                {notif.failureReason && (
                                  <Text style={styles.auditFailureText}>Reason: {notif.failureReason}</Text>
                                )}
                              </View>
                              <View style={[
                                styles.auditDeliveryBadge,
                                notif.status === 'delivered' ? styles.auditBadgeDelivered : notif.status === 'failed' ? styles.auditBadgeFailed : styles.auditBadgeSent
                              ]}>
                                <Text style={[
                                  styles.auditDeliveryBadgeText,
                                  notif.status === 'delivered' ? { color: '#166534' } : notif.status === 'failed' ? { color: '#991B1B' } : { color: '#1E40AF' }
                                ]}>
                                  {notif.status}
                                </Text>
                              </View>
                            </View>
                          ))
                        ) : (
                          <Text style={{ fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' }}>
                            No push notification dispatches triggered for this event.
                          </Text>
                        )}
                      </View>
                    ))
                  ) : (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                        No emergency events recorded yet in Supabase. Events triggered by LD2410C immobility, voice keywords, or manual alerts will appear here with delivery audit logs.
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}

              <TouchableOpacity
                style={[styles.testModalCancelBtn, { marginTop: 16, alignSelf: 'stretch', alignItems: 'center' }]}
                onPress={() => setShowAuditModal(false)}
              >
                <Text style={styles.testModalCancelText}>Close Audit Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const SectionHeader = ({ title }: { title: string }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const ToggleRow = ({
  label,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
}) => (
  <View style={styles.toggleRow}>
    <Text style={[styles.toggleLabel, disabled && styles.toggleLabelDisabled]}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onToggle}
      disabled={disabled}
      trackColor={{ false: '#CBD5E1', true: colors.primary }}
      thumbColor={value ? '#FFFFFF' : '#F1F5F9'}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },

  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  successBannerText: {
    ...typography.body2,
    color: '#065F46',
    fontWeight: '700',
  },

  controlBar: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  controlBarLocked: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  controlBarEditing: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  controlBarInfo: {
    flex: 1,
    minWidth: 200,
  },
  controlBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  controlBarTitle: {
    ...typography.body1,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  controlBarSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  controlBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  editBtnText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  editingActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  cancelBtnText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  saveBtnMuted: {
    backgroundColor: '#6EE7B7',
  },
  saveBtnText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionHeader: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  viewModeNotice: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceFieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  deviceNameInput: {
    flex: 1,
    minWidth: 180,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  settingLabel: { ...typography.body1, color: colors.textPrimary },
  settingValue: { ...typography.body1, color: colors.textSecondary },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toggleLabel: { ...typography.body1, color: colors.textPrimary },
  toggleLabelDisabled: { color: '#94A3B8' },

  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  optionPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionPillDisabled: { opacity: 0.75, backgroundColor: '#F8FAFC' },
  optionText: { ...typography.body2, color: colors.textSecondary, fontWeight: '600' },
  optionTextActive: { color: colors.surface, fontWeight: '700' },
  optionTextDisabled: { color: '#94A3B8' },

  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  keywordBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    gap: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  keywordText: { ...typography.body2, color: '#92400E', fontWeight: '700' },
  keywordRemoveBtn: {
    padding: 2,
    borderRadius: borderRadius.full,
    backgroundColor: '#FDE68A',
  },
  addKeywordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  addKeywordBtnText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  keywordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  keywordTextInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.textPrimary,
  },
  keywordConfirmBtn: {
    backgroundColor: colors.primary,
    padding: 8,
    borderRadius: borderRadius.md,
  },
  keywordCancelBtn: {
    padding: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },

  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  policyRowActive: { backgroundColor: '#F0F9FF' },
  policyRowDisabled: { opacity: 0.8 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.md,
  },
  radioActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  policyLabel: { ...typography.body1, color: colors.textPrimary },
  policyLabelActive: { fontWeight: '700', color: colors.primary },

  signOutBtn: {
    marginTop: spacing.md,
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  signOutBtnText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 15,
  },
  modeInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modeInfoTitle: {
    fontWeight: '700',
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  modeInfoSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },

  // Floating Save Bar
  floatingBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 8,
  },
  floatingContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    gap: spacing.md,
  },
  floatingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  floatingSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  floatingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  floatingCancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  floatingSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
  },
  floatingSaveBtnMuted: {
    backgroundColor: '#6EE7B7',
  },
  floatingSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },

  // Emergency Alert System Settings Styles
  emergencyChannelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FEF2F2',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: spacing.sm,
  },
  emergencyChannelIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emergencyChannelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
  },
  emergencyChannelSubtitle: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
    lineHeight: 16,
  },
  settingSubLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  testAlertBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  testAlertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  testAlertSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  testAlertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  testAlertBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Test Confirmation Modal Styles
  testModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    zIndex: 999999,
  },
  testModalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 440,
    borderWidth: 2,
    borderColor: '#EF4444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  testModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  testModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    flex: 1,
  },
  testModalBody: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  testModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  testModalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  testModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  testModalSendBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  testModalSendText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  permissionsRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  permissionsBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  permissionsIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionsRowTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  permissionsRowSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  aboutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aboutTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  aboutSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  versionBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  versionBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  aboutLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  aboutValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  aboutValueMonospace: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },
  tuningRecommendationCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  tuningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  tuningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  tuningBody: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
  },
  tuningBtn: {
    marginTop: 8,
    backgroundColor: '#F59E0B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  tuningBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  escalationFieldTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  escalationFieldSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 8,
  },
  viewHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: borderRadius.md,
    marginTop: 16,
  },
  viewHistoryBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  historyLogItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  historyLogTransition: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  historyLogTime: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  historyLogTrigger: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  quietHoursHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.md,
  },
  quietHoursTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  quietHoursSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  quietHoursTimeSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quietHoursFieldTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emergencyBypassBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  emergencyBypassTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  emergencyBypassBody: {
    fontSize: 12,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  bypassWarningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  bypassWarningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
  },
  bypassWarningText: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 16,
  },
  bypassSettingsBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
  },
  bypassSettingsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  controlBarCaregiver: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  caregiverNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  caregiverNoticeIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  caregiverNoticeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 4,
  },
  caregiverNoticeText: {
    fontSize: 12,
    color: '#1E3A8A',
    lineHeight: 18,
  },
  caregiverLockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  caregiverLockPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  sharingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: spacing.md,
  },
  sharingTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sharingSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  manageSharingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  manageSharingBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  strategyPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: borderRadius.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  strategyPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  strategyPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  strategyPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  auditLogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  auditLogBtnText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  auditItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.sm + 4,
    marginBottom: spacing.sm,
  },
  auditStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  auditItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  auditItemTime: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  auditMetaPill: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  auditMetaPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  auditNotificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
  },
  auditRecipientText: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  auditFailureText: {
    fontSize: 10,
    color: '#DC2626',
    marginTop: 2,
  },
  auditDeliveryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  auditBadgeDelivered: {
    backgroundColor: '#DCFCE7',
  },
  auditBadgeFailed: {
    backgroundColor: '#FEE2E2',
  },
  auditBadgeSent: {
    backgroundColor: '#DBEAFE',
  },
  auditDeliveryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
