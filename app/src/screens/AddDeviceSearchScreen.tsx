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
  AppState,
  AppStateStatus,
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
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  Cloud,
  ShieldCheck,
  Bluetooth,
} from 'lucide-react-native';
import { colors, spacing } from '../utils/theme';
import { BluetoothService, DiscoveredBleDevice, ConnectedBleSession } from '../services/bluetoothService';
import { DeviceProvisioningService } from '../services/deviceProvisioningService';
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
  const {
    deviceConfig,
    setDeviceConfig,
    setTelemetry,
    setIsOnline,
    setIsSimulatorMode,
    setBluetoothStatus,
    setWifiStatus,
    setCloudStatus,
  } = useAppStore();

  type SetupPhase =
    | 'CHECKING_BLUETOOTH'
    | 'BLUETOOTH_OFF'
    | 'BLUETOOTH_PERMISSION'
    | 'BLUETOOTH_UNSUPPORTED'
    | 'BLUETOOTH_STANDBY'
    | 'SCANNING'
    | 'DEVICE_FOUND'
    | 'WIFI_SETUP'
    | 'PROVISIONING'
    | 'WIFI_FAILED'
    | 'SUCCESS';
  const [phase, setPhase] = useState<SetupPhase>('CHECKING_BLUETOOTH');
  const [connectedSession, setConnectedSession] = useState<ConnectedBleSession | null>(null);
  const [targetDevice, setTargetDevice] = useState<DiscoveredBleDevice | null>(null);
  const [wifiSsid, setWifiSsid] = useState<string>('Home_2.4G');
  const [wifiPass, setWifiPass] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [provisionStatusText, setProvisionStatusText] = useState<string>('Sending Wi-Fi configuration...');
  const [assignedIpAddress, setAssignedIpAddress] = useState<string>('');

  const [isScanningActive, setIsScanningActive] = useState<boolean>(false);
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

  // Real BLE Scanner invocation
  const startRealBleScan = (mountedCheck: () => boolean) => {
    setIsScanningActive(true);
    setPhase('SCANNING');
    setErrorMessage('');

    if (Platform.OS !== 'web') {
      BluetoothService.startDeviceScan(
        (discovered) => {
          if (!mountedCheck()) return;

          // Strictly filter out any Windows audio, microphone, or speaker devices
          const lowerName = (discovered.name || '').toLowerCase();
          if (
            lowerName.includes('microphone') ||
            lowerName.includes('audio') ||
            lowerName.includes('speaker') ||
            lowerName.includes('headset') ||
            lowerName.includes('hands-free') ||
            lowerName.includes('realtek')
          ) {
            return;
          }

          setAvailableDevices((prev) => {
            const idx = prev.findIndex((d) => d.id === discovered.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = discovered;
              return updated;
            }
            return [...prev, discovered];
          });

          // Fast pair candidate if matches WSG-01
          if (
            lowerName.includes('wsg') ||
            lowerName.includes('washroom') ||
            lowerName.includes('safeguard')
          ) {
            setFastPairDevice(discovered);
            setPhase('DEVICE_FOUND');
          }
        },
        (scanErr) => {
          console.warn('[AddDeviceSearch] Scan error:', scanErr);
          setIsScanningActive(false);
          const msg = String(scanErr.message || '').toLowerCase();
          if (
            msg.includes('bluetooth_disabled') ||
            msg.includes('disabled') ||
            msg.includes('poweredoff')
          ) {
            if (mountedCheck()) {
              setPhase('BLUETOOTH_OFF');
              onBluetoothOff();
            }
          } else if (mountedCheck()) {
            setErrorMessage(scanErr.message);
          }
        },
        { targetNamePrefix: 'WSG-01', timeoutMs: 25000 }
      );
    }
  };

  // Bluetooth Preflight check and AppState monitoring
  useEffect(() => {
    let isMounted = true;

    // Listen for AppState changes: if user disables Bluetooth while app is backgrounded, detect it on resume
    const appStateSub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const effectiveState = await BluetoothService.getEffectiveBluetoothState();
        if (effectiveState === 'off') {
          if (isMounted) {
            setIsScanningActive(false);
            setPhase('BLUETOOTH_OFF');
            BluetoothService.stopScan();
            onBluetoothOff();
          }
        } else if (effectiveState === 'on') {
          if (isMounted && (phase === 'BLUETOOTH_OFF' || phase === 'CHECKING_BLUETOOTH')) {
            runBluetoothPreflight();
          }
        }
      }
    });

    // Listen for central Bluetooth state changes (real OS toggle or dev simulation toggle)
    const btStateSub = BluetoothService.addBluetoothStateListener((effectiveState) => {
      if (effectiveState === 'off' && isMounted) {
        setIsScanningActive(false);
        setPhase('BLUETOOTH_OFF');
        BluetoothService.stopScan();
        onBluetoothOff();
      }
    });

    const runBluetoothPreflight = async () => {
      setErrorMessage('');
      setPhase('CHECKING_BLUETOOTH');
      setIsScanningActive(false);

      // 1. Determine effective Bluetooth state
      const effectiveState = await BluetoothService.getEffectiveBluetoothState();
      if (!isMounted) return;

      // 2. If state === "off":
      //    call onBluetoothOff()
      //    DO NOT call startDeviceScan()
      //    DO NOT call scanNearbyDevices()
      if (effectiveState === 'off') {
        setPhase('BLUETOOTH_OFF');
        setIsScanningActive(false);
        BluetoothService.stopScan();
        onBluetoothOff();
        return;
      }

      // 3. If state === "unauthorized":
      //    request Bluetooth permissions.
      //    If permission denied: show appropriate permission UI. Do not start scanning.
      if (effectiveState === 'unauthorized') {
        const granted = await BluetoothService.requestPermissions();
        if (!isMounted) return;
        if (!granted) {
          setPhase('BLUETOOTH_PERMISSION');
          setIsScanningActive(false);
          return;
        }
      }

      // 4. If state === "unsupported":
      //    show appropriate unsupported Bluetooth message. Do not start scanning.
      if (effectiveState === 'unsupported') {
        setPhase('BLUETOOTH_UNSUPPORTED');
        setIsScanningActive(false);
        setErrorMessage('Bluetooth Low Energy is not supported on this device.');
        return;
      }

      // 5. On Web / Windows Desktop:
      //    Do NOT assume physical radio is ON or auto-scan without user gesture.
      //    Use safe state: ask user to check Bluetooth then scan via user gesture.
      if (Platform.OS === 'web') {
        setPhase('BLUETOOTH_STANDBY');
        setIsScanningActive(false);
        return;
      }

      // 6. If state === "on":
      //    request permissions if necessary.
      //    only after permission succeeds: start REAL BLE scanning.
      if (effectiveState === 'on') {
        const granted = await BluetoothService.requestPermissions();
        if (!isMounted) return;
        if (!granted) {
          setPhase('BLUETOOTH_PERMISSION');
          setIsScanningActive(false);
          return;
        }

        startRealBleScan(() => isMounted);
      }
    };

    runBluetoothPreflight();

    return () => {
      isMounted = false;
      appStateSub.remove();
      btStateSub();
      BluetoothService.stopScan();
    };
  }, []);

  // Manual "Scan for Nearby Devices" button preflight check
  const handleStartScan = async () => {
    setErrorMessage('');

    // 1. Check effective Bluetooth state
    const effectiveState = await BluetoothService.getEffectiveBluetoothState();

    // 2. If OFF: show BluetoothOffScreen
    if (effectiveState === 'off') {
      setIsScanningActive(false);
      setPhase('BLUETOOTH_OFF');
      BluetoothService.stopScan();
      onBluetoothOff();
      return;
    }

    // 3. If unauthorized: request permission
    if (effectiveState === 'unauthorized') {
      const granted = await BluetoothService.requestPermissions();
      if (!granted) {
        setPhase('BLUETOOTH_PERMISSION');
        setIsScanningActive(false);
        setErrorMessage('Bluetooth permissions are required to scan for WSG-01 devices.');
        return;
      }
    }

    // 4. If unsupported: show unsupported message
    if (effectiveState === 'unsupported') {
      setPhase('BLUETOOTH_UNSUPPORTED');
      setIsScanningActive(false);
      setErrorMessage('Bluetooth Low Energy is not supported on this device.');
      return;
    }

    // 5. If ON (or Web user gesture): start REAL scan
    setIsScanningActive(true);
    setPhase('SCANNING');
    setAvailableDevices([]);
    setFastPairDevice(null);

    if (Platform.OS !== 'web') {
      startRealBleScan(() => true);
    } else {
      // Trigger Web Bluetooth browser/device chooser via user gesture
      // NEVER call getSystemBluetoothDevices() which returns microphones/speakers!
      try {
        const found = await BluetoothService.scanNearbyDevices();
        if (found) {
          const lowerName = (found.name || '').toLowerCase();
          if (
            !lowerName.includes('microphone') &&
            !lowerName.includes('audio') &&
            !lowerName.includes('speaker') &&
            !lowerName.includes('realtek')
          ) {
            setAvailableDevices([found]);
            setFastPairDevice(found);
            setPhase('DEVICE_FOUND');
          }
        } else {
          setIsScanningActive(false);
          setPhase('BLUETOOTH_STANDBY');
        }
      } catch (err: any) {
        setIsScanningActive(false);
        const msg = String(err.message || '').toLowerCase();
        if (
          msg.includes('disabled') ||
          msg.includes('bluetooth_disabled') ||
          msg.includes('poweredoff')
        ) {
          setPhase('BLUETOOTH_OFF');
          onBluetoothOff();
        } else if (
          msg === 'user_cancelled' ||
          msg === 'no_device_chosen' ||
          err.name === 'NotFoundError'
        ) {
          setPhase('BLUETOOTH_STANDBY');
        } else {
          setErrorMessage(err.message || 'Scanning encountered an issue.');
          setPhase('BLUETOOTH_STANDBY');
        }
      }
    }
  };

  const getSearchTitle = () => {
    switch (phase) {
      case 'CHECKING_BLUETOOTH':
        return 'Checking Bluetooth...';
      case 'BLUETOOTH_PERMISSION':
        return 'Bluetooth Permission Required';
      case 'BLUETOOTH_UNSUPPORTED':
        return 'Bluetooth Not Supported';
      case 'BLUETOOTH_STANDBY':
        return 'Bluetooth Ready';
      case 'DEVICE_FOUND':
        return 'WSG-01 Found';
      case 'SCANNING':
      default:
        return 'Searching...';
    }
  };

  const getSearchSubtitle = () => {
    switch (phase) {
      case 'CHECKING_BLUETOOTH':
        return 'Verifying Bluetooth adapter status...';
      case 'BLUETOOTH_PERMISSION':
        return 'Please grant Bluetooth permissions to discover and connect your WSG-01 device.';
      case 'BLUETOOTH_UNSUPPORTED':
        return 'Bluetooth Low Energy is not supported on this device.';
      case 'BLUETOOTH_STANDBY':
        return 'Make sure Bluetooth is turned on, then tap Scan to search for your WSG-01.';
      case 'DEVICE_FOUND':
        return 'Washroom Safety Gadget detected. Tap Connect to configure.';
      case 'SCANNING':
      default:
        return 'Make sure your washroom safety gadget is in pairing mode';
    }
  };

  // Step 1: Connect BLE GATT -> on success, transition to WIFI_SETUP
  const handleConnectDevice = async (device: DiscoveredBleDevice) => {
    setIsConnecting(true);
    setConnectingDeviceName(device.name);
    setErrorMessage('');

    try {
      const session = await BluetoothService.connectGatt(device);
      setConnectedSession(session);
      setTargetDevice(device);
      setBluetoothStatus('CONNECTED');
      setIsConnecting(false);
      setPhase('WIFI_SETUP');
    } catch (err: any) {
      setIsConnecting(false);
      setErrorMessage(`Connection Failed: ${err.message || 'Device refused connection'}. Make sure it is in pairing mode.`);
    }
  };

  // Step 2: Send Wi-Fi credentials over BLE GATT to ESP32
  const handleProvisionWifi = async () => {
    if (!wifiSsid.trim()) {
      Alert.alert('Required Field', 'Please enter your 2.4GHz Wi-Fi network SSID.');
      return;
    }

    setPhase('PROVISIONING');
    setErrorMessage('');
    setProvisionStatusText('Sending Wi-Fi configuration...');
    setWifiStatus('CONNECTING');

    try {
      const finalName = targetDevice?.name || 'Washroom Safety Gadget';
      const finalId = targetDevice?.id || 'wsg-01';

      const result = await DeviceProvisioningService.provisionEsp32(
        connectedSession,
        {
          ssid: wifiSsid.trim(),
          password: wifiPass,
          customDeviceName: finalName,
          room: 'Master Washroom',
        },
        (step, details) => {
          if (step === 'SENDING_CREDENTIALS') {
            setProvisionStatusText('Sending Wi-Fi configuration...');
          } else if (step === 'CONNECTING_ROUTER') {
            setProvisionStatusText(`Connecting WSG-01 to "${wifiSsid}"...`);
          } else if (step === 'OBTAINING_IP') {
            setProvisionStatusText('Verifying connection with router...');
          } else if (step === 'SUCCESS') {
            setProvisionStatusText('Wi-Fi connected ✓');
          }
          if (details) setProvisionStatusText(details);
        }
      );

      if (!result.ipAddress || result.ipAddress === '0.0.0.0') {
        throw new Error('ESP32 did not obtain a valid IP address from router.');
      }
      const ip = result.ipAddress;
      setAssignedIpAddress(ip);

      // Bluetooth is Connected (Test 1)
      setBluetoothStatus('CONNECTED');

      // Wi-Fi is Connected (Test 1)
      setWifiStatus('CONNECTED');

      // Verify Cloud status independently over HTTPS (Test 8)
      const isCloudOk = await DeviceProvisioningService.checkCloudConnectivity();
      setCloudStatus(isCloudOk ? 'CONNECTED' : 'DISCONNECTED');

      setIsOnline(true);
      setIsSimulatorMode(false);

      addOrUpdateDevice({
        deviceId: finalId,
        name: finalName,
        model: targetDevice?.product?.model || 'WSG-01',
        room: 'Master Washroom',
        ipAddress: ip,
        isOnline: true,
        lastSeen: new Date().toISOString(),
        firmwareVersion: 'v1.2.0-esp32',
        sensor: 'LD2410C 24GHz mmWave',
        connectionType: 'WIFI',
      });
      setActiveDeviceId(finalId);

      if (deviceConfig) {
        setDeviceConfig({
          ...deviceConfig,
          deviceName: finalName,
          deviceId: finalId,
        });
      }

      // Initialize real telemetry without hardcoded fake values
      const realRssi = typeof result.rssi === 'number' ? result.rssi : 0;
      setTelemetry({
        deviceId: finalId,
        timestamp: new Date().toISOString(),
        presence: false,
        movement: false,
        stillnessSeconds: 0,
        state: 'IDLE',
        voiceDetected: false,
        wifiRSSI: realRssi,
        uptime: 0,
        firmwareVersion: 'v1.2.0-esp32',
      });

      // Query live device telemetry directly from ESP32 local HTTP REST API
      try {
        fetch(`http://${ip}/api/device/telemetry`)
          .then((res) => res.json())
          .then((t) => {
            if (t) {
              setTelemetry({
                deviceId: finalId,
                timestamp: new Date().toISOString(),
                presence: Boolean(t.presence),
                movement: Boolean(t.movement),
                stillnessSeconds: Number(t.stillness_seconds || 0),
                state: t.state || 'IDLE',
                voiceDetected: false,
                wifiRSSI: Number(t.wifi_rssi ?? realRssi),
                uptime: Number(t.uptime || 0),
                firmwareVersion: t.firmware_version || 'v1.2.0-esp32',
              });
            }
          })
          .catch(() => {});
      } catch {}

      playSuccessChime();
      setPhase('SUCCESS');
    } catch (err: any) {
      console.warn('Wi-Fi Provisioning failed:', err);
      let friendlyMsg = err.message || 'Wi-Fi connection failed.\nPlease check the network name and password.';
      if (err.message && (err.message.includes('AUTH_FAILED') || err.message.toLowerCase().includes('password'))) {
        friendlyMsg = 'Wi-Fi connection failed: Incorrect Wi-Fi password.';
      } else if (err.message && (err.message.includes('SSID_NOT_FOUND') || err.message.includes('not found'))) {
        friendlyMsg = `Wi-Fi connection failed: Network "${wifiSsid}" not found in range.`;
      } else if (err.message && (err.message.includes('timed out') || err.message.includes('TIMEOUT'))) {
        friendlyMsg = `Wi-Fi connection timed out: ESP32 could not connect to "${wifiSsid}". Ensure the router operates on 2.4GHz and credentials are correct.`;
      }
      setWifiStatus('FAILED');
      setCloudStatus('DISCONNECTED');
      setErrorMessage(friendlyMsg);
      setPhase('WIFI_FAILED');
    }
  };

  // Step 3: Optional Skip Wi-Fi (BLE Only)
  const handleSkipWifi = () => {
    const finalName = targetDevice?.name || 'Washroom Safety Gadget';
    const finalId = targetDevice?.id || 'wsg-01';

    setBluetoothStatus('CONNECTED');
    setWifiStatus('DISCONNECTED');
    setCloudStatus('DISCONNECTED');
    setIsOnline(true);
    setIsSimulatorMode(false);

    addOrUpdateDevice({
      deviceId: finalId,
      name: finalName,
      model: targetDevice?.product?.model || 'WSG-01',
      room: 'Master Washroom',
      isOnline: true,
      lastSeen: new Date().toISOString(),
      firmwareVersion: 'v1.1.0-esp32',
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

    playSuccessChime();
    setPhase('SUCCESS');
  };

  // Manual connection fallback
  const handleConnectManual = () => {
    if (!manualName.trim() || !manualId.trim()) {
      Alert.alert('Required Fields', 'Please enter a device name and hardware UUID/IP.');
      return;
    }

    // Manual device addition is strictly isolated to development/demo mode
    const isDev = Boolean(typeof __DEV__ !== 'undefined' && __DEV__);
    addOrUpdateDevice({
      deviceId: manualId.trim(),
      name: manualName.trim(),
      model: 'WSG-01',
      room: manualRoom.trim() || 'Washroom',
      isOnline: isDev,
      lastSeen: new Date().toISOString(),
      firmwareVersion: 'v1.2.0-esp32',
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
    setIsSimulatorMode(isDev);
    setIsOnline(isDev);

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
          <Text style={styles.searchingTitle}>Connecting BLE...</Text>
          <Text style={styles.searchingSubtitle}>
            Pairing with "{connectingDeviceName}" over Bluetooth GATT...
          </Text>
        </View>
      ) : phase === 'WIFI_SETUP' || phase === 'PROVISIONING' ? (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: isTablet ? 560 : '100%', alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Device BLE Connected Header */}
          <View style={styles.wifiDeviceHeader}>
            <View style={styles.wifiDeviceIconBox}>
              <ShieldCheck size={28} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.wifiDeviceName}>{targetDevice?.name || 'WSG-01 Safety Gadget'}</Text>
              <View style={styles.wifiDeviceBadge}>
                <Bluetooth size={12} color="#059669" />
                <Text style={styles.wifiDeviceBadgeText}>Bluetooth: Connected</Text>
              </View>
            </View>
          </View>

          {/* Wi-Fi Configuration Card */}
          <View style={styles.wifiCard}>
            <View style={styles.wifiCardHeader}>
              <View style={styles.wifiIconWrap}>
                <Wifi size={24} color="#0F172A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.wifiCardTitle}>Configure Wi-Fi</Text>
                <Text style={styles.wifiCardSubtitle}>
                  Enter your 2.4GHz Wi-Fi credentials to connect the gadget to the internet.
                </Text>
              </View>
            </View>

            {/* Error Message if failed */}
            {errorMessage ? (
              <View style={styles.wifiErrorBox}>
                <AlertTriangle size={18} color="#B91C1C" />
                <Text style={styles.wifiErrorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* Wi-Fi SSID input */}
            <Text style={styles.wifiFieldLabel}>Wi-Fi Network / SSID</Text>
            <TextInput
              style={styles.wifiInput}
              value={wifiSsid}
              onChangeText={setWifiSsid}
              placeholder="e.g. MyHome_2.4G"
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              editable={phase !== 'PROVISIONING'}
            />

            {/* Password input */}
            <Text style={[styles.wifiFieldLabel, { marginTop: 14 }]}>Password</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={styles.passwordInput}
                value={wifiPass}
                onChangeText={setWifiPass}
                placeholder="Wi-Fi Password"
                placeholderTextColor="#94A3B8"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={phase !== 'PROVISIONING'}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                {showPassword ? (
                  <EyeOff size={20} color="#64748B" />
                ) : (
                  <Eye size={20} color="#64748B" />
                )}
              </TouchableOpacity>
            </View>

            {/* Optional Show Password Toggle Text */}
            <TouchableOpacity
              style={styles.showPasswordRow}
              onPress={() => setShowPassword(!showPassword)}
              activeOpacity={0.7}
            >
              <Text style={styles.showPasswordText}>
                {showPassword ? 'Hide password' : 'Show password'}
              </Text>
            </TouchableOpacity>

            {/* Provisioning Progress Status Box */}
            {phase === 'PROVISIONING' ? (
              <View style={styles.provisionProgressBox}>
                <ActivityIndicator size="small" color="#0F172A" style={{ marginRight: 10 }} />
                <Text style={styles.provisionProgressText}>{provisionStatusText}</Text>
              </View>
            ) : null}

            {/* Primary Action Button: Connect WSG-01 */}
            <TouchableOpacity
              style={[
                styles.connectWifiBtn,
                phase === 'PROVISIONING' && { opacity: 0.6 },
              ]}
              onPress={handleProvisionWifi}
              disabled={phase === 'PROVISIONING'}
              activeOpacity={0.85}
            >
              {phase === 'PROVISIONING' ? (
                <Text style={styles.connectWifiBtnText}>Connecting WSG-01...</Text>
              ) : (
                <Text style={styles.connectWifiBtnText}>Connect WSG-01</Text>
              )}
            </TouchableOpacity>

            {/* Secondary Option: Skip Wi-Fi */}
            {phase !== 'PROVISIONING' && (
              <TouchableOpacity
                style={styles.skipWifiBtn}
                onPress={handleSkipWifi}
                activeOpacity={0.75}
              >
                <Text style={styles.skipWifiBtnText}>Skip Wi-Fi (Bluetooth Only)</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      ) : phase === 'WIFI_FAILED' ? (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: isTablet ? 560 : '100%', alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Device BLE Connected Header */}
          <View style={styles.wifiDeviceHeader}>
            <View style={styles.wifiDeviceIconBox}>
              <ShieldCheck size={28} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.wifiDeviceName}>{targetDevice?.name || 'WSG-01 Safety Gadget'}</Text>
              <View style={styles.wifiDeviceBadge}>
                <Bluetooth size={12} color="#059669" />
                <Text style={styles.wifiDeviceBadgeText}>Bluetooth: Connected</Text>
              </View>
            </View>
          </View>

          {/* Wi-Fi Failure Card (User Requirement) */}
          <View style={styles.wifiCard}>
            <View style={styles.wifiCardHeader}>
              <View style={[styles.wifiIconWrap, { backgroundColor: '#FEE2E2' }]}>
                <WifiOff size={24} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.wifiCardTitle, { color: '#DC2626' }]}>Wi-Fi connection failed</Text>
                <Text style={styles.wifiCardSubtitle}>
                  {errorMessage || 'Check your Wi-Fi name and password.'}
                </Text>
              </View>
            </View>

            {/* Connection Status Badges */}
            <View style={[styles.statusPillsContainer, { marginVertical: 14 }]}>
              <View style={styles.statusPillItem}>
                <View style={[styles.statusPillDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.statusPillLabel}>Bluetooth: Connected</Text>
              </View>
              <View style={styles.statusPillItem}>
                <View style={[styles.statusPillDot, { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.statusPillLabel, { color: '#DC2626' }]}>Wi-Fi: Connection Failed</Text>
              </View>
            </View>

            {/* Action 1: Retry */}
            <TouchableOpacity
              style={styles.connectWifiBtn}
              onPress={handleProvisionWifi}
              activeOpacity={0.85}
            >
              <Text style={styles.connectWifiBtnText}>Retry Connection</Text>
            </TouchableOpacity>

            {/* Action 2: Edit Wi-Fi */}
            <TouchableOpacity
              style={[styles.skipWifiBtn, { marginTop: 10, borderColor: '#CBD5E1', borderWidth: 1 }]}
              onPress={() => {
                setErrorMessage('');
                setPhase('WIFI_SETUP');
              }}
              activeOpacity={0.75}
            >
              <Text style={[styles.skipWifiBtnText, { color: '#0F172A' }]}>Edit Wi-Fi</Text>
            </TouchableOpacity>

            {/* Action 3: Cancel */}
            <TouchableOpacity
              style={[styles.skipWifiBtn, { marginTop: 8 }]}
              onPress={handleSkipWifi}
              activeOpacity={0.75}
            >
              <Text style={styles.skipWifiBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : phase === 'SUCCESS' ? (
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={[
            styles.scrollContent,
            { maxWidth: isTablet ? 560 : '100%', alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <CheckCircle size={48} color="#FFFFFF" />
            </View>
            <Text style={styles.successTitle}>WSG-01 Connected</Text>
            <Text style={styles.successSubtitle}>
              Washroom Safety Gadget is configured and ready.
            </Text>

            {/* 4 Connected Status Badges */}
            <View style={styles.statusPillsContainer}>
              <View style={styles.statusPillItem}>
                <View style={[styles.statusPillDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.statusPillLabel}>Bluetooth: Connected</Text>
              </View>
              <View style={styles.statusPillItem}>
                <View
                  style={[
                    styles.statusPillDot,
                    { backgroundColor: assignedIpAddress ? '#10B981' : '#94A3B8' },
                  ]}
                />
                <Text style={styles.statusPillLabel}>
                  Wi-Fi: {assignedIpAddress ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
              <View style={styles.statusPillItem}>
                <View
                  style={[
                    styles.statusPillDot,
                    { backgroundColor: assignedIpAddress ? '#10B981' : '#94A3B8' },
                  ]}
                />
                <Text style={styles.statusPillLabel}>
                  Cloud: {assignedIpAddress ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
              <View style={styles.statusPillItem}>
                <View style={[styles.statusPillDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.statusPillLabel}>Device: Online</Text>
              </View>
            </View>

            {/* Extra Info */}
            {assignedIpAddress ? (
              <View style={styles.ipAddressBox}>
                <Text style={styles.ipAddressLabel}>Network IP:</Text>
                <Text style={styles.ipAddressValue}>{assignedIpAddress}</Text>
              </View>
            ) : null}

            {/* Done button */}
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={() => {
                const finalName = targetDevice?.name || 'Washroom Safety Gadget';
                const finalId = targetDevice?.id || 'wsg-01';
                onDeviceConnected(finalName, finalId);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
              {/* Rotating radar sweep: Only visible when isScanningActive is true */}
              {isScanningActive && (
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
              )}

              {/* Dark Search Disc with Magnifying Glass Logo */}
              <Animated.View
                // @ts-ignore
                className={isScanningActive ? 'moto-continuous-disc-pulse' : undefined}
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
                {phase === 'CHECKING_BLUETOOTH' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Search size={isCompactMobile ? 32 : 36} color="#FFFFFF" strokeWidth={2.4} />
                )}
              </Animated.View>
            </TouchableOpacity>

            <Text style={[styles.searchingTitle, isCompactMobile && { fontSize: 24, marginBottom: 6 }]}>
              {getSearchTitle()}
            </Text>
            <Text style={[styles.searchingSubtitle, isCompactMobile && { fontSize: 14, marginBottom: 18 }]}>
              {getSearchSubtitle()}
            </Text>

            {/* Quick 1-Tap Search Button */}
            {phase !== 'CHECKING_BLUETOOTH' && (
              <TouchableOpacity
                style={styles.tapToScanBtn}
                onPress={handleStartScan}
                activeOpacity={0.85}
              >
                <RefreshCw size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.tapToScanText}>
                  {phase === 'BLUETOOTH_PERMISSION'
                    ? 'Grant Bluetooth Permission'
                    : 'Scan for Nearby Devices'}
                </Text>
              </TouchableOpacity>
            )}

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
              {availableDevices.length === 0 ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#94A3B8' }}>
                    {phase === 'SCANNING'
                      ? 'Listening for nearby WSG-01 BLE broadcasts...'
                      : phase === 'CHECKING_BLUETOOTH'
                      ? 'Checking Bluetooth...'
                      : 'No devices found. Tap "Scan for Nearby Devices" above.'}
                  </Text>
                </View>
              ) : (
                availableDevices.map((dev, idx) => (
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
              )))}
            </View>
          </View>

          {/* Add Manually Button (Restricted strictly to Development/Demo mode) */}
          {Boolean(typeof __DEV__ !== 'undefined' && __DEV__) && (
            <TouchableOpacity
              style={styles.addManuallyButton}
              onPress={() => setShowManualModal(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.addManuallyText}>Add manually (Dev Demo)</Text>
            </TouchableOpacity>
          )}
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

  // Wi-Fi Setup & Success Styles
  wifiDeviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  wifiDeviceIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  wifiDeviceName: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  wifiDeviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  wifiDeviceBadgeText: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '700',
  },
  wifiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  wifiCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 18,
  },
  wifiIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wifiCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  wifiCardSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  wifiErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  wifiErrorText: {
    fontSize: 13,
    color: '#B91C1C',
    fontWeight: '600',
    flex: 1,
  },
  wifiFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  wifiInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0F172A',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 13,
    fontSize: 15,
    color: '#0F172A',
  },
  eyeButton: {
    padding: 6,
  },
  showPasswordRow: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 20,
  },
  showPasswordText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  provisionProgressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  provisionProgressText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
  },
  connectWifiBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  connectWifiBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipWifiBtn: {
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  skipWifiBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },

  // Success Card Styles
  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: '#10B981',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
    maxWidth: 320,
  },
  statusPillsContainer: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusPillDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusPillLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  ipAddressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ipAddressLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  ipAddressValue: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  doneBtn: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderRadius: 9999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
