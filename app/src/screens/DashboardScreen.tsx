import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceConnectionService } from '../services/deviceConnectionService';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { SafetyStatusCard } from '../components/SafetyStatusCard';
import { Shield, Wifi, User, Activity, Clock, Mic, Volume2, RefreshCw } from 'lucide-react-native';

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
  } = useAppStore();
  const { getActiveDevice } = useDeviceStore();
  const activeDevice = getActiveDevice();
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

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

  if (!isOnline) {
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

        {/* Offline Warning with Controlled Reconnect */}
        {!isOnline && (
          <View style={styles.offlineCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.offlineTitle}>⚠️ Device Status Unavailable</Text>
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
              The device is offline. Safety monitoring cannot be confirmed. Subtle indicator active; no false alarm triggered.
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
      </ScrollView>
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
