import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { useAppStore } from '../store/useAppStore';
import {
  Wifi,
  Activity,
  Clock,
  Cpu,
  Server,
  X,
  Check,
  Settings as SettingsIcon,
  Radio,
  Bluetooth,
  BluetoothSearching,
  CheckCircle,
  RefreshCw,
  Signal,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

type PairingStep = 'CHOOSE_METHOD' | 'SCANNING' | 'FOUND' | 'CONNECTING' | 'SUCCESS';
type ConnectionType = 'BLUETOOTH' | 'WIFI';

export const DevicesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { deviceConfig, setDeviceConfig, telemetry, isOnline, isSimulatorMode, setIsSimulatorMode } = useAppStore();

  // Rename modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameValue, setRenameValue] = useState(deviceConfig?.deviceName || '');

  // Pairing workflow state
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [pairingStep, setPairingStep] = useState<PairingStep>('CHOOSE_METHOD');
  const [selectedMethod, setSelectedMethod] = useState<ConnectionType>('BLUETOOTH');
  const [scanMessage, setScanMessage] = useState('Initializing radio scan...');
  const [customDeviceName, setCustomDeviceName] = useState('ESP32 Washroom SafeGuard');
  const [discoveredDeviceId, setDiscoveredDeviceId] = useState('esp32-washroom-01');

  // Animation values for radar pulse & rotation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pairingStep === 'SCANNING') {
      // Pulse animation loop
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      // Rotate animation loop
      const rotateLoop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      pulseLoop.start();
      rotateLoop.start();

      return () => {
        pulseLoop.stop();
        rotateLoop.stop();
      };
    }
  }, [pairingStep]);

  // Rename handlers
  const handleOpenRename = () => {
    setRenameValue(deviceConfig?.deviceName || '');
    setShowRenameModal(true);
  };

  const handleSaveRename = () => {
    if (!renameValue.trim()) {
      Alert.alert('Error', 'Device name cannot be empty');
      return;
    }
    if (deviceConfig) {
      setDeviceConfig({ ...deviceConfig, deviceName: renameValue.trim() });
    }
    setShowRenameModal(false);
  };

  // Open Pairing Modal
  const handleOpenPairing = () => {
    setPairingStep('CHOOSE_METHOD');
    setCustomDeviceName('ESP32 Washroom SafeGuard');
    setDiscoveredDeviceId('esp32-washroom-01');
    setShowPairingModal(true);
  };

  // Start Scanning
  const startScan = (method: ConnectionType) => {
    setSelectedMethod(method);
    setPairingStep('SCANNING');
    setScanMessage(
      method === 'BLUETOOTH'
        ? 'Scanning nearby Bluetooth Low Energy (BLE) channels...'
        : 'Scanning local Wi-Fi subnet for active SafeGuard nodes...'
    );

    // Realistic scanning sequence
    setTimeout(() => {
      setScanMessage(
        method === 'BLUETOOTH'
          ? 'Found BLE advertisement from UUID 24:6F:28:B1:3C:90...'
          : 'Querying mDNS for _radiobond._tcp.local...'
      );
    }, 1200);

    setTimeout(() => {
      setScanMessage('Device located! Validating firmware handshake...');
    }, 2200);

    // Device found transition
    setTimeout(() => {
      setPairingStep('FOUND');
    }, 3000);
  };

  // Connect to discovered device
  const handleConnectDevice = () => {
    setPairingStep('CONNECTING');

    setTimeout(() => {
      if (deviceConfig) {
        setDeviceConfig({
          ...deviceConfig,
          deviceName: customDeviceName.trim() || 'ESP32 Washroom SafeGuard',
          deviceId: discoveredDeviceId.trim() || 'esp32-washroom-01',
        });
      }
      setIsSimulatorMode(false);
      setPairingStep('SUCCESS');
    }, 1800);
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

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
              <Text style={styles.modeBadge}>
                {isSimulatorMode ? '🧪 SIMULATED' : '📡 HARDWARE'}
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
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.navigate('Settings')}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Configure</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}
            onPress={handleOpenRename}
            activeOpacity={0.8}
          >
            <Text style={[styles.actionButtonText, { color: colors.textSecondary }]}>Rename</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mode notice banner */}
      {isSimulatorMode ? (
        <View style={styles.demoNotice}>
          <View style={styles.bannerHeader}>
            <Text style={styles.demoNoticeTitle}>🧪 DEMO SIMULATOR MODE</Text>
            <TouchableOpacity onPress={() => setIsSimulatorMode(false)} style={styles.switchModePill}>
              <Text style={styles.switchModePillText}>Switch to Live</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.demoNoticeText}>
            Currently displaying simulated radar telemetry. Click "+ Connect Device" below to scan and pair your physical ESP32 via Wi-Fi or Bluetooth.
          </Text>
        </View>
      ) : (
        <View style={styles.liveNotice}>
          <View style={styles.bannerHeader}>
            <Text style={styles.liveNoticeTitle}>📡 REAL ESP32 HARDWARE ACTIVE</Text>
            <TouchableOpacity onPress={() => setIsSimulatorMode(true)} style={styles.switchModePill}>
              <Text style={styles.switchModePillText}>Switch to Demo</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.liveNoticeText}>
            Live monitoring connected to hardware ID: <Text style={{fontWeight: '700'}}>{deviceConfig?.deviceId}</Text>. Subscribed to real-time mmWave radar & audio feeds.
          </Text>
        </View>
      )}

      {/* Connect / Add Device Button */}
      <TouchableOpacity
        style={styles.addDeviceButton}
        onPress={handleOpenPairing}
        activeOpacity={0.8}
      >
        <Text style={styles.addDeviceText}>+ Connect Device (Wi-Fi / Bluetooth)</Text>
      </TouchableOpacity>

      {/* Rename Modal */}
      <Modal visible={showRenameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename Device</Text>
              <TouchableOpacity onPress={() => setShowRenameModal(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Device Name</Text>
            <TextInput
              style={styles.textInput}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="e.g. Master Bathroom Guard"
              placeholderTextColor={colors.textSecondary}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setShowRenameModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.confirmBtn]}
                onPress={handleSaveRename}
              >
                <Text style={styles.confirmBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Multi-Step Pairing Modal (Wi-Fi or Bluetooth Scan & Connect) */}
      <Modal visible={showPairingModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {selectedMethod === 'BLUETOOTH' ? (
                  <Bluetooth size={22} color={colors.primary} />
                ) : (
                  <Wifi size={22} color={colors.primary} />
                )}
                <Text style={styles.modalTitle}>
                  {pairingStep === 'CHOOSE_METHOD' && 'Connect Real ESP32'}
                  {pairingStep === 'SCANNING' && 'Scanning for ESP32...'}
                  {pairingStep === 'FOUND' && 'ESP32 Discovered!'}
                  {pairingStep === 'CONNECTING' && 'Connecting...'}
                  {pairingStep === 'SUCCESS' && 'Device Connected!'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPairingModal(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* STEP 1: CHOOSE METHOD */}
            {pairingStep === 'CHOOSE_METHOD' && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepSubtitle}>
                  Choose how you would like to detect and pair your ESP32 washroom safety device:
                </Text>

                {/* Option 1: Bluetooth */}
                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={() => startScan('BLUETOOTH')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <Bluetooth size={28} color="#2563EB" />
                  </View>
                  <View style={styles.methodDetails}>
                    <View style={styles.methodTitleRow}>
                      <Text style={styles.methodTitle}>Bluetooth (BLE)</Text>
                      <View style={[styles.badgePill, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={[styles.badgeText, { color: '#1D4ED8' }]}>Fast Direct</Text>
                      </View>
                    </View>
                    <Text style={styles.methodDesc}>
                      Scan nearby Bluetooth Low Energy beacons for instant automatic pairing.
                    </Text>
                  </View>
                  <ArrowRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Option 2: Wi-Fi */}
                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={() => startScan('WIFI')}
                  activeOpacity={0.8}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <Wifi size={28} color="#059669" />
                  </View>
                  <View style={styles.methodDetails}>
                    <View style={styles.methodTitleRow}>
                      <Text style={styles.methodTitle}>Wi-Fi Network</Text>
                      <View style={[styles.badgePill, { backgroundColor: '#D1FAE5' }]}>
                        <Text style={[styles.badgeText, { color: '#047857' }]}>Local LAN</Text>
                      </View>
                    </View>
                    <Text style={styles.methodDesc}>
                      Scan your local Wi-Fi subnet for connected ESP32 radar nodes.
                    </Text>
                  </View>
                  <ArrowRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                <View style={styles.infoHint}>
                  <ShieldCheck size={16} color="#475569" />
                  <Text style={styles.infoHintText}>
                    Make sure your ESP32 board is powered on and running the Radio-Bond firmware.
                  </Text>
                </View>
              </View>
            )}

            {/* STEP 2: SCANNING */}
            {pairingStep === 'SCANNING' && (
              <View style={styles.scanningContainer}>
                <View style={styles.radarContainer}>
                  <Animated.View
                    style={[
                      styles.radarOuterRing,
                      {
                        transform: [{ scale: pulseAnim }],
                      },
                    ]}
                  />
                  <View style={styles.radarCenterCircle}>
                    {selectedMethod === 'BLUETOOTH' ? (
                      <BluetoothSearching size={36} color={colors.primary} />
                    ) : (
                      <Animated.View style={{ transform: [{ rotate: spin }] }}>
                        <RefreshCw size={36} color={colors.primary} />
                      </Animated.View>
                    )}
                  </View>
                </View>

                <Text style={styles.scanningHeadline}>
                  Searching via {selectedMethod === 'BLUETOOTH' ? 'Bluetooth LE' : 'Wi-Fi'}...
                </Text>
                <Text style={styles.scanningLog}>{scanMessage}</Text>

                <View style={styles.scanningFooter}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <TouchableOpacity
                    style={styles.cancelScanBtn}
                    onPress={() => setPairingStep('CHOOSE_METHOD')}
                  >
                    <Text style={styles.cancelScanText}>Change Method</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 3: DEVICE FOUND */}
            {pairingStep === 'FOUND' && (
              <View style={styles.stepContainer}>
                <View style={styles.foundNotice}>
                  <Zap size={18} color="#047857" />
                  <Text style={styles.foundNoticeText}>
                    1 ESP32 hardware device located and responding!
                  </Text>
                </View>

                {/* Discovered Device Card */}
                <View style={styles.discoveredCard}>
                  <View style={styles.discoveredHeader}>
                    <View style={styles.discoveredIcon}>
                      <Cpu size={26} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.discoveredTitle}>ESP32-Washroom-SafeGuard</Text>
                      <Text style={styles.discoveredId}>Hardware ID: {discoveredDeviceId}</Text>
                    </View>
                    <View style={styles.signalBadge}>
                      <Signal size={14} color="#059669" />
                      <Text style={styles.signalText}>-48 dBm</Text>
                    </View>
                  </View>

                  <View style={styles.discoveredMeta}>
                    <Text style={styles.metaLabel}>Protocol: <Text style={styles.metaVal}>{selectedMethod === 'BLUETOOTH' ? 'BLE 5.0' : 'Wi-Fi 802.11 b/g/n'}</Text></Text>
                    <Text style={styles.metaLabel}>Firmware: <Text style={styles.metaVal}>v1.0.0-esp32</Text></Text>
                  </View>

                  <View style={styles.divider} />

                  <Text style={styles.inputLabel}>Device Friendly Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customDeviceName}
                    onChangeText={setCustomDeviceName}
                    placeholder="e.g. Master Bathroom SafeGuard"
                    placeholderTextColor={colors.textSecondary}
                  />
                </View>

                <Text style={styles.promptQuestion}>
                  Would you like to pair and connect to this ESP32?
                </Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.cancelBtn]}
                    onPress={() => startScan(selectedMethod)}
                  >
                    <RefreshCw size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.cancelBtnText}>Rescan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.confirmBtn]}
                    onPress={handleConnectDevice}
                  >
                    <Check size={16} color={colors.surface} style={{ marginRight: 4 }} />
                    <Text style={styles.confirmBtnText}>Connect Device</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 4: CONNECTING HANDSHAKE */}
            {pairingStep === 'CONNECTING' && (
              <View style={styles.connectingContainer}>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.md }} />
                <Text style={styles.connectingTitle}>Connecting to ESP32...</Text>
                <View style={styles.handshakeSteps}>
                  <Text style={styles.handshakeStep}>✓ Handshake exchange initialized</Text>
                  <Text style={styles.handshakeStep}>✓ Binding device UUID to dashboard</Text>
                  <Text style={styles.handshakeStep}>⌛ Subscribing to live telemetry stream...</Text>
                </View>
              </View>
            )}

            {/* STEP 5: SUCCESS */}
            {pairingStep === 'SUCCESS' && (
              <View style={styles.successContainer}>
                <View style={styles.successIconBox}>
                  <CheckCircle size={56} color="#10B981" />
                </View>
                <Text style={styles.successTitle}>Connected Successfully!</Text>
                <Text style={styles.successSubtitle}>
                  "{customDeviceName}" is now paired and actively broadcasting radar presence and safety telemetry.
                </Text>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.confirmBtn, { width: '100%', marginTop: spacing.lg }]}
                  onPress={() => setShowPairingModal(false)}
                >
                  <Text style={styles.confirmBtnText}>Done (View Live Status)</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>
      </Modal>
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
  modeBadge: {
    ...typography.caption,
    fontSize: 10,
    backgroundColor: '#F1F5F9',
    color: '#475569',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
    marginLeft: 6,
  },
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
    cursor: 'pointer' as any,
  },
  actionButtonText: { ...typography.body2, color: colors.surface, fontWeight: '700' },
  bannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  switchModePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  switchModePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  demoNotice: {
    backgroundColor: '#FEF9C3', borderRadius: borderRadius.md, padding: spacing.md,
    marginTop: spacing.lg, borderWidth: 1, borderColor: '#FDE047',
  },
  demoNoticeTitle: { ...typography.body2, color: '#713F12', fontWeight: '700' },
  demoNoticeText: { ...typography.caption, color: '#713F12', lineHeight: 16 },
  liveNotice: {
    backgroundColor: '#DCFCE7', borderRadius: borderRadius.md, padding: spacing.md,
    marginTop: spacing.lg, borderWidth: 1, borderColor: '#86EFAC',
  },
  liveNoticeTitle: { ...typography.body2, color: '#14532D', fontWeight: '700' },
  liveNoticeText: { ...typography.caption, color: '#14532D', lineHeight: 16 },
  addDeviceButton: {
    marginTop: spacing.md, padding: spacing.md, borderRadius: borderRadius.lg,
    borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed', alignItems: 'center',
    cursor: 'pointer' as any,
  },
  addDeviceText: { ...typography.body1, color: colors.primary, fontWeight: '600' },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h3,
    fontSize: 18,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  stepContainer: {
    paddingVertical: spacing.xs,
  },
  stepSubtitle: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    cursor: 'pointer' as any,
  },
  methodIconBox: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  methodDetails: {
    flex: 1,
    marginRight: spacing.sm,
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  methodTitle: {
    ...typography.body1,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  methodDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  infoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  infoHintText: {
    ...typography.caption,
    fontSize: 11,
    color: '#475569',
    flex: 1,
  },

  // Scanning Step Styles
  scanningContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  radarContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    position: 'relative',
  },
  radarOuterRing: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: '#BAE6FD',
    backgroundColor: 'rgba(224, 242, 254, 0.4)',
  },
  radarCenterCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#38BDF8',
  },
  scanningHeadline: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  scanningLog: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  scanningFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cancelScanBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.sm,
    backgroundColor: '#F1F5F9',
  },
  cancelScanText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Found Step Styles
  foundNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  foundNoticeText: {
    ...typography.caption,
    color: '#065F46',
    fontWeight: '700',
  },
  discoveredCard: {
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  discoveredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discoveredIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.sm,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  discoveredTitle: {
    ...typography.body1,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  discoveredId: {
    ...typography.caption,
    fontFamily: 'monospace',
    color: colors.textSecondary,
  },
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  signalText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  discoveredMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  metaLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metaVal: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  promptQuestion: {
    ...typography.body2,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
    marginVertical: spacing.xs,
  },

  // Connecting Handshake Styles
  connectingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  connectingTitle: {
    ...typography.h3,
    fontSize: 17,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  handshakeSteps: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    width: '100%',
    gap: 8,
  },
  handshakeStep: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '500',
  },

  // Success Step Styles
  successContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  successIconBox: {
    marginBottom: spacing.sm,
  },
  successTitle: {
    ...typography.h3,
    fontSize: 20,
    color: '#065F46',
    fontWeight: '700',
    marginBottom: 4,
  },
  successSubtitle: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },

  // General Modal Styles
  inputLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalBtn: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
    cursor: 'pointer' as any,
  },
  cancelBtn: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtnText: {
    ...typography.body2,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: colors.primary,
  },
  confirmBtnText: {
    ...typography.body2,
    color: colors.surface,
    fontWeight: '700',
  },
});
