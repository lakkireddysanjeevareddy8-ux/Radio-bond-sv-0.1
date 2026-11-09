import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  Radio,
  Wifi,
  Cpu,
  ShieldCheck,
  Clock,
  HardDrive,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react-native';
import { colors, typography, spacing, borderRadius, TOUCH_TARGET } from '../utils/theme';
import { useConnectionStore } from '../store/useConnectionStore';
import { useAppStore } from '../store/useAppStore';
import { ConnectionManager } from '../services/ConnectionManager';
import { BluetoothService } from '../services/bluetoothService';
import { strings } from '../constants/strings';

export const AboutDeviceScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const connectionStatus = useConnectionStore((s) => s.status);
  const connectionManagerState = useConnectionStore((s) => s.connectionManagerState);
  const connectedDevice = useConnectionStore((s) => s.connectedDevice);
  const deviceConfig = useAppStore((s) => s.deviceConfig);
  const telemetry = useAppStore((s) => s.telemetry);

  const [refreshing, setRefreshing] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<string | null>(null);

  const device = connectedDevice;
  const isConnected = connectionStatus === 'connected' || connectionManagerState === 'CONNECTED';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPingResult(null);
    try {
      if (isConnected) {
        const session = ConnectionManager.getActiveSession();
        if (session) {
          await BluetoothService.sendCommand(session, { cmd: 'GET_STATUS' });
        }
      } else {
        await ConnectionManager.retry();
      }
    } catch (e: any) {
      console.warn('[AboutDevice] Refresh error:', e?.message);
    } finally {
      setRefreshing(false);
    }
  }, [isConnected]);

  const handlePing = async () => {
    if (!isConnected) {
      Alert.alert('Offline', 'Connect to the safety guardian via Bluetooth to ping hardware.');
      return;
    }
    const session = ConnectionManager.getActiveSession();
    if (!session) {
      Alert.alert('Session Inactive', 'BLE session is not ready for direct commands.');
      return;
    }
    setPinging(true);
    const start = Date.now();
    try {
      await BluetoothService.sendCommand(session, { cmd: 'PING' });
      const duration = Date.now() - start;
      setPingResult(`Hardware PONG received in ${duration} ms`);
    } catch (err: any) {
      setPingResult(`Ping error: ${err?.message || 'Timeout'}`);
    } finally {
      setPinging(false);
    }
  };

  const formatUptime = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return 'Just started';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const getSignalRating = (rssi?: number): { label: string; color: string } => {
    if (!rssi || rssi === 0) return { label: 'Unknown', color: colors.textMuted };
    if (rssi >= -60) return { label: strings.aboutDevice.signalExcellent, color: colors.safe };
    if (rssi >= -70) return { label: strings.aboutDevice.signalGood, color: colors.safe };
    if (rssi >= -80) return { label: strings.aboutDevice.signalFair, color: colors.warning };
    return { label: strings.aboutDevice.signalWeak, color: colors.emergency };
  };

  const signalInfo = getSignalRating(device?.rssi);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          accessibilityLabel={strings.common.pullToRefresh}
        />
      }
    >
      {/* Status Header Banner */}
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <Radio size={24} color={isConnected ? colors.primary : colors.textMuted} />
          <View style={styles.heroTextCol}>
            <Text style={styles.deviceName}>{device?.name || 'Washroom Safety Guardian'}</Text>
            <Text style={styles.deviceIdText}>{device?.id || 'WSG-01-HW'}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isConnected ? styles.statusBadgeConnected : styles.statusBadgeOffline,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                isConnected ? styles.statusDotConnected : styles.statusDotOffline,
              ]}
            />
            <Text
              style={[
                styles.statusBadgeText,
                isConnected ? styles.statusBadgeTextConnected : styles.statusBadgeTextOffline,
              ]}
            >
              {connectionStatus}
            </Text>
          </View>
        </View>

        {/* Live Ping Button */}
        <TouchableOpacity
          style={styles.pingButton}
          onPress={handlePing}
          disabled={pinging || !isConnected}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Ping safety device hardware"
        >
          {pinging ? (
            <ActivityIndicator size="small" color={colors.surface} />
          ) : (
            <>
              <Send size={15} color={colors.surface} />
              <Text style={styles.pingButtonText}>{strings.aboutDevice.pingDevice}</Text>
            </>
          )}
        </TouchableOpacity>

        {pingResult && (
          <View style={styles.pingResultBox}>
            <Text style={styles.pingResultText}>{pingResult}</Text>
          </View>
        )}
      </View>

      {/* Specifications Section */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Network & Connectivity</Text>

        <View style={styles.specRow}>
          <View style={styles.specIconWrap}>
            <Wifi size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.specLabel}>{strings.aboutDevice.wifiNetwork}</Text>
          <Text style={styles.specValue}>{device?.ssid || 'Not Configured'}</Text>
        </View>

        <View style={styles.specRow}>
          <View style={styles.specIconWrap}>
            <HardDrive size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.specLabel}>{strings.aboutDevice.ipAddress}</Text>
          <Text style={styles.specValue}>{device?.ipAddress || 'DHCP Offline'}</Text>
        </View>

        <View style={styles.specRow}>
          <View style={styles.specIconWrap}>
            <Activity size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.specLabel}>{strings.aboutDevice.signalStrength}</Text>
          <View style={styles.signalBadge}>
            <Text style={[styles.signalText, { color: signalInfo.color }]}>
              {device?.rssi ? `${device.rssi} dBm (${signalInfo.label})` : '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Hardware & Firmware Specifications */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Firmware & Hardware</Text>

        <View style={styles.specRow}>
          <View style={styles.specIconWrap}>
            <Cpu size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.specLabel}>{strings.aboutDevice.firmwareVersion}</Text>
          <Text style={styles.specValue}>v1.2.0-esp32</Text>
        </View>

        <TouchableOpacity
          style={[styles.specRow, { backgroundColor: colors.primarySoft, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, marginVertical: spacing.xs }]}
          onPress={() => navigation.navigate('FirmwareUpdate')}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Check for firmware updates"
        >
          <View style={styles.specIconWrap}>
            <Sparkles size={18} color={colors.primary} />
          </View>
          <Text style={[styles.specLabel, { color: colors.primaryDark, fontWeight: '700' }]}>Firmware update (OTA)</Text>
          <Text style={[styles.specValue, { color: colors.primary, fontWeight: '700' }]}>Check $\rightarrow$</Text>
        </TouchableOpacity>

        <View style={styles.specRow}>
          <View style={styles.specIconWrap}>
            <ShieldCheck size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.specLabel}>{strings.aboutDevice.protocolVersion}</Text>
          <Text style={styles.specValue}>Protocol v1 (MTU 247)</Text>
        </View>

        <View style={styles.specRow}>
          <View style={styles.specIconWrap}>
            <Clock size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.specLabel}>{strings.aboutDevice.uptime}</Text>
          <Text style={styles.specValue}>{formatUptime(telemetry?.uptime)}</Text>
        </View>

        <View style={styles.specRow}>
          <View style={styles.specIconWrap}>
            <Activity size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.specLabel}>{strings.aboutDevice.radarSensor}</Text>
          <View style={styles.healthChip}>
            <CheckCircle2 size={14} color={colors.safe} />
            <Text style={styles.healthChipText}>{strings.aboutDevice.statusOk}</Text>
          </View>
        </View>

        <View style={[styles.specRow, { borderBottomWidth: 0 }]}>
          <View style={styles.specIconWrap}>
            <Activity size={18} color={colors.textSecondary} />
          </View>
          <Text style={styles.specLabel}>{strings.aboutDevice.micSensor}</Text>
          <View style={styles.healthChip}>
            <CheckCircle2 size={14} color={colors.safe} />
            <Text style={styles.healthChipText}>{strings.aboutDevice.statusOk}</Text>
          </View>
        </View>
      </View>

      {/* Pull to refresh hint */}
      <Text style={styles.pullHintText}>{strings.dashboard.pullToRefreshHint}</Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: spacing.md,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroTextCol: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  deviceName: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
  },
  deviceIdText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    gap: 5,
  },
  statusBadgeConnected: {
    backgroundColor: colors.safeSoft,
  },
  statusBadgeOffline: {
    backgroundColor: colors.offlineSoft,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: borderRadius.full,
  },
  statusDotConnected: {
    backgroundColor: colors.safe,
  },
  statusDotOffline: {
    backgroundColor: colors.offline,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextConnected: {
    color: colors.safeText,
  },
  statusBadgeTextOffline: {
    color: colors.offlineText,
  },
  pingButton: {
    minHeight: TOUCH_TARGET,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  pingButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  pingResultBox: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  pingResultText: {
    fontSize: 12,
    color: colors.textPrimary,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    minHeight: 44, // 44px touch / readability target
  },
  specIconWrap: {
    width: 28,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  specLabel: {
    ...typography.body2,
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  specValue: {
    ...typography.body2,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  signalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  signalText: {
    fontSize: 13,
    fontWeight: '600',
  },
  healthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  healthChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.safeText,
  },
  pullHintText: {
    ...typography.caption,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

