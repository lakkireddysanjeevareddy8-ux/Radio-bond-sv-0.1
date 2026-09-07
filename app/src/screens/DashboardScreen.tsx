import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { SafetyStatusCard } from '../components/SafetyStatusCard';
import { EmergencyScreen } from './EmergencyScreen';
import { Shield, Wifi, User, Activity, Clock, Mic, Volume2 } from 'lucide-react-native';

export const DashboardScreen: React.FC = () => {
  const { deviceConfig, telemetry, isOnline, activeEmergency, voicePrompt } = useAppStore();

  let safetyStatus: 'SAFE' | 'MONITORING' | 'CHECKING' | 'EMERGENCY' | 'OFFLINE' = 'SAFE';

  if (!isOnline) {
    safetyStatus = 'OFFLINE';
  } else if (
    telemetry?.state === 'EMERGENCY' ||
    (activeEmergency && activeEmergency.status === 'ACTIVE' && telemetry?.state !== 'IDLE' && telemetry?.state !== 'SAFE')
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

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.deviceName}>{deviceConfig?.deviceName || 'No Device'}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: isOnline ? colors.safe : colors.offline }]} />
              <Text style={[styles.statusText, { color: isOnline ? colors.safe : colors.offline }]}>
                {isOnline ? '● ONLINE' : '● OFFLINE'}
              </Text>
            </View>
          </View>
          <View style={styles.shieldIcon}>
            <Shield color={colors.primary} size={32} />
          </View>
        </View>

        {/* Safety Status Card */}
        <SafetyStatusCard status={safetyStatus} />

        {/* Voice Prompt Banner */}
        {voicePrompt && (
          <View style={styles.voiceBanner}>
            <Volume2 size={20} color="#0284C7" />
            <Text style={styles.voiceBannerText}>Device says: "{voicePrompt}"</Text>
          </View>
        )}

        {/* Offline Warning */}
        {!isOnline && (
          <View style={styles.offlineCard}>
            <Text style={styles.offlineTitle}>⚠️ Device Status Unavailable</Text>
            <Text style={styles.offlineText}>
              The device is offline. Safety cannot be confirmed. Last seen: just now.
            </Text>
          </View>
        )}

        {/* Live Metrics */}
        {isOnline && telemetry && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Live Status</Text>
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
                icon={<Mic size={18} color={colors.textSecondary} />}
                title="Voice"
                value="Monitoring"
                active={false}
              />
              <MetricBox
                icon={<Shield size={18} color={colors.textSecondary} />}
                title="State"
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
      </ScrollView>

      {/* Emergency overlay rendered on top */}
      {activeEmergency && safetyStatus === 'EMERGENCY' && <EmergencyScreen />}
    </View>
  );
};

const MetricBox = ({
  icon, title, value, active,
}: {
  icon: React.ReactNode; title: string; value: string; active: boolean;
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  deviceName: { ...typography.h2, color: colors.textPrimary, marginBottom: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { ...typography.caption, fontWeight: '700' },
  shieldIcon: {
    width: 56, height: 56, borderRadius: borderRadius.md,
    backgroundColor: '#E0F2FE', justifyContent: 'center', alignItems: 'center',
  },
  voiceBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#E0F2FE', padding: spacing.md, borderRadius: borderRadius.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: '#BAE6FD',
  },
  voiceBannerText: { ...typography.body2, color: '#0284C7', fontWeight: '600', flex: 1 },
  offlineCard: {
    backgroundColor: '#FEF2F2', borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.md, borderWidth: 1, borderColor: '#FCA5A5',
  },
  offlineTitle: { ...typography.body2, color: colors.emergency, fontWeight: '700', marginBottom: 4 },
  offlineText: { ...typography.body2, color: '#991B1B' },
  section: { marginTop: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metricBox: {
    width: '47%', backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  metricBoxActive: { borderColor: colors.primary + '60', backgroundColor: '#F0F9FF' },
  metricIconRow: { marginBottom: spacing.xs },
  metricTitle: { ...typography.caption, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 2 },
  metricValue: { ...typography.body2, color: colors.textPrimary, fontWeight: '700' },
  privacyNote: {
    marginTop: spacing.xl, padding: spacing.md, backgroundColor: '#F0FDF4',
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: '#BBF7D0',
  },
  privacyText: { ...typography.caption, color: '#166534' },
});
