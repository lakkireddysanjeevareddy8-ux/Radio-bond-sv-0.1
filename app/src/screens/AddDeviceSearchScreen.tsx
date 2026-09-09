import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import {
  ArrowLeft,
  Search,
  Settings,
  X,
  Check,
  RefreshCw,
  AlertTriangle,
  Layers,
} from 'lucide-react-native';
import { colors, spacing } from '../utils/theme';
import { BluetoothService, DiscoveredBleDevice } from '../services/bluetoothService';
import { ProductCatalogService } from '../services/productCatalog';
import { useDeviceStore } from '../store/useDeviceStore';
import { useAppStore } from '../store/useAppStore';

interface AddDeviceSearchScreenProps {
  onBack: () => void;
  onDeviceConnected: (deviceName: string, deviceId: string) => void;
  onBluetoothOff: () => void;
}

export const AddDeviceSearchScreen: React.FC<AddDeviceSearchScreenProps> = ({
  onBack,
  onDeviceConnected,
  onBluetoothOff,
}) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 600;
  const isCompactMobile = height < 700;

  const { addOrUpdateDevice, setActiveDeviceId } = useDeviceStore();
  const { deviceConfig, setDeviceConfig, setTelemetry, setIsOnline, setIsSimulatorMode } = useAppStore();

  const [isSearching, setIsSearching] = useState<boolean>(true);
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredBleDevice[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingDeviceName, setConnectingDeviceName] = useState<string>('');

  // Manual Add Modal state
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualName, setManualName] = useState<string>('Washroom SafeGuard WSG-01');
  const [manualId, setManualId] = useState<string>('esp32-wsg-01');
  const [manualRoom, setManualRoom] = useState<string>('Master Washroom');

  // Radar sweep animation
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Rotation loop for the search radar sweep
    const rotateLoop = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Subtle breathing pulse for the search logo center
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    rotateLoop.start();
    pulseLoop.start();

    return () => {
      rotateLoop.stop();
      pulseLoop.stop();
    };
  }, []);

  const spinInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Perform genuine device discovery
  const runRealDiscovery = async () => {
    setIsSearching(true);
    setErrorMessage('');

    // Check Bluetooth state
    const isBtAvailable = await BluetoothService.isBluetoothAvailable();
    if (!isBtAvailable) {
      setIsSearching(false);
      onBluetoothOff();
      return;
    }

    try {
      const defaultProduct = ProductCatalogService.getAllProducts()[0];
      const discovered = await BluetoothService.scanForProduct(defaultProduct);
      if (discovered) {
        setDiscoveredDevices([discovered]);
        setIsSearching(false);
      }
    } catch (err: any) {
      setIsSearching(false);
      const msg = String(err.message || '').toLowerCase();
      if (msg === 'bluetooth_disabled' || msg.includes('disabled') || msg.includes('adapter')) {
        onBluetoothOff();
        return;
      }
      if (msg === 'no_device_chosen' || err.name === 'NotFoundError') {
        setErrorMessage('Device chooser was cancelled. Make sure your gadget is powered on.');
      } else {
        setErrorMessage(err.message || 'Scanning encountered an issue.');
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      runRealDiscovery();
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Real connection to a selected device (Strict verification, no fake connection)
  const handleConnectDevice = async (device: DiscoveredBleDevice) => {
    setIsConnecting(true);
    setConnectingDeviceName(device.name);
    setErrorMessage('');

    try {
      await BluetoothService.connectGatt(device);

      const finalName = device.name || 'Washroom Safety Gadget';
      const finalId = device.id;

      addOrUpdateDevice({
        deviceId: finalId,
        name: finalName,
        model: device.product?.model || 'WSG-01',
        room: 'Master Washroom',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        firmwareVersion: 'v1.0.0-esp32',
        sensor: 'LD2410C 24GHz mmWave',
        connectionType: 'BLE',
      });
      setActiveDeviceId(finalId);

      if (deviceConfig) {
        setDeviceConfig({
          ...deviceConfig,
          deviceName: finalName,
          deviceId: finalId,
        });
      }
      setIsSimulatorMode(false);
      setIsOnline(true);
      setTelemetry({
        deviceId: finalId,
        timestamp: new Date().toISOString(),
        presence: true,
        movement: true,
        stillnessSeconds: 0,
        state: 'IDLE',
        voiceDetected: false,
        wifiRSSI: -48,
        uptime: 60,
        firmwareVersion: 'v1.0.0-esp32',
      });

      setIsConnecting(false);
      onDeviceConnected(finalName, finalId);
    } catch (err: any) {
      console.error('Real GATT connection failed:', err);
      setIsConnecting(false);
      setErrorMessage(`Real Hardware Connection Failed: ${err.message || 'GATT Handshake refused'}. Verify the device is powered on and in range.`);
    }
  };

  // Manual connection handler
  const handleConnectManual = () => {
    if (!manualName.trim() || !manualId.trim()) {
      Alert.alert('Required Fields', 'Please enter a device name and hardware UUID/IP.');
      return;
    }

    addOrUpdateDevice({
      deviceId: manualId.trim(),
      name: manualName.trim(),
      model: 'WSG-01',
      room: manualRoom.trim() || 'Washroom',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      firmwareVersion: 'v1.0.0-esp32',
      sensor: 'LD2410C',
      connectionType: 'BLE',
    });
    setActiveDeviceId(manualId.trim());

    if (deviceConfig) {
      setDeviceConfig({
        ...deviceConfig,
        deviceName: manualName.trim(),
        deviceId: manualId.trim(),
      });
    }
    setIsSimulatorMode(false);
    setIsOnline(true);

    setShowManualModal(false);
    onDeviceConnected(manualName.trim(), manualId.trim());
  };

  const radarSize = isCompactMobile ? 180 : isTablet ? 230 : 210;
  const darkDiscSize = isCompactMobile ? 84 : isTablet ? 104 : 96;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: Math.max(insets.bottom, 16),
        },
      ]}
    >
      {/* Top Header */}
      <View style={[styles.headerBar, { maxWidth: isTablet ? 640 : '100%', alignSelf: 'center', width: '100%' }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add new device</Text>
        <View style={{ width: 40 }} />
      </View>

      {isConnecting ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0F172A" style={{ marginBottom: 20 }} />
          <Text style={styles.searchingTitle}>Connecting...</Text>
          <Text style={styles.searchingSubtitle}>
            Establishing real GATT connection with "{connectingDeviceName}"
          </Text>
        </View>
      ) : isSearching ? (
        /* Searching State matching Screenshot 5 (Mobile & Tablet optimized) */
        <View style={[styles.centerContainer, { maxWidth: isTablet ? 540 : '100%', alignSelf: 'center', width: '100%' }]}>
          {/* Radar Sweep Container with dark center search logo */}
          <View
            style={[
              styles.radarWrapper,
              {
                width: radarSize,
                height: radarSize,
                marginBottom: isCompactMobile ? 28 : 44,
              },
            ]}
          >
            {/* Animated rotating conical / radial sweep */}
            <Animated.View
              style={[
                styles.radarSweepCircle,
                {
                  width: radarSize,
                  height: radarSize,
                  borderRadius: radarSize / 2,
                  transform: [{ rotate: spinInterpolation }],
                },
              ]}
            >
              <Svg width={radarSize} height={radarSize} viewBox="0 0 210 210">
                <Defs>
                  <LinearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor="#94A3B8" stopOpacity="0.8" />
                    <Stop offset="40%" stopColor="#CBD5E1" stopOpacity="0.45" />
                    <Stop offset="80%" stopColor="#E2E8F0" stopOpacity="0.15" />
                    <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0.02" />
                  </LinearGradient>
                </Defs>
                <Circle cx="105" cy="105" r="100" fill="url(#sweepGrad)" />
                <Path
                  d="M105 105 L105 5 A100 100 0 0 1 205 105 Z"
                  fill="#94A3B8"
                  opacity="0.35"
                />
              </Svg>
            </Animated.View>

            {/* Dark Search Logo Center Disc */}
            <Animated.View
              style={[
                styles.darkSearchDisc,
                {
                  width: darkDiscSize,
                  height: darkDiscSize,
                  borderRadius: darkDiscSize / 2,
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <Search size={isCompactMobile ? 32 : 36} color="#FFFFFF" strokeWidth={2.4} />
            </Animated.View>
          </View>

          {/* Titles matching Screenshot 5 */}
          <Text style={[styles.searchingTitle, isCompactMobile && { fontSize: 24, marginBottom: 8 }]}>
            Searching...
          </Text>
          <Text style={[styles.searchingSubtitle, isCompactMobile && { fontSize: 14, marginBottom: 16 }]}>
            Make sure your washroom safety gadget is in pairing mode
          </Text>

          {errorMessage ? (
            <View style={styles.warningBox}>
              <AlertTriangle size={16} color="#DC2626" style={{ marginRight: 6 }} />
              <Text style={styles.warningText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Bottom "Add manually" pill button */}
          <View
            style={[
              styles.bottomPillContainer,
              { bottom: Math.max(insets.bottom + 16, 24) },
            ]}
          >
            <TouchableOpacity
              style={[styles.addManuallyButton, { maxWidth: isTablet ? 400 : 340 }]}
              onPress={() => setShowManualModal(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.addManuallyText}>Add manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Discovered Devices View matching Screenshot 4 (Mobile & Tablet optimized) */
        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={[
            styles.listContent,
            { maxWidth: isTablet ? 640 : '100%', alignSelf: 'center', width: '100%' },
          ]}
        >
          {/* Bluetooth Active Banner */}
          <View style={styles.bluetoothStatusCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.statusOnText}>On</Text>
              <View style={styles.statusTogglePill}>
                <View style={styles.statusToggleKnob} />
              </View>
            </View>
          </View>

          <Text style={styles.statusExplainer}>
            Make sure the device you want to connect to is in pairing mode. Your mobile/tablet is currently visible to nearby devices.
          </Text>

          {/* Paired / Discovered Devices Section Header */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeaderTitle}>Available &amp; Paired devices</Text>
            <TouchableOpacity onPress={runRealDiscovery} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RefreshCw size={14} color="#64748B" style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>Scan</Text>
            </TouchableOpacity>
          </View>

          {/* Devices List */}
          {discoveredDevices.length > 0 ? (
            <View style={styles.devicesCardList}>
              {discoveredDevices.map((dev, idx) => (
                <TouchableOpacity
                  key={dev.id || idx}
                  style={styles.deviceListItem}
                  onPress={() => handleConnectDevice(dev)}
                  activeOpacity={0.75}
                >
                  <View style={styles.deviceListIconBox}>
                    <Layers size={22} color="#0F172A" />
                  </View>
                  <View style={styles.deviceListInfo}>
                    <Text style={styles.deviceListItemTitle}>{dev.name}</Text>
                    <Text style={styles.deviceListItemSub}>
                      {dev.product?.model || 'WSG-01'} • Bluetooth GATT
                    </Text>
                  </View>
                  <View style={styles.deviceGearBtn}>
                    <Settings size={20} color="#64748B" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.noDevicesCard}>
              <AlertTriangle size={32} color="#94A3B8" style={{ marginBottom: 12 }} />
              <Text style={styles.noDevicesTitle}>No devices found yet</Text>
              <Text style={styles.noDevicesSub}>
                Ensure your washroom safety gadget or ESP32 board is powered on and within Bluetooth range.
              </Text>
              <TouchableOpacity
                style={[styles.addManuallyButton, { marginTop: 20 }]}
                onPress={runRealDiscovery}
              >
                <Text style={styles.addManuallyText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Add Manually Option */}
          <TouchableOpacity
            style={[styles.addManuallyButton, { marginTop: 28, width: '100%' }]}
            onPress={() => setShowManualModal(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.addManuallyText}>Add manually by UUID</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Manual Setup Modal */}
      <Modal visible={showManualModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { maxWidth: isTablet ? 500 : '100%', alignSelf: 'center', width: '100%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Device Manually</Text>
              <TouchableOpacity onPress={() => setShowManualModal(false)}>
                <X size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Device Name</Text>
            <TextInput
              style={styles.textInput}
              value={manualName}
              onChangeText={setManualName}
              placeholder="e.g. Washroom SafeGuard WSG-01"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.inputLabel}>Device UUID / Serial</Text>
            <TextInput
              style={styles.textInput}
              value={manualId}
              onChangeText={setManualId}
              placeholder="e.g. esp32-wsg-01"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Room Assignment</Text>
            <TextInput
              style={styles.textInput}
              value={manualRoom}
              onChangeText={setManualRoom}
              placeholder="e.g. Master Washroom"
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setShowManualModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirmBtn]}
                onPress={handleConnectManual}
              >
                <Check size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalConfirmText}>Save &amp; Connect</Text>
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
    backgroundColor: '#FFFFFF',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  radarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarSweepCircle: {
    position: 'absolute',
  },
  darkSearchDisc: {
    backgroundColor: '#1E232B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  searchingTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  searchingSubtitle: {
    fontSize: 15,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
    marginBottom: 20,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
    maxWidth: 340,
  },
  warningText: {
    fontSize: 13,
    color: '#B91C1C',
    flex: 1,
  },
  bottomPillContainer: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  addManuallyButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderColor: '#94A3B8',
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addManuallyText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },

  // Screenshot 4 layout styles
  listContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  listContent: {
    padding: 20,
  },
  bluetoothStatusCard: {
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 14,
  },
  statusOnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2563EB',
  },
  statusTogglePill: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: 3,
  },
  statusToggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  statusExplainer: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  devicesCardList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  deviceListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  deviceListIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  deviceListInfo: {
    flex: 1,
  },
  deviceListItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  deviceListItemSub: {
    fontSize: 12,
    color: '#64748B',
  },
  deviceGearBtn: {
    padding: 8,
  },
  noDevicesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  noDevicesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
  },
  noDevicesSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 16,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  modalConfirmBtn: {
    backgroundColor: '#0F172A',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
