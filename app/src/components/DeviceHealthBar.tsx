import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Battery,
  BatteryLow,
  Wifi,
  WifiOff,
  Clock,
  Radio,
  Mic,
  Volume2,
  HeartPulse,
  AlertTriangle,
} from 'lucide-react-native';
import {
  colors,
  spacing,
  borderRadius,
  typography,
  toneColors,
  shadows,
  Tone,
} from '../utils/theme';
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

  const rawBattery = health?.batteryPct ?? propBatteryPct;
  const hasBattery = typeof rawBattery === 'number' && !isNaN(rawBattery);
  const batteryPct = hasBattery ? rawBattery : null;

  const rawRssi = health?.rssi ?? propRssi;
  const hasRssi = typeof rawRssi === 'number' && !isNaN(rawRssi);
  const rssi = hasRssi ? rawRssi : null;

  const lastSeen = health?.lastSeenAt ?? propLastSeen;

  // Compute staleness
  let lastSeenText = 'Unknown';
  let minutesAgo = 0;
  let isStale = false;

  if (lastSeen) {
    const lastSeenDate = new Date(lastSeen);
    if (!isNaN(lastSeenDate.getTime())) {
      minutesAgo = Math.max(0, Math.round((Date.now() - lastSeenDate.getTime()) / (1000 * 60)));
      isStale = minutesAgo > 5 || !isOnline;
      lastSeenText = minutesAgo < 1 ? 'Live now' : `${minutesAgo}m ago`;
    }
  } else if (isOnline) {
    lastSeenText = 'Live now';
  }

  const isLowBattery = batteryPct !== null && batteryPct <= 20;

  const getSignalText = (dBm: number) => {
    if (dBm >= -60) return 'Strong';
    if (dBm >= -75) return 'Good';
    if (dBm >= -85) return 'Fair';
    return 'Weak';
  };

  const getBatteryTone = (pct: number | null): Tone => {
    if (pct === null) return 'neutral';
    if (pct > 50) return 'safe';
    if (pct > 20) return 'warning';
    return 'emergency';
  };

  const batteryTone = getBatteryTone(batteryPct);
  const batteryColor = toneColors(batteryTone).icon;

  return (
    <View style={styles.container}>
      {/* Low Battery Warning Banner */}
      {isLowBattery && (
        <View style={styles.warningBanner}>
          <BatteryLow size={16} color={colors.emergency} />
          <Text style={styles.warningText}>
            Low battery ({batteryPct}%). Please connect charger or replace power source.
          </Text>
        </View>
      )}

      {/* 3 Metric Chips Row */}
      <View style={styles.chipsRow}>
        {/* 1. Battery Chip */}
        <View style={styles.chip}>
          <View style={[styles.chipIconBox, { backgroundColor: toneColors(batteryTone).bg }]}>
            {isLowBattery ? (
              <BatteryLow size={15} color={batteryColor} />
            ) : (
              <Battery size={15} color={batteryColor} />
            )}
          </View>
          <View style={styles.chipTextWrap}>
            <Text style={styles.chipLabel}>Battery</Text>
            <Text style={[styles.chipValue, { color: batteryPct !== null ? batteryColor : colors.textSecondary }]}>
              {batteryPct !== null ? `${batteryPct}%` : 'Unknown'}
            </Text>
          </View>
        </View>

        {/* 2. Signal Chip */}
        <View style={styles.chip}>
          <View
            style={[
              styles.chipIconBox,
              { backgroundColor: isOnline ? colors.infoSoft : colors.offlineSoft },
            ]}
          >
            {isOnline ? (
              <Wifi size={15} color={colors.info} />
            ) : (
              <WifiOff size={15} color={colors.offline} />
            )}
          </View>
          <View style={styles.chipTextWrap}>
            <Text style={styles.chipLabel}>Signal</Text>
            <Text style={styles.chipValue}>
              {!isOnline
                ? 'Offline'
                : rssi !== null
                ? `${getSignalText(rssi)} (${rssi} dBm)`
                : 'Connected'}
            </Text>
          </View>
        </View>

        {/* 3. Last Seen Chip */}
        <View style={styles.chip}>
          <View style={[styles.chipIconBox, { backgroundColor: colors.surfaceAlt }]}>
            <Clock size={15} color={colors.textSecondary} />
          </View>
          <View style={styles.chipTextWrap}>
            <Text style={styles.chipLabel}>Last seen</Text>
            <Text style={styles.chipValue}>{lastSeenText}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

export const DeviceDiagnosticsSection: React.FC<{
  health?: DeviceHealth | null;
  radarActive?: boolean;
}> = ({ health, radarActive }) => {
  const getStatusTone = (status?: string): Tone => {
    if (!status) return 'neutral';
    if (status === 'OK' || status === 'HEALTHY' || status === 'ACTIVE') return 'safe';
    if (status === 'DEGRADED' || status === 'WARN') return 'warning';
    return 'emergency';
  };

  const radarStatus = health?.radarStatus || (radarActive ? 'ACTIVE' : 'Unknown');
  const micStatus = health?.micLevel !== undefined ? `${health.micLevel.toFixed(0)} dB` : 'Unknown';
  const speakerStatus = health?.speakerStatus || 'Unknown';
  const heartbeatStatus = health?.lastSeenAt ? 'OK' : 'Unknown';

  return (
    <View style={styles.diagContainer}>
      <View style={styles.diagGrid}>
        <View style={styles.diagItem}>
          <Radio size={14} color={toneColors(getStatusTone(radarStatus)).icon} />
          <Text style={styles.diagLabel}>Radar</Text>
          <Text style={[styles.diagValue, { color: toneColors(getStatusTone(radarStatus)).text }]}>
            {radarStatus}
          </Text>
        </View>

        <View style={styles.diagItem}>
          <Mic size={14} color={colors.primaryDark} />
          <Text style={styles.diagLabel}>Mic</Text>
          <Text style={styles.diagValue}>{micStatus}</Text>
        </View>

        <View style={styles.diagItem}>
          <Volume2 size={14} color={toneColors(getStatusTone(speakerStatus)).icon} />
          <Text style={styles.diagLabel}>Speaker</Text>
          <Text style={[styles.diagValue, { color: toneColors(getStatusTone(speakerStatus)).text }]}>
            {speakerStatus}
          </Text>
        </View>

        <View style={styles.diagItem}>
          <HeartPulse size={14} color={toneColors(getStatusTone(heartbeatStatus)).icon} />
          <Text style={styles.diagLabel}>Heartbeat</Text>
          <Text style={[styles.diagValue, { color: toneColors(getStatusTone(heartbeatStatus)).text }]}>
            {heartbeatStatus}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.emergencySoft,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.xs,
    gap: spacing.xs,
  },
  warningText: {
    ...typography.caption,
    color: colors.emergencyText,
    fontWeight: '600',
    flex: 1,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.xs + 3,
    ...shadows.sm,
  },
  chipIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  chipTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  chipLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
    lineHeight: 12,
  },
  chipValue: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 14,
    marginTop: 1,
  },
  diagContainer: {
    marginTop: spacing.sm,
  },
  diagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  diagItem: {
    flex: 1,
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  diagLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  diagValue: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
