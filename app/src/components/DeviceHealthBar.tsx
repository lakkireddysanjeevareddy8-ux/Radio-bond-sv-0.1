import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Battery, BatteryLow, Wifi, AlertTriangle, Clock, Radio, Mic, Volume2, CheckCircle2 } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import { DeviceHealth } from '../types';

interface DeviceHealthBarProps {
  batteryPct?: number;
  rssi?: number;
  lastSeen?: string;
  isOnline?: boolean;
  health?: DeviceHealth | null;
}

export const DeviceHealthBar: React.FC<DeviceHealthBarProps> = ({
  batteryPct: propBatteryPct,
  rssi: propRssi,
  lastSeen: propLastSeen,
  isOnline: propIsOnline,
  health: propHealth,
}) => {
  const storeHealth = useAppStore((state) => state.deviceHealth);
  const storeOnline = useAppStore((state) => state.isOnline);

  const health = propHealth !== undefined ? propHealth : storeHealth;
  const isOnline = propIsOnline !== undefined ? propIsOnline : storeOnline;

  const batteryPct = health?.batteryPct ?? propBatteryPct ?? 95;
  const rssi = health?.rssi ?? propRssi ?? -58;
  const lastSeen = health?.lastSeenAt ?? propLastSeen;

  // Compute staleness
  const lastSeenDate = lastSeen ? new Date(lastSeen) : new Date();
  const minutesAgo = Math.round((Date.now() - lastSeenDate.getTime()) / (1000 * 60));
  const isStale = minutesAgo > 5 || !isOnline;
  const isLowBattery = batteryPct <= 20;

  // Signal strength description
  const getSignalText = (dBm: number) => {
    if (dBm >= -60) return 'Strong';
    if (dBm >= -75) return 'Good';
    if (dBm >= -85) return 'Fair';
    return 'Weak';
  };

  const getBatteryColor = (pct: number) => {
    if (pct > 50) return '#059669'; // Green
    if (pct > 20) return '#D97706'; // Amber
    return '#DC2626'; // Red
  };

  const getStatusColor = (status?: string) => {
    if (status === 'OK') return '#059669';
    if (status === 'DEGRADED') return '#D97706';
    return '#DC2626';
  };

  return (
    <View style={styles.container}>
      {/* Maintenance Warning if Device is Unreachable or Low Battery (STRICTLY NON-EMERGENCY) */}
      {isStale && (
        <View style={styles.warningBanner}>
          <AlertTriangle size={15} color="#B45309" />
          <Text style={styles.warningText}>
            Maintenance: Device unreachable for {minutesAgo > 1 ? `${minutesAgo}m` : 'a few moments'}. Local safety siren remains active on device.
          </Text>
        </View>
      )}

      {isLowBattery && !isStale && (
        <View style={styles.warningBanner}>
          <BatteryLow size={16} color="#DC2626" />
          <Text style={[styles.warningText, { color: '#B91C1C' }]}>
            Low Battery Warning ({batteryPct}%). Please connect to charger or inspect power source.
          </Text>
        </View>
      )}

      {/* Metric Indicators Row */}
      <View style={styles.metricsRow}>
        {/* Battery Indicator */}
        <View style={styles.metricItem}>
          <View style={styles.iconWrapper}>
            <Battery size={15} color={getBatteryColor(batteryPct)} />
          </View>
          <Text style={styles.metricLabel}>Battery</Text>
          <Text style={[styles.metricValue, { color: getBatteryColor(batteryPct) }]}>
            {batteryPct}%
          </Text>
        </View>

        <View style={styles.divider} />

        {/* WiFi RSSI Signal Strength */}
        <View style={styles.metricItem}>
          <View style={styles.iconWrapper}>
            <Wifi size={15} color={isOnline ? '#2563EB' : '#94A3B8'} />
          </View>
          <Text style={styles.metricLabel}>Signal</Text>
          <Text style={styles.metricValue}>
            {isOnline ? `${getSignalText(rssi)} (${rssi} dBm)` : 'Offline'}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Last Seen Timestamp */}
        <View style={styles.metricItem}>
          <View style={styles.iconWrapper}>
            <Clock size={15} color="#64748B" />
          </View>
          <Text style={styles.metricLabel}>Last Seen</Text>
          <Text style={styles.metricValue}>
            {minutesAgo < 1 ? 'Live now' : `${minutesAgo}m ago`}
          </Text>
        </View>
      </View>

      {/* Hardware Diagnostics / Self-Test Indicators */}
      {health && (
        <View style={styles.diagnosticsRow}>
          <View style={styles.diagBadge}>
            <Radio size={12} color={getStatusColor(health.radarStatus)} />
            <Text style={styles.diagLabel}>Radar</Text>
            <Text style={[styles.diagValue, { color: getStatusColor(health.radarStatus) }]}>
              {health.radarStatus}
            </Text>
          </View>

          <View style={styles.diagBadge}>
            <Mic size={12} color="#059669" />
            <Text style={styles.diagLabel}>Mic</Text>
            <Text style={[styles.diagValue, { color: '#059669' }]}>
              {(health.micLevel ?? 0) > 0 ? `${(health.micLevel ?? 0).toFixed(0)} dB` : 'OK'}
            </Text>
          </View>

          <View style={styles.diagBadge}>
            <Volume2 size={12} color={getStatusColor(health.speakerStatus)} />
            <Text style={styles.diagLabel}>Speaker</Text>
            <Text style={[styles.diagValue, { color: getStatusColor(health.speakerStatus) }]}>
              {health.speakerStatus}
            </Text>
          </View>

          <View style={styles.diagBadge}>
            <CheckCircle2 size={12} color="#2563EB" />
            <Text style={styles.diagLabel}>Heartbeat</Text>
            <Text style={[styles.diagValue, { color: '#2563EB' }]}>
              {health.heartbeatIntervalMin}m
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: '#E2E8F0',
  },
  diagnosticsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  diagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  diagLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },
  diagValue: {
    fontSize: 11,
    fontWeight: '700',
  },
});
