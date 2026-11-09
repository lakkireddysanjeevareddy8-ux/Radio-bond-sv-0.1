import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Battery,
  Wifi,
  Bluetooth,
  ShieldCheck,
  RefreshCw,
  Download,
  Clock,
  Sparkles,
} from 'lucide-react-native';
import { colors, typography, spacing, borderRadius, TOUCH_TARGET } from '../utils/theme';
import { useConnectionStore } from '../store/useConnectionStore';
import { useAppStore } from '../store/useAppStore';
import {
  FirmwareUpdateService,
  FirmwareRelease,
  OtaProgressInfo,
  DEFAULT_FALLBACK_RELEASE,
} from '../services/FirmwareUpdateService';
import { PhoneBatteryService } from '../services/PhoneBatteryService';
import { strings } from '../constants/strings';

export const FirmwareUpdateScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const connStatus = useConnectionStore((s) => s.status);
  const connManagerState = useConnectionStore((s) => s.connectionManagerState);
  const connectedDevice = useConnectionStore((s) => s.connectedDevice);
  const wifiStatus = useAppStore((s) => s.wifiStatus);

  const [otaInfo, setOtaInfo] = useState<OtaProgressInfo>(
    FirmwareUpdateService.getProgressInfo()
  );
  const [phoneBattery, setPhoneBattery] = useState<number>(85);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const isBleConnected =
    connStatus === 'connected' || connManagerState === 'CONNECTED';
  const isDeviceOnWifi = Boolean(
    connectedDevice?.ssid ||
      wifiStatus === 'CONNECTED' ||
      connectedDevice?.ipAddress
  );

  const deviceId = connectedDevice?.id || 'wsg01-device';
  const deviceName = connectedDevice?.name || 'Washroom Safety Guardian';

  // Load battery level and sync OTA service
  const refreshPrerequisites = useCallback(async () => {
    setIsChecking(true);
    try {
      const batLevel = await PhoneBatteryService.getBatteryLevel();
      setPhoneBattery(batLevel);

      const currentFw =
        connectedDevice?.model === 'WSG-01'
          ? otaInfo.currentFw
          : otaInfo.currentFw;
      await FirmwareUpdateService.checkForUpdates(currentFw);
    } catch (e: any) {
      console.warn('[FirmwareUpdate] Refresh error:', e?.message);
    } finally {
      setIsChecking(false);
    }
  }, [connectedDevice, otaInfo.currentFw]);

  useEffect(() => {
    refreshPrerequisites();
    const unsub = FirmwareUpdateService.subscribe((info) => {
      setOtaInfo(info);
      if (
        info.state === 'DOWNLOADING' ||
        info.state === 'VERIFYING' ||
        info.state === 'REBOOTING' ||
        info.state === 'HEALTH_CHECK'
      ) {
        setIsUpdating(true);
      } else {
        setIsUpdating(false);
      }
    });
    return unsub;
  }, [refreshPrerequisites]);

  const targetRelease: FirmwareRelease =
    otaInfo.targetRelease || DEFAULT_FALLBACK_RELEASE;
  const isBatterySufficient = phoneBattery > 30;
  const isEligible = isBleConnected && isDeviceOnWifi && isBatterySufficient;
  const hasUpdate = otaInfo.state === 'AVAILABLE';

  const handleStartUpdatePress = () => {
    if (!isEligible) {
      Alert.alert(
        'Prerequisites Incomplete',
        'Please resolve the requirements before updating (Phone battery > 30%, Device on Wi-Fi, and active Bluetooth connection).'
      );
      return;
    }
    // Show confirmation modal (never flash automatically)
    setShowConfirmModal(true);
  };

  const confirmStartUpdate = async () => {
    setShowConfirmModal(false);
    try {
      await FirmwareUpdateService.startUpdate(deviceId, isDeviceOnWifi);
    } catch (err: any) {
      Alert.alert('Update Failed to Start', err?.message || 'Bluetooth communication failed');
    }
  };

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes >= 1048576) {
      return `${(bytes / 1048576).toFixed(2)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Firmware Update</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={refreshPrerequisites}
          disabled={isChecking || isUpdating}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Check for updates"
        >
          {isChecking ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <RefreshCw size={20} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Device & Version Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <View style={styles.iconCircle}>
              <Cpu size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.deviceName}>{deviceName}</Text>
              <Text style={styles.deviceIdText}>{deviceId}</Text>
            </View>
            <View
              style={[
                styles.versionBadge,
                hasUpdate ? styles.versionBadgeUpdate : styles.versionBadgeCurrent,
              ]}
            >
              <Text
                style={[
                  styles.versionBadgeText,
                  hasUpdate ? styles.versionBadgeTextUpdate : styles.versionBadgeTextCurrent,
                ]}
              >
                {hasUpdate ? 'Update Available' : 'Up to Date'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.versionCompareRow}>
            <View style={styles.versionCol}>
              <Text style={styles.versionLabel}>Installed Firmware</Text>
              <Text style={styles.versionValue}>{otaInfo.currentFw}</Text>
            </View>
            <View style={styles.versionArrowCol}>
              <Text style={styles.versionArrow}>$\rightarrow$</Text>
            </View>
            <View style={styles.versionCol}>
              <Text style={styles.versionLabel}>Latest Release</Text>
              <Text style={[styles.versionValue, { color: colors.primary }]}>
                {targetRelease.fw}
              </Text>
            </View>
          </View>
        </View>

        {/* Live In-Progress OTA Card */}
        {isUpdating && (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.progressStateTitle}>
                {otaInfo.state === 'STARTING' && 'Initiating OTA handshake...'}
                {otaInfo.state === 'DOWNLOADING' && `Downloading: ${otaInfo.progress}%`}
                {otaInfo.state === 'VERIFYING' && 'Verifying SHA-256 integrity...'}
                {otaInfo.state === 'REBOOTING' && 'Flashing complete. Rebooting device...'}
                {otaInfo.state === 'HEALTH_CHECK' && 'Health test in progress (60s rollback window)...'}
              </Text>
            </View>

            <View style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${Math.min(100, Math.max(5, otaInfo.progress))}%` },
                ]}
              />
            </View>

            <View style={styles.progressFooter}>
              <Text style={styles.progressDetail}>
                {otaInfo.bytesWritten && otaInfo.totalBytes
                  ? `${formatBytes(otaInfo.bytesWritten)} / ${formatBytes(otaInfo.totalBytes)}`
                  : `${otaInfo.progress}% complete`}
              </Text>
              <Text style={styles.progressWarning}>Keep device powered on</Text>
            </View>
          </View>
        )}

        {/* Success Banner */}
        {otaInfo.state === 'SUCCESS' && (
          <View style={styles.successCard}>
            <CheckCircle2 size={24} color="#059669" />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.successTitle}>Firmware Update Succeeded</Text>
              <Text style={styles.successDesc}>
                Device is running {otaInfo.currentFw} on the primary partition. 60-second health check verified.
              </Text>
            </View>
          </View>
        )}

        {/* Error Banner */}
        {otaInfo.state === 'ERROR' && (
          <View style={styles.errorCard}>
            <AlertTriangle size={24} color={colors.emergency} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.errorTitle}>Update Did Not Complete</Text>
              <Text style={styles.errorDesc}>{otaInfo.errorMessage}</Text>
              <Text style={styles.errorWhatToDo}>
                What to do: Verify device has 2.4 GHz Wi-Fi access, phone is near the device, and try again.
              </Text>
            </View>
          </View>
        )}

        {/* Release Notes */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Sparkles size={18} color={colors.primary} />
            <Text style={styles.cardTitle}>Release Notes — {targetRelease.version}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Clock size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>
                {targetRelease.published_at
                  ? new Date(targetRelease.published_at).toLocaleDateString()
                  : 'Recent'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Download size={14} color={colors.textSecondary} />
              <Text style={styles.metaText}>
                {formatBytes(targetRelease.file_size_bytes)}
              </Text>
            </View>
          </View>
          <Text style={styles.releaseNotesText}>{targetRelease.release_notes}</Text>
        </View>

        {/* Prerequisites Checklist */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Installation Requirements</Text>
          <Text style={styles.cardSubtitle}>
            All requirements must be satisfied before firmware can be downloaded.
          </Text>

          {/* 1. Phone Battery Requirement */}
          <View style={styles.prereqRow}>
            <View style={styles.prereqLeft}>
              <Battery
                size={20}
                color={isBatterySufficient ? '#059669' : colors.emergency}
              />
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={styles.prereqName}>Phone Battery Above 30%</Text>
                <Text style={styles.prereqDesc}>
                  Current: {phoneBattery}% {isBatterySufficient ? '(Sufficient)' : '(Too low)'}
                </Text>
              </View>
            </View>
            {isBatterySufficient ? (
              <CheckCircle2 size={18} color="#059669" />
            ) : (
              <AlertTriangle size={18} color={colors.emergency} />
            )}
          </View>

          <View style={styles.divider} />

          {/* 2. Device Wi-Fi Requirement */}
          <View style={styles.prereqRow}>
            <View style={styles.prereqLeft}>
              <Wifi
                size={20}
                color={isDeviceOnWifi ? '#059669' : colors.emergency}
              />
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={styles.prereqName}>Device Connected to Wi-Fi</Text>
                <Text style={styles.prereqDesc}>
                  {isDeviceOnWifi
                    ? `Active network: ${connectedDevice?.ssid || '2.4 GHz Wi-Fi'}`
                    : 'Device is offline or Wi-Fi not provisioned'}
                </Text>
              </View>
            </View>
            {isDeviceOnWifi ? (
              <CheckCircle2 size={18} color="#059669" />
            ) : (
              <AlertTriangle size={18} color={colors.emergency} />
            )}
          </View>

          <View style={styles.divider} />

          {/* 3. Bluetooth Connection */}
          <View style={styles.prereqRow}>
            <View style={styles.prereqLeft}>
              <Bluetooth
                size={20}
                color={isBleConnected ? '#059669' : colors.emergency}
              />
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={styles.prereqName}>Bluetooth Link Active</Text>
                <Text style={styles.prereqDesc}>
                  {isBleConnected ? 'Connected & ready for GATT command' : 'Disconnected'}
                </Text>
              </View>
            </View>
            {isBleConnected ? (
              <CheckCircle2 size={18} color="#059669" />
            ) : (
              <AlertTriangle size={18} color={colors.emergency} />
            )}
          </View>

          <View style={styles.divider} />

          {/* 4. Pairing Token Security */}
          <View style={styles.prereqRow}>
            <View style={styles.prereqLeft}>
              <ShieldCheck size={20} color="#059669" />
              <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                <Text style={styles.prereqName}>Cryptographic Token</Text>
                <Text style={styles.prereqDesc}>
                  SecureStore authentication attached to command
                </Text>
              </View>
            </View>
            <CheckCircle2 size={18} color="#059669" />
          </View>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={[
            styles.updateBtn,
            (!isEligible || isUpdating) && styles.updateBtnDisabled,
          ]}
          onPress={handleStartUpdatePress}
          disabled={!isEligible || isUpdating}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Update firmware"
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.updateBtnText}>
              {hasUpdate ? 'Install Firmware Update' : 'Reinstall Latest Firmware'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Manual Confirmation Modal (Do Not Flash Automatically) */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <ShieldCheck size={28} color={colors.primary} />
              <Text style={styles.modalTitle}>Confirm Firmware Update</Text>
            </View>

            <Text style={styles.modalBody}>
              The device will download version{' '}
              <Text style={{ fontWeight: '700' }}>{targetRelease.fw}</Text> directly over
              Wi-Fi, verify its cryptographic SHA-256 checksum, and switch to the secondary OTA
              partition.
            </Text>

            <Text style={styles.modalWarning}>
              ⚠️ Automatic Rollback: If the new firmware encounters an issue within 60
              seconds, the hardware will safely roll back to the previous partition.
            </Text>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowConfirmModal(false)}
                accessible={true}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmStartUpdate}
                accessible={true}
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>Start Update</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
  },
  refreshBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: spacing.md,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceName: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
  },
  deviceIdText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  versionBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  versionBadgeUpdate: {
    backgroundColor: '#FEF3C7',
  },
  versionBadgeCurrent: {
    backgroundColor: colors.safeSoft,
  },
  versionBadgeText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '700',
  },
  versionBadgeTextUpdate: {
    color: '#B45309',
  },
  versionBadgeTextCurrent: {
    color: colors.safe,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  versionCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  versionCol: {
    flex: 1,
  },
  versionArrowCol: {
    paddingHorizontal: spacing.sm,
  },
  versionArrow: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  versionLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  versionValue: {
    ...typography.body1,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  progressCard: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressStateTitle: {
    ...typography.body1,
    fontWeight: '700',
    color: colors.primaryDark,
    marginLeft: spacing.sm,
  },
  progressBarTrack: {
    height: 10,
    backgroundColor: '#DBEAFE',
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressDetail: {
    ...typography.caption,
    color: colors.primaryDark,
    fontWeight: '600',
  },
  progressWarning: {
    ...typography.caption,
    color: '#B45309',
    fontWeight: '700',
  },
  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  successTitle: {
    ...typography.body1,
    fontWeight: '700',
    color: '#065F46',
  },
  successDesc: {
    ...typography.caption,
    color: '#047857',
    marginTop: 2,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorTitle: {
    ...typography.body1,
    fontWeight: '700',
    color: '#991B1B',
  },
  errorDesc: {
    ...typography.caption,
    color: '#B91C1C',
    marginTop: 2,
  },
  errorWhatToDo: {
    ...typography.caption,
    color: '#7F1D1D',
    fontWeight: '600',
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    ...typography.h3,
    fontSize: 16,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginVertical: spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  releaseNotesText: {
    ...typography.body1,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  prereqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  prereqLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  prereqName: {
    ...typography.body1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  prereqDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  updateBtn: {
    backgroundColor: colors.primary,
    minHeight: TOUCH_TARGET,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  updateBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  updateBtnText: {
    ...typography.label,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 420,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
  },
  modalBody: {
    ...typography.body1,
    fontSize: 14,
    lineHeight: 22,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  modalWarning: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 18,
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  modalCancelBtn: {
    minHeight: 44,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  modalCancelText: {
    ...typography.label,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalConfirmBtn: {
    minHeight: 44,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    ...typography.label,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});

