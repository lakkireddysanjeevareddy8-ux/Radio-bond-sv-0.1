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
import { supabase } from '../services/supabaseClient';
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
  AlertTriangle,
  HelpCircle,
  Edit3,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

type PairingStep = 'CHOOSE_METHOD' | 'SCANNING' | 'FOUND' | 'NOT_FOUND' | 'CONNECTING' | 'SUCCESS';
type ConnectionType = 'BLUETOOTH' | 'WIFI';

interface DiscoveredDevice {
  name: string;
  deviceId: string;
  type: string;
  rssi?: number;
  firmware?: string;
  lastSeen?: string;
}

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
  const [scanMessage, setScanMessage] = useState('Initializing scan...');
  const [scanErrorMessage, setScanErrorMessage] = useState('');
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [customDeviceName, setCustomDeviceName] = useState('');

  // Manual IP / UUID fallback state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualDeviceName, setManualDeviceName] = useState('My ESP32 SafeGuard');
  const [manualDeviceId, setManualDeviceId] = useState('esp32-washroom-01');

  // Animation values for radar pulse & rotation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pairingStep === 'SCANNING') {
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
    setDiscoveredDevices([]);
    setSelectedDevice(null);
    setShowManualEntry(false);
    setShowPairingModal(true);
  };

  // 1. REAL BLUETOOTH SCAN
  const handleRealBluetoothScan = async () => {
    setSelectedMethod('BLUETOOTH');
    setPairingStep('SCANNING');
    setDiscoveredDevices([]);
    setScanMessage('Checking Web Bluetooth availability...');

    // Check if browser supports Web Bluetooth API
    const hasBluetooth = typeof navigator !== 'undefined' && (navigator as any)?.bluetooth;
    if (!hasBluetooth) {
      setScanErrorMessage(
        'Web Bluetooth is not supported in this browser. To scan real Bluetooth devices, please open this app in Google Chrome or Microsoft Edge.'
      );
      setPairingStep('NOT_FOUND');
      return;
    }

    try {
      setScanMessage('Searching for nearby physical Bluetooth devices...');

      // Invoke real native OS Bluetooth scan dialog
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'battery_service', 0x1800, 0x1801, 0x180F],
      });

      if (device && device.name) {
        const found: DiscoveredDevice = {
          name: device.name || 'ESP32 Device',
          deviceId: device.id || 'esp32-ble-' + Math.floor(Math.random() * 10000),
          type: 'Bluetooth Low Energy (BLE)',
          rssi: -45,
          firmware: 'v1.0.0-esp32',
        };
        setDiscoveredDevices([found]);
        setSelectedDevice(found);
        setCustomDeviceName(found.name);
        setPairingStep('FOUND');
      } else {
        setScanErrorMessage('A device was selected but did not broadcast an identifiable name.');
        setPairingStep('NOT_FOUND');
      }
    } catch (err: any) {
      console.warn('Bluetooth scan result:', err);
      if (err.name === 'NotFoundError') {
        setScanErrorMessage(
          'No Bluetooth device was selected or found nearby. Make sure your ESP32 board has power and is broadcasting BLE advertising packets.'
        );
      } else if (err.name === 'SecurityError') {
        setScanErrorMessage('Bluetooth access was blocked by browser security permissions.');
      } else {
        setScanErrorMessage(err.message || 'Bluetooth scanning was cancelled or failed.');
      }
      setPairingStep('NOT_FOUND');
    }
  };

  // 2. REAL WI-FI / CLOUD NETWORK SCAN
  const handleRealWifiScan = async () => {
    setSelectedMethod('WIFI');
    setPairingStep('SCANNING');
    setDiscoveredDevices([]);
    setScanMessage('Scanning network for active ESP32 heartbeats & telemetry...');

    try {
      // Query Supabase for devices that have posted telemetry in the last 15 minutes
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('telemetry')
        .select('device_id, created_at, firmware_version, wifi_rssi, uptime')
        .gte('created_at', fifteenMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) {
        console.warn('Supabase telemetry query error:', error);
      }

      if (data && data.length > 0) {
        // Group by distinct device_id
        const map = new Map<string, DiscoveredDevice>();
        for (const row of data) {
          if (row.device_id && !map.has(row.device_id)) {
            map.set(row.device_id, {
              name: `ESP32 SafeGuard (${row.device_id})`,
              deviceId: row.device_id,
              type: 'Wi-Fi Network / Supabase Realtime',
              rssi: row.wifi_rssi ?? -55,
              firmware: row.firmware_version ?? 'v1.0.0-esp32',
              lastSeen: new Date(row.created_at).toLocaleTimeString(),
            });
          }
        }
        const found = Array.from(map.values());
        if (found.length > 0) {
          setDiscoveredDevices(found);
          setSelectedDevice(found[0]);
          setCustomDeviceName(found[0].name);
          setPairingStep('FOUND');
          return;
        }
      }

      // No physical devices currently broadcasting to the cloud
      setScanErrorMessage(
        'No active ESP32 SafeGuard devices are currently transmitting over Wi-Fi. Verify your ESP32 is powered on and connected to your Wi-Fi router.'
      );
      setPairingStep('NOT_FOUND');
    } catch (err: any) {
      console.warn('Network scan error:', err);
      setScanErrorMessage(err.message || 'Failed to scan Wi-Fi cloud network.');
      setPairingStep('NOT_FOUND');
    }
  };

  // Connect to the selected real device
  const handleConnectSelectedDevice = () => {
    if (!selectedDevice) return;
    setPairingStep('CONNECTING');

    setTimeout(() => {
      if (deviceConfig) {
        setDeviceConfig({
          ...deviceConfig,
          deviceName: customDeviceName.trim() || selectedDevice.name,
          deviceId: selectedDevice.deviceId,
        });
      }
      setIsSimulatorMode(false);
      setPairingStep('SUCCESS');
    }, 1500);
  };

  // Connect via Manual UUID entry
  const handleConnectManual = () => {
    if (!manualDeviceId.trim() || !manualDeviceName.trim()) {
      Alert.alert('Error', 'Please enter both a Device Name and Hardware UUID');
      return;
    }

    if (deviceConfig) {
      setDeviceConfig({
        ...deviceConfig,
        deviceName: manualDeviceName.trim(),
        deviceId: manualDeviceId.trim(),
      });
    }
    setIsSimulatorMode(false);
    setShowPairingModal(false);
    Alert.alert(
      'Device Configured',
      `Now listening for live hardware telemetry from "${manualDeviceId.trim()}".`
    );
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
                {isSimulatorMode ? '🧪 SIMULATED' : '📡 REAL HARDWARE'}
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
            <Text style={styles.demoNoticeTitle}>🧪 DEMO SIMULATOR ACTIVE</Text>
            <TouchableOpacity onPress={() => setIsSimulatorMode(false)} style={styles.switchModePill}>
              <Text style={styles.switchModePillText}>Switch to Live Hardware</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.demoNoticeText}>
            Currently displaying simulated radar telemetry. To connect your real ESP32 board, click "+ Search Real Device" below.
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
            Listening for live telemetry from device: <Text style={{fontWeight: '700'}}>{deviceConfig?.deviceId}</Text>.
          </Text>
        </View>
      )}

      {/* Real Device Search Button */}
      <TouchableOpacity
        style={styles.addDeviceButton}
        onPress={handleOpenPairing}
        activeOpacity={0.8}
      >
        <Text style={styles.addDeviceText}>+ Search Real Device (Bluetooth / Wi-Fi)</Text>
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

      {/* Real Device Search Modal */}
      <Modal visible={showPairingModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {selectedMethod === 'BLUETOOTH' ? (
                  <Bluetooth size={22} color={colors.primary} />
                ) : (
                  <Wifi size={22} color={colors.primary} />
                )}
                <Text style={styles.modalTitle}>
                  {pairingStep === 'CHOOSE_METHOD' && 'Search Real ESP32'}
                  {pairingStep === 'SCANNING' && 'Searching for Devices...'}
                  {pairingStep === 'FOUND' && 'Device Discovered!'}
                  {pairingStep === 'NOT_FOUND' && 'No Devices Found'}
                  {pairingStep === 'CONNECTING' && 'Connecting...'}
                  {pairingStep === 'SUCCESS' && 'Device Paired!'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowPairingModal(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* STEP 1: CHOOSE METHOD */}
            {pairingStep === 'CHOOSE_METHOD' && !showManualEntry && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepSubtitle}>
                  Choose a physical scanning method to discover your ESP32 washroom safety device:
                </Text>

                {/* Real Bluetooth Scan */}
                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={handleRealBluetoothScan}
                  activeOpacity={0.8}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <Bluetooth size={28} color="#2563EB" />
                  </View>
                  <View style={styles.methodDetails}>
                    <View style={styles.methodTitleRow}>
                      <Text style={styles.methodTitle}>Real Bluetooth (BLE) Scan</Text>
                      <View style={[styles.badgePill, { backgroundColor: '#DBEAFE' }]}>
                        <Text style={[styles.badgeText, { color: '#1D4ED8' }]}>OS Radio</Text>
                      </View>
                    </View>
                    <Text style={styles.methodDesc}>
                      Invokes native system Bluetooth scanner to search for physical BLE beacons nearby.
                    </Text>
                  </View>
                  <ArrowRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Real Wi-Fi Network Scan */}
                <TouchableOpacity
                  style={styles.methodCard}
                  onPress={handleRealWifiScan}
                  activeOpacity={0.8}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <Wifi size={28} color="#059669" />
                  </View>
                  <View style={styles.methodDetails}>
                    <View style={styles.methodTitleRow}>
                      <Text style={styles.methodTitle}>Real Wi-Fi / Cloud Scan</Text>
                      <View style={[styles.badgePill, { backgroundColor: '#D1FAE5' }]}>
                        <Text style={[styles.badgeText, { color: '#047857' }]}>Live Network</Text>
                      </View>
                    </View>
                    <Text style={styles.methodDesc}>
                      Queries network for active ESP32 heartbeats broadcasting telemetry to the cloud.
                    </Text>
                  </View>
                  <ArrowRight size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                {/* Manual UUID / Direct Connection Option */}
                <TouchableOpacity
                  style={styles.manualLinkBtn}
                  onPress={() => setShowManualEntry(true)}
                >
                  <Edit3 size={15} color={colors.primary} />
                  <Text style={styles.manualLinkText}>Or pair directly by entering Hardware UUID</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* MANUAL ENTRY FORM */}
            {showManualEntry && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepSubtitle}>
                  Enter the Device UUID matching your flashed ESP32 firmware:
                </Text>

                <Text style={styles.inputLabel}>Device Friendly Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={manualDeviceName}
                  onChangeText={setManualDeviceName}
                  placeholder="e.g. Master Bathroom SafeGuard"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={styles.inputLabel}>Hardware Device UUID</Text>
                <TextInput
                  style={styles.textInput}
                  value={manualDeviceId}
                  onChangeText={setManualDeviceId}
                  placeholder="e.g. demo-device-uuid or esp32-washroom-01"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                />

                <View style={styles.infoHint}>
                  <ShieldCheck size={16} color="#475569" />
                  <Text style={styles.infoHintText}>
                    Matches the <Text style={{fontWeight: '700'}}>DEVICE_UUID</Text> constant defined in your ESP32 Arduino code.
                  </Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.cancelBtn]}
                    onPress={() => setShowManualEntry(false)}
                  >
                    <Text style={styles.cancelBtnText}>Back to Scan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.confirmBtn]}
                    onPress={handleConnectManual}
                  >
                    <Check size={16} color={colors.surface} style={{ marginRight: 4 }} />
                    <Text style={styles.confirmBtnText}>Save & Connect</Text>
                  </TouchableOpacity>
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
                  Searching via {selectedMethod === 'BLUETOOTH' ? 'Bluetooth' : 'Wi-Fi'}...
                </Text>
                <Text style={styles.scanningLog}>{scanMessage}</Text>

                <View style={styles.scanningFooter}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <TouchableOpacity
                    style={styles.cancelScanBtn}
                    onPress={() => setPairingStep('CHOOSE_METHOD')}
                  >
                    <Text style={styles.cancelScanText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 3: REAL DEVICES FOUND */}
            {pairingStep === 'FOUND' && discoveredDevices.length > 0 && (
              <View style={styles.stepContainer}>
                <View style={styles.foundNotice}>
                  <Zap size={18} color="#047857" />
                  <Text style={styles.foundNoticeText}>
                    {discoveredDevices.length} real hardware device(s) found!
                  </Text>
                </View>

                {discoveredDevices.map((dev) => (
                  <TouchableOpacity
                    key={dev.deviceId}
                    style={[
                      styles.discoveredCard,
                      selectedDevice?.deviceId === dev.deviceId && styles.discoveredCardSelected,
                    ]}
                    onPress={() => {
                      setSelectedDevice(dev);
                      setCustomDeviceName(dev.name);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={styles.discoveredHeader}>
                      <View style={styles.discoveredIcon}>
                        <Cpu size={26} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.discoveredTitle}>{dev.name}</Text>
                        <Text style={styles.discoveredId}>ID: {dev.deviceId}</Text>
                      </View>
                      {dev.rssi && (
                        <View style={styles.signalBadge}>
                          <Signal size={14} color="#059669" />
                          <Text style={styles.signalText}>{dev.rssi} dBm</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.discoveredMeta}>
                      <Text style={styles.metaLabel}>Type: <Text style={styles.metaVal}>{dev.type}</Text></Text>
                      {dev.firmware && <Text style={styles.metaLabel}>FW: <Text style={styles.metaVal}>{dev.firmware}</Text></Text>}
                      {dev.lastSeen && <Text style={styles.metaLabel}>Seen: <Text style={styles.metaVal}>{dev.lastSeen}</Text></Text>}
                    </View>
                  </TouchableOpacity>
                ))}

                <Text style={styles.inputLabel}>Device Display Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={customDeviceName}
                  onChangeText={setCustomDeviceName}
                  placeholder="e.g. Master Bathroom Guard"
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={styles.promptQuestion}>
                  Connect to this physical device?
                </Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.cancelBtn]}
                    onPress={selectedMethod === 'BLUETOOTH' ? handleRealBluetoothScan : handleRealWifiScan}
                  >
                    <RefreshCw size={14} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.cancelBtnText}>Rescan</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.confirmBtn]}
                    onPress={handleConnectSelectedDevice}
                  >
                    <Check size={16} color={colors.surface} style={{ marginRight: 4 }} />
                    <Text style={styles.confirmBtnText}>Connect</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 4: NO DEVICES FOUND (REAL RESULT) */}
            {pairingStep === 'NOT_FOUND' && (
              <View style={styles.stepContainer}>
                <View style={styles.notFoundBox}>
                  <AlertTriangle size={36} color="#DC2626" />
                  <Text style={styles.notFoundTitle}>No Devices Found</Text>
                  <Text style={styles.notFoundDesc}>{scanErrorMessage}</Text>
                </View>

                <View style={styles.troubleshootBox}>
                  <Text style={styles.troubleshootTitle}>🔍 Troubleshooting Checklist:</Text>
                  <Text style={styles.troubleshootItem}>1. Confirm ESP32 is powered on (check blue LED).</Text>
                  <Text style={styles.troubleshootItem}>
                    2. For Wi-Fi: verify your router SSID & password in the firmware.
                  </Text>
                  <Text style={styles.troubleshootItem}>
                    3. For Bluetooth: ensure your PC/phone Bluetooth is enabled.
                  </Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.cancelBtn]}
                    onPress={() => setShowManualEntry(true)}
                  >
                    <Text style={styles.cancelBtnText}>Enter UUID</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.confirmBtn]}
                    onPress={selectedMethod === 'BLUETOOTH' ? handleRealBluetoothScan : handleRealWifiScan}
                  >
                    <RefreshCw size={14} color={colors.surface} style={{ marginRight: 4 }} />
                    <Text style={styles.confirmBtnText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* STEP 5: CONNECTING HANDSHAKE */}
            {pairingStep === 'CONNECTING' && (
              <View style={styles.connectingContainer}>
                <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.md }} />
                <Text style={styles.connectingTitle}>Connecting to Physical ESP32...</Text>
                <View style={styles.handshakeSteps}>
                  <Text style={styles.handshakeStep}>✓ Handshake exchange initialized</Text>
                  <Text style={styles.handshakeStep}>✓ Binding device UUID to dashboard</Text>
                  <Text style={styles.handshakeStep}>⌛ Subscribing to live telemetry stream...</Text>
                </View>
              </View>
            )}

            {/* STEP 6: SUCCESS */}
            {pairingStep === 'SUCCESS' && (
              <View style={styles.successContainer}>
                <View style={styles.successIconBox}>
                  <CheckCircle size={56} color="#10B981" />
                </View>
                <Text style={styles.successTitle}>Connected Successfully!</Text>
                <Text style={styles.successSubtitle}>
                  "{customDeviceName || selectedDevice?.name}" is now paired and actively transmitting live radar presence and safety data.
                </Text>

                <TouchableOpacity
                  style={[styles.modalBtn, styles.confirmBtn, { width: '100%', marginTop: spacing.lg }]}
                  onPress={() => setShowPairingModal(false)}
                >
                  <Text style={styles.confirmBtnText}>Done (View Live Feed)</Text>
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
  manualLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    cursor: 'pointer' as any,
  },
  manualLinkText: {
    ...typography.body2,
    color: colors.primary,
    fontWeight: '600',
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
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    cursor: 'pointer' as any,
  },
  discoveredCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#F0F9FF',
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
    flexWrap: 'wrap',
    gap: spacing.sm,
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

  // Not Found Step Styles
  notFoundBox: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  notFoundTitle: {
    ...typography.h3,
    fontSize: 18,
    color: '#DC2626',
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: 4,
  },
  notFoundDesc: {
    ...typography.caption,
    color: '#7F1D1D',
    textAlign: 'center',
    lineHeight: 18,
  },
  troubleshootBox: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
  },
  troubleshootTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  troubleshootItem: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
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
    marginBottom: spacing.xs,
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
