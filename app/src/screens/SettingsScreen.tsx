import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { DeviceConfig } from '../types';

export const SettingsScreen: React.FC = () => {
  const {
    deviceConfig,
    setDeviceConfig,
    isSimulatorMode,
    setIsSimulatorMode,
    isOnline,
    user,
    signOut,
  } = useAppStore();

  const updateConfig = (partial: Partial<DeviceConfig>) => {
    if (deviceConfig) setDeviceConfig({ ...deviceConfig, ...partial });
  };

  const thresholdOptions = [15, 30, 60, 90, 120];
  const timeoutOptions = [5, 10, 15, 30];

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e: any) {
      Alert.alert('Sign Out Error', e?.message || 'Could not sign out');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {/* Hardware & Data Source Mode */}
      <SectionHeader title="Hardware & Data Source" />
      <View style={styles.card}>
        <ToggleRow
          label="Demo Simulator Mode"
          value={isSimulatorMode}
          onToggle={(val) => setIsSimulatorMode(val)}
        />
        <View style={styles.modeInfoBox}>
          <Text style={styles.modeInfoTitle}>
            {isSimulatorMode ? '🎮 Demo Simulator Active' : '📡 Real ESP32 Hardware Active'}
          </Text>
          <Text style={styles.modeInfoSubtitle}>
            {isSimulatorMode
              ? 'Using built-in software simulator. Great for testing UI, timers, and alerts.'
              : 'App is subscribed to Supabase Realtime table for telemetry from your physical ESP32.'}
          </Text>
        </View>
        <View style={[styles.settingRow, { borderBottomWidth: 0, marginTop: 8 }]}>
          <Text style={styles.settingLabel}>Device UUID</Text>
          <Text style={[styles.settingValue, { fontSize: 13, fontFamily: 'monospace' }]}>
            {deviceConfig?.deviceId || 'Not set'}
          </Text>
        </View>
        <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.settingLabel}>Live Connection</Text>
          <Text style={[styles.settingValue, { color: isOnline ? '#10B981' : '#EF4444', fontWeight: '700' }]}>
            {isOnline ? '● CONNECTED' : '○ DISCONNECTED'}
          </Text>
        </View>
      </View>

      {/* Device Name */}
      <SectionHeader title="Device Configuration" />
      <SettingRow label="Device Name" value={deviceConfig?.deviceName || ''} />

      {/* Stillness Threshold */}
      <SectionHeader title="Stillness Threshold" />
      <View style={styles.optionGroup}>
        {thresholdOptions.map((val) => (
          <TouchableOpacity
            key={val}
            style={[styles.optionPill, deviceConfig?.stillnessThreshold === val && styles.optionPillActive]}
            onPress={() => updateConfig({ stillnessThreshold: val })}
          >
            <Text style={[styles.optionText, deviceConfig?.stillnessThreshold === val && styles.optionTextActive]}>
              {val}s
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Response Timeout */}
      <SectionHeader title="Response Timeout" />
      <View style={styles.optionGroup}>
        {timeoutOptions.map((val) => (
          <TouchableOpacity
            key={val}
            style={[styles.optionPill, deviceConfig?.responseTimeout === val && styles.optionPillActive]}
            onPress={() => updateConfig({ responseTimeout: val })}
          >
            <Text style={[styles.optionText, deviceConfig?.responseTimeout === val && styles.optionTextActive]}>
              {val}s
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Voice Detection */}
      <SectionHeader title="Voice Detection" />
      <View style={styles.card}>
        <ToggleRow
          label="Enable Voice Detection"
          value={deviceConfig?.voiceDetectionEnabled ?? true}
          onToggle={(v) => updateConfig({ voiceDetectionEnabled: v })}
        />
        <ToggleRow
          label="Enable Speaker"
          value={deviceConfig?.speakerEnabled ?? true}
          onToggle={(v) => updateConfig({ speakerEnabled: v })}
        />
      </View>

      {/* Emergency Keywords */}
      <SectionHeader title="Emergency Keywords" />
      <View style={styles.card}>
        {(deviceConfig?.emergencyKeywords ?? []).map((kw) => (
          <View key={kw} style={styles.keywordRow}>
            <View style={styles.keywordBadge}>
              <Text style={styles.keywordText}>{kw}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Escalation Policy */}
      <SectionHeader title="Emergency Escalation" />
      <View style={styles.card}>
        {(['WARNING_ONLY', 'VOICE_AND_ALERT', 'IMMEDIATE_ALERT'] as const).map((policy) => (
          <TouchableOpacity
            key={policy}
            style={[styles.policyRow, deviceConfig?.emergencyEscalation === policy && styles.policyRowActive]}
            onPress={() => updateConfig({ emergencyEscalation: policy })}
          >
            <View style={[styles.radio, deviceConfig?.emergencyEscalation === policy && styles.radioActive]} />
            <Text style={styles.policyLabel}>{policy.replace(/_/g, ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
};

const SectionHeader = ({ title }: { title: string }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const SettingRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.card}>
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  </View>
);

const ToggleRow = ({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) => (
  <View style={styles.toggleRow}>
    <Text style={styles.toggleLabel}>{label}</Text>
    <Switch value={value} onValueChange={onToggle} trackColor={{ true: colors.primary }} />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  sectionHeader: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: 0.8,
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
  optionText: { ...typography.body2, color: colors.textSecondary, fontWeight: '600' },
  optionTextActive: { color: colors.surface },
  keywordRow: { paddingVertical: spacing.xs },
  keywordBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  keywordText: { ...typography.body2, color: '#92400E', fontWeight: '700' },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  policyRowActive: { backgroundColor: '#F0F9FF' },
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
});
