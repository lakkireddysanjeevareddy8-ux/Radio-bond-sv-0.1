import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Battery, BatteryCharging, BatteryLow, Wifi, AlertTriangle, Clock } from 'lucide-react-native';
import { colors, spacing, borderRadius } from '../utils/theme';

interface DeviceHealthBarProps {
  batteryPct?: number;
  rssi?: number;
  lastSeen?: string;
  isOnline?: boolean;
}

export const DeviceHealthBar: React.FC<DeviceHealthBarProps> = ({
  batteryPct = 95,
  rssi = -58,
  lastSeen,
  isOnline = true,
}) => {
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
});
