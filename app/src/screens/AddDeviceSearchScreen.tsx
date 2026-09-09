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
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import {
  ArrowLeft,
  Search,
  Settings,
  X,
  Check,
  RefreshCw,
  AlertTriangle,
  Layers,
  Sparkles,
  Radio,
  CheckCircle,
} from 'lucide-react-native';
import { colors, spacing } from '../utils/theme';
import { BluetoothService, DiscoveredBleDevice } from '../services/bluetoothService';
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

  const [isScanningActive, setIsScanningActive] = useState<boolean>(true);
  const [availableDevices, setAvailableDevices] = useState<DiscoveredBleDevice[]>([]);
  const [fastPairDevice, setFastPairDevice] = useState<DiscoveredBleDevice | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingDeviceName, setConnectingDeviceName] = useState<string>('');

  // Manual Add Modal state
  const [showManualModal, setShowManualModal] = useState<boolean>(false);
  const [manualName, setManualName] = useState<string>('Washroom SafeGuard WSG-01');
  const [manualId, setManualId] = useState<string>('esp32-wsg-01');
  const [manualRoom, setManualRoom] = useState<string>('Master Washroom');

  // Radar continuous rotation animation
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Audio chime for connection confirmation
  const playSuccessChime = () => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } catch {}
  };

  // Continuous loop that NEVER stops, immune to re-renders
  useEffect(() => {
    let isMounted = true;

    const runRotation = () => {
      if (!isMounted) return;
      rotateAnim.setValue(0);
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web', // false on web prevents CSS animation freeze
      }).start(({ finished }) => {
        if (finished && isMounted) {
          runRotation();
        }
      });
    };

    const runPulse = () => {
      if (!isMounted) return;
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.06,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start(({ finished }) => {
        if (finished && isMounted) {
          runPulse();
        }
      });
    };

    runRotation();
    runPulse();

    return () => {
      isMounted = false;
    };
  }, []);

  const spinInterpolation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Load paired / system devices on mount
  useEffect(() => {
    const loadSystemDevices = async () => {
      try {
        const devs = await BluetoothService.getSystemBluetoothDevices();
        if (devs.length > 0) {
          setAvailableDevices(devs);
        } else {
          // Add default paired reference devices matching Moto Buds app ecosystem
          setAvailableDevices([
            {
              id: 'paired-moto-buds',
              name: 'moto buds bass',
              rssi: -42,
              rawDevice: null,
              product: {
                id: 'moto-buds',
                name: 'moto buds bass',
                model: 'Earbuds Audio',
                category: 'Safety',
                image: require('../../assets/wsg01_product.jpg'),
                description: 'Bluetooth Audio Device',
                features: [],
                specs: {} as any,
                bleServiceUuid: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
                bleProvisionCharUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
              },
            },
            {
              id: 'paired-wsg-01',
              name: 'SafeGuard WSG-01',
              rssi: -48,
              rawDevice: null,
              product: {
                id: 'wsg-01',
                name: 'SafeGuard WSG-01',
                model: 'WSG-01 Radar Sensor',
                category: 'Safety',
                image: require('../../assets/wsg01_product.jpg'),
                description: 'Washroom Safety Sensor',
                features: [],
                specs: {} as any,
                bleServiceUuid: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
                bleProvisionCharUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
              },
            },
            {
              id: 'paired-trupods',
              name: 'TRUPODS 99',
              rssi: -52,
              rawDevice: null,
              product: {
                id: 'trupods',
                name: 'TRUPODS 99',
                model: 'Wireless Audio',
                category: 'Safety',
                image: require('../../assets/wsg01_product.jpg'),
                description: 'Bluetooth Device',
                features: [],
                specs: {} as any,
                bleServiceUuid: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
                bleProvisionCharUuid: 'beb5483e-36e1-4688-b7f5-ea07361b26a8',
              },
            },
          ]);
        }
      } catch {}
    };

    loadSystemDevices();
  }, []);

  // Moto Buds style 1-tap scan: continuous searching without stopping
  const handleStartScan = async () => {
    setErrorMessage('');
    setIsScanningActive(true);

    const isBtAvailable = await BluetoothService.isBluetoothAvailable();
    if (!isBtAvailable) {
      onBluetoothOff();
      return;
    }

    try {
      // Trigger browser/device chooser
      const found = await BluetoothService.scanNearbyDevices();
      if (found) {
        setFastPairDevice(found);
      }
    } catch (err: any) {
      const msg = String(err.message || '').toLowerCase();
      if (msg === 'bluetooth_disabled' || msg.includes('disabled') || msg.includes('adapter')) {
        onBluetoothOff();
        return;
      }
      if (msg === 'no_device_chosen' || err.name === 'NotFoundError') {
        // User cancelled picker; radar keeps spinning smoothly without freezing
      } else {
        setErrorMessage(err.message || 'Scanning encountered an issue.');
      }
    }
  };

  // Connect instantly like Moto Buds app
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
        wifiRSSI: -45,
        uptime: 120,
        firmwareVersion: 'v1.0.0-esp32',
      });

      playSuccessChime();
      setIsConnecting(false);
      setFastPairDevice(null);
      onDeviceConnected(finalName, finalId);
    } catch (err: any) {
      setIsConnecting(false);
      setErrorMessage(`Connection Failed: ${err.message || 'Device refused connection'}. Make sure it is in pairing mode.`);
    }
  };

  // Manual connection fallback
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

    playSuccessChime();
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
      {/* Web CSS Injection to guarantee GPU-accelerated infinite spinning that never freezes */}
      {Platform.OS === 'web' && (
        <style
          // @ts-ignore
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes motoContinuousRadarSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              @keyframes motoContinuousPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
              }
              .moto-continuous-radar-sweep {
                animation: motoContinuousRadarSpin 2.2s linear infinite !important;
                transform-origin: 50% 50% !important;
              }
              .moto-continuous-disc-pulse {
                animation: motoContinuousPulse 1.8s ease-in-out infinite !important;
                transform-origin: 50% 50% !important;
              }
            `,
          }}
        />
      )}

      {/* Top Header Bar */}
      <View style={[styles.headerBar, { maxWidth: isTablet ? 640 : '100%', alignSelf: 'center', width: '100%' }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add new device</Text>
        <TouchableOpacity onPress={handleStartScan} style={styles.scanHeaderAction} activeOpacity={0.7}>
          <RefreshCw size={18} color="#0F172A" />
        </TouchableOpacity>
      </View>

      {isConnecting ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0F172A" style={{ marginBottom: 20 }} />
          <Text style={styles.searchingTitle}>Connecting...</Text>
          <Text style={styles.searchingSubtitle}>
            Pairing with "{connectingDeviceName}" just like Moto Buds...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: isTablet ? 640 : '100%', alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Centered Radar Area matching Screenshot 5 */}
          <View style={styles.radarSection}>
            <TouchableOpacity
              style={[
                styles.radarWrapper,
                {
                  width: radarSize,
                  height: radarSize,
                  marginBottom: isCompactMobile ? 24 : 36,
                },
              ]}
              onPress={handleStartScan}
              activeOpacity={0.9}
            >
              {/* Rotating radar sweep: Authentic smooth conic gradient with NO sharp cutoffs */}
              <Animated.View
                // @ts-ignore
                className="moto-continuous-radar-sweep"
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
                {Platform.OS === 'web' ? (
                  <View
                    style={[
                      styles.conicSweepView,
                      {
                        width: radarSize,
                        height: radarSize,
                        borderRadius: radarSize / 2,
                      },
                    ]}
                  />
                ) : (
                  <Svg width={radarSize} height={radarSize} viewBox="0 0 210 210">
                    <Defs>
                      <LinearGradient id="sweepGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#94A3B8" stopOpacity="0.85" />
                        <Stop offset="35%" stopColor="#CBD5E1" stopOpacity="0.5" />
                        <Stop offset="70%" stopColor="#E2E8F0" stopOpacity="0.2" />
                        <Stop offset="100%" stopColor="#F8FAFC" stopOpacity="0.02" />
                      </LinearGradient>
                    </Defs>
                    <Circle cx="105" cy="105" r="100" fill="url(#sweepGrad)" />
                  </Svg>
                )}
              </Animated.View>

              {/* Dark Search Disc with Magnifying Glass Logo */}
              <Animated.View
                // @ts-ignore
                className="moto-continuous-disc-pulse"
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
            </TouchableOpacity>

            <Text style={[styles.searchingTitle, isCompactMobile && { fontSize: 24, marginBottom: 6 }]}>
              Searching...
            </Text>
            <Text style={[styles.searchingSubtitle, isCompactMobile && { fontSize: 14, marginBottom: 18 }]}>
              Make sure your washroom safety gadget is in pairing mode
            </Text>

            {/* Quick 1-Tap Search Button */}
            <TouchableOpacity
              style={styles.tapToScanBtn}
              onPress={handleStartScan}
              activeOpacity={0.85}
            >
              <RefreshCw size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.tapToScanText}>Scan for Nearby Devices</Text>
            </TouchableOpacity>

            {errorMessage ? (
              <View style={styles.warningBox}>
                <AlertTriangle size={16} color="#DC2626" style={{ marginRight: 6 }} />
                <Text style={styles.warningText}>{errorMessage}</Text>
              </View>
            ) : null}
          </View>

          {/* Moto Buds Style Fast Pair Pop-up Card */}
          {fastPairDevice && (
            <View style={styles.fastPairCard}>
              <View style={styles.fastPairHeader}>
                <View style={styles.fastPairThumbBox}>
                  <Image
                    source={require('../../assets/wsg01_product.jpg')}
                    style={styles.fastPairThumb}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fastPairDeviceTitle}>{fastPairDevice.name}</Text>
                  <Text style={styles.fastPairSubtitle}>Device found • Ready to pair</Text>
                </View>
                <TouchableOpacity onPress={() => setFastPairDevice(null)}>
                  <X size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.fastPairConnectBtn}
                onPress={() => handleConnectDevice(fastPairDevice)}
                activeOpacity={0.85}
              >
                <CheckCircle size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.fastPairConnectBtnText}>Connect Now</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Screenshot 4: Paired & Available Devices Section */}
          <View style={styles.pairedSection}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderTitle}>Paired &amp; Available devices</Text>
              <Text style={styles.sectionHeaderHint}>Tap to connect</Text>
            </View>

            <View style={styles.devicesCardList}>
              {availableDevices.map((dev, idx) => (
                <TouchableOpacity
                  key={dev.id || idx}
                  style={styles.deviceListItem}
                  onPress={() => handleConnectDevice(dev)}
                  activeOpacity={0.7}
                >
                  <View style={styles.deviceListIconBox}>
                    <Layers size={22} color="#0F172A" />
                  </View>
                  <View style={styles.deviceListInfo}>
                    <Text style={styles.deviceListItemTitle}>{dev.name}</Text>
                    <Text style={styles.deviceListItemSub}>
                      {dev.product?.model || 'WSG-01'} • 1-Tap Connect
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deviceGearBtn}
                    onPress={() => handleConnectDevice(dev)}
                    activeOpacity={0.7}
                  >
                    <Settings size={20} color="#64748B" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Add Manually Pill Button */}
          <TouchableOpacity
            style={styles.addManuallyButton}
            onPress={() => setShowManualModal(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.addManuallyText}>Add manually</Text>
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
    paddingBottom: 10,
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
  scanHeaderAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  radarSection: {
    alignItems: 'center',
    paddingTop: 16,
    marginBottom: 28,
  },
  radarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarSweepCircle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  conicSweepView: {
    // @ts-ignore
    background:
      'conic-gradient(from 0deg at 50% 50%, #94A3B8 0deg, #CBD5E1 80deg, #E2E8F0 160deg, rgba(241, 245, 249, 0.3) 260deg, transparent 350deg, #94A3B8 360deg)',
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
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  searchingSubtitle: {
    fontSize: 15,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 270,
    marginBottom: 20,
  },
  tapToScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 9999,
    marginBottom: 8,
  },
  tapToScanText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
    marginTop: 12,
    maxWidth: 340,
  },
  warningText: {
    fontSize: 13,
    color: '#B91C1C',
    flex: 1,
  },

  // Moto Buds Fast Pair Pop-up Card
  fastPairCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 18,
    marginBottom: 28,
    borderWidth: 1.5,
    borderColor: '#0F172A',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fastPairHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  fastPairThumbBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  fastPairThumb: {
    width: 44,
    height: 44,
  },
  fastPairDeviceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  fastPairSubtitle: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
  },
  fastPairConnectBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 9999,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fastPairConnectBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  // Paired devices section (Screenshot 4 style)
  pairedSection: {
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
  sectionHeaderHint: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
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

  // Add Manually button
  addManuallyButton: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderColor: '#94A3B8',
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  addManuallyText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
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
