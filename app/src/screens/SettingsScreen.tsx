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
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { useContactStore } from '../store/useContactStore';
import { EmergencyPushService } from '../services/EmergencyPushService';
import { EmergencySoundService } from '../services/EmergencySoundService';
import { DeviceConfig } from '../types';
import { SafetySetupScreen } from './SafetySetupScreen';
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
} from 'lucide-react-native';

const thresholdOptions = [15, 30, 60, 90, 120];
const timeoutOptions = [5, 10, 15, 30];

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
  } = useAppStore();

  const { getPrimaryContact } = useContactStore();
  const primaryContact = getPrimaryContact();

  const [isEditing, setIsEditing] = useState(false);
  const [draftConfig, setDraftConfig] = useState<DeviceConfig | null>(deviceConfig);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [showKeywordInput, setShowKeywordInput] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);

  // Emergency Alert Settings State
  const [showTestConfirmModal, setShowTestConfirmModal] = useState(false);
  const [emergencyAlertsEnabled, setEmergencyAlertsEnabled] = useState(true);
  const [emergencySoundEnabled, setEmergencySoundEnabled] = useState(true);
  const [emergencyVibrationEnabled, setEmergencyVibrationEnabled] = useState(true);

  const handleTriggerTestAlert = () => {
    setShowTestConfirmModal(false);
    const eventId = `test_emg_${Date.now()}`;
    const testPayload = {
      type: 'EMERGENCY' as const,
      eventId,
      deviceId: activeConfig?.deviceId || 'WSG-000001',
      deviceName: activeConfig?.deviceName || 'Washroom Safety Guardian',
      severity: 'CRITICAL' as const,
      presenceDuration: 1112,
      timestamp: new Date().toISOString(),
      isTest: true,
      trigger: 'OTHER',
    };
    EmergencyPushService.handleIncomingPush(testPayload);
    setActiveEmergency({
      id: eventId,
      eventId,
      deviceId: testPayload.deviceId,
      deviceName: testPayload.deviceName,
      type: 'EMERGENCY',
      eventType: 'EMERGENCY',
      trigger: 'OTHER',
      severity: 'CRITICAL',
      presenceDuration: 1112,
      timestamp: testPayload.timestamp,
      status: 'ACTIVE',
      isTestAlert: true,
    });
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
      draftConfig.voiceDetectionEnabled !== deviceConfig.voiceDetectionEnabled ||
      draftConfig.speakerEnabled !== deviceConfig.speakerEnabled ||
      draftConfig.emergencyEscalation !== deviceConfig.emergencyEscalation ||
      JSON.stringify(draftConfig.emergencyKeywords) !== JSON.stringify(deviceConfig.emergencyKeywords)
    );
  }, [isEditing, draftConfig, deviceConfig]);

  const updateDraft = (partial: Partial<DeviceConfig>) => {
    if (!isEditing) return;
    setDraftConfig((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const handleStartEdit = () => {
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

        {/* Edit / Save Action Bar Header */}
        <View style={[styles.controlBar, isEditing ? styles.controlBarEditing : styles.controlBarLocked]}>
          <View style={styles.controlBarInfo}>
            <View style={styles.controlBarTitleRow}>
              {isEditing ? (
                <Unlock size={18} color="#D97706" />
              ) : (
                <Lock size={18} color={colors.textSecondary} />
              )}
              <Text style={[styles.controlBarTitle, isEditing && { color: '#92400E' }]}>
                {isEditing ? 'Editing Settings' : 'Settings View Only'}
              </Text>
            </View>
            <Text style={styles.controlBarSubtitle}>
              {isEditing
                ? hasChanges
                  ? '⚠️ You have unsaved changes'
                  : 'Modify any settings below, then tap Save'
                : 'Click Edit Settings to make changes'}
            </Text>
          </View>

          <View style={styles.controlBarActions}>
            {!isEditing ? (
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
});
