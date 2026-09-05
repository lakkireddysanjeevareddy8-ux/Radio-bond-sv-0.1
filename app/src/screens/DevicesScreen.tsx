import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { Wifi, Activity, Clock, Cpu, Server } from 'lucide-react-native';

export const DevicesScreen: React.FC = () => {
  const { deviceConfig, telemetry, isOnline } = useAppStore();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Active Device Card */}
      <View style={styles.deviceCard}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceIconBox}>
            <Cpu size={28} color={colors.primary} />
          </View>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName}>{deviceConfig?.deviceName || 'No device'}</Text>
            <View style={styles.onlineRow}>
              <View style={[styles.dot, { backgroundColor: isOnline ? colors.safe : colors.offline }]} />
              <Text style={[styles.onlineText, { color: isOnline ? colors.safe : colors.offline }]}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.statsGrid}>
          <StatItem icon={<Server size={16} color={colors.textSecondary} />} label="Device ID" value={deviceConfig?.deviceId || '—'} />
          <StatItem icon={<Activity size={16} color={colors.textSecondary} />} label="Firmware" value={telemetry?.firmwareVersion || '—'} />
          <StatItem icon={<Wifi size={16} color={colors.textSecondary} />} label="Wi-Fi RSSI" value={telemetry?.wifiRSSI ? `${telemetry.wifiRSSI} dBm` : '—'} />
          <StatItem icon={<Clock size={16} color={colors.textSecondary} />} label="Uptime" value={telemetry?.uptime ? `${telemetry.uptime}s` : '—'} />
        </View>

        <View style={styles.deviceActions}>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.actionButtonText}>Configure</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}>
            <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Rename</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DEMO notice */}
      <View style={styles.demoNotice}>
        <Text style={styles.demoNoticeTitle}>🧪 DEMO MODE</Text>
        <Text style={styles.demoNoticeText}>This is a simulated device. The real ESP32 device will appear here after pairing via Bluetooth.</Text>
      </View>

      {/* Add device */}
      <TouchableOpacity style={styles.addDeviceButton}>
        <Text style={styles.addDeviceText}>+ Add Real Device</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const StatItem = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <View style={styles.statItem}>
    {icon}
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  deviceCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  deviceIconBox: {
    width: 56, height: 56, borderRadius: borderRadius.md,
    backgroundColor: '#E0F2FE', justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  deviceInfo: { flex: 1 },
  deviceName: { ...typography.h3, color: colors.textPrimary, marginBottom: 4 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { ...typography.caption, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statItem: {
    width: '47%', backgroundColor: colors.background, padding: spacing.md,
    borderRadius: borderRadius.md, gap: 4,
  },
  statLabel: { ...typography.caption, color: colors.textSecondary, textTransform: 'uppercase' },
  statValue: { ...typography.body2, color: colors.textPrimary, fontWeight: '600' },
  deviceActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  actionButton: {
    flex: 1, padding: spacing.md, borderRadius: borderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  actionButtonText: { ...typography.body2, color: colors.surface, fontWeight: '700' },
  demoNotice: {
    backgroundColor: '#FEF9C3', borderRadius: borderRadius.md, padding: spacing.md,
    marginTop: spacing.lg, borderWidth: 1, borderColor: '#FDE047',
  },
  demoNoticeTitle: { ...typography.body2, color: '#713F12', fontWeight: '700', marginBottom: 4 },
  demoNoticeText: { ...typography.caption, color: '#713F12' },
  addDeviceButton: {
    marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', alignItems: 'center',
  },
  addDeviceText: { ...typography.body1, color: colors.primary, fontWeight: '600' },
});
