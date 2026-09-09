import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { ProductDefinition, ProductCatalogService } from '../services/productCatalog';
import { BluetoothService, DiscoveredBleDevice, ConnectedBleSession } from '../services/bluetoothService';
import { WifiService, DiscoveredWifiNetwork } from '../services/wifiService';
import { DeviceProvisioningService } from '../services/deviceProvisioningService';
import { Esp32Service } from '../services/esp32Service';
import { useDeviceStore } from '../store/useDeviceStore';
import { useAppStore } from '../store/useAppStore';
import {
  ArrowLeft,
  ArrowRight,
  Bluetooth,
  BluetoothOff,
  Wifi,
  WifiOff,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Activity,
  ShieldCheck,
  Lock,
  Radio,
  ExternalLink,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react-native';

export type OnboardingStep =
  | 'PRODUCT_SELECTION'
  | 'PRODUCT_DETAILS'
  | 'BLUETOOTH_DISCOVERY'
  | 'BLE_CONNECTING'
  | 'WIFI_SCANNING'
  | 'WIFI_SETUP'
  | 'PROVISIONING'
  | 'DEVICE_VERIFICATION'
  | 'SETUP_COMPLETE'
  | 'ERROR_STATE';

interface DeviceOnboardingScreenProps {
  onClose: () => void;
  onComplete: () => void;
}

export const DeviceOnboardingScreen: React.FC<DeviceOnboardingScreenProps> = ({
  onClose,
  onComplete,
}) => {
  const { addOrUpdateDevice, setActiveDeviceId } = useDeviceStore();
  const { setDeviceConfig, setTelemetry, setIsOnline, setIsSimulatorMode } = useAppStore();

  // Wizard state
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('PRODUCT_SELECTION');
  const [selectedProduct, setSelectedProduct] = useState<ProductDefinition | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Connection method toggle: [ Bluetooth ]   [ Wi-Fi ]
  const [connectionMethod, setConnectionMethod] = useState<'BLUETOOTH' | 'WIFI'>('BLUETOOTH');

  // Bluetooth & Discovery state (100% untouched)
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState<boolean>(true);
  const [isScanningBle, setIsScanningBle] = useState<boolean>(false);
  const [discoveredDevice, setDiscoveredDevice] = useState<DiscoveredBleDevice | null>(null);
  const [bleSession, setBleSession] = useState<ConnectedBleSession | null>(null);

  // Wi-Fi state
  const [isWifiEnabled, setIsWifiEnabled] = useState<boolean>(true);
  const [isWifiTurnedOff, setIsWifiTurnedOff] = useState<boolean>(false);
  const [wifiPermissionDenied, setWifiPermissionDenied] = useState<boolean>(false);
  const [wifiNetworks, setWifiNetworks] = useState<DiscoveredWifiNetwork[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<DiscoveredWifiNetwork | null>(null);
  const [selectedSsid, setSelectedSsid] = useState<string>('');
  const [wifiPassword, setWifiPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isScanningWifi, setIsScanningWifi] = useState<boolean>(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState<boolean>(false);
  const [passwordValidationError, setPasswordValidationError] = useState<string>('');
  const wifiAbortControllerRef = useRef<AbortController | null>(null);

  // Provisioning & Verification state
  const [provisionStepNumber, setProvisionStepNumber] = useState<number>(1);
  const [provisioningStatusText, setProvisioningStatusText] = useState<string>('');
  const [assignedIp, setAssignedIp] = useState<string>('');
  const [verifiedModel, setVerifiedModel] = useState<string>('');
  const [customRoomName, setCustomRoomName] = useState<string>('Master Bathroom');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Radar animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (currentStep === 'BLUETOOTH_DISCOVERY' || (currentStep === 'WIFI_SCANNING' && isScanningWifi)) {
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.35,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      const rotateLoop = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2500,
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
  }, [currentStep, isScanningWifi]);

  // Auto-continue when Wi-Fi is turned back ON
  useEffect(() => {
    let interval: any = null;
    if (isWifiTurnedOff && currentStep === 'WIFI_SCANNING') {
      interval = setInterval(async () => {
        const isOnline = await WifiService.checkDeviceWifiEnabled();
        if (isOnline) {
          setIsWifiTurnedOff(false);
          setIsWifiEnabled(true);
          startWifiScan();
        }
      }, 1500);
    }
    const handleOnlineEvent = async () => {
      if (isWifiTurnedOff && currentStep === 'WIFI_SCANNING') {
        const isOnline = await WifiService.checkDeviceWifiEnabled();
        if (isOnline) {
          setIsWifiTurnedOff(false);
          setIsWifiEnabled(true);
          startWifiScan();
        }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnlineEvent);
    }
    return () => {
      if (interval) clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnlineEvent);
      }
    };
  }, [isWifiTurnedOff, currentStep]);

  // Initial products
  const products = ProductCatalogService.getAllProducts();
  const categories = ['All', 'Safety', 'Radar', 'Emergency'];
  const filteredProducts =
    selectedCategory === 'All'
      ? products
      : products.filter((p) => p.category === selectedCategory);

  // Step 1 -> Step 2
  const handleSelectProduct = (product: ProductDefinition) => {
    setSelectedProduct(product);
    setCurrentStep('PRODUCT_DETAILS');
  };

  // Step 2 (Bluetooth) -> Step 3: Begin real Bluetooth scan (100% existing flow)
  const handleStartBluetoothScan = async () => {
    if (!selectedProduct) return;
    setCurrentStep('BLUETOOTH_DISCOVERY');
    setDiscoveredDevice(null);
    setErrorMessage('');
    setIsScanningBle(true);

    const isAvailable = await BluetoothService.isBluetoothAvailable();
    setIsBluetoothEnabled(isAvailable);

    if (!isAvailable) {
      setIsScanningBle(false);
      return;
    }

    try {
      const found = await BluetoothService.scanForProduct(selectedProduct);
      setDiscoveredDevice(found);
      setIsScanningBle(false);
    } catch (err: any) {
      setIsScanningBle(false);
      if (err.message === 'BLUETOOTH_DISABLED') {
        setIsBluetoothEnabled(false);
      } else if (err.message === 'NO_DEVICE_CHOSEN') {
        setErrorMessage('Device selection was cancelled. Make sure your ESP32 device is powered on nearby.');
      } else {
        setErrorMessage(err.message || 'Scanning error occurred.');
      }
    }
  };

  // Turn on Bluetooth trigger
  const handleTurnOnBluetooth = () => {
    BluetoothService.openSystemBluetoothSettings();
  };

  // Connect via real BLE GATT
  const handleConnectBle = async () => {
    if (!discoveredDevice) return;
    setCurrentStep('BLE_CONNECTING');
    setErrorMessage('');

    try {
      const session = await BluetoothService.connectGatt(discoveredDevice);
      setBleSession(session);

      // Transition to Wi-Fi Setup
      setCurrentStep('WIFI_SETUP');
      loadWifiNetworks(session);
    } catch (err: any) {
      console.error('BLE GATT connection error:', err);
      setErrorMessage(err.message || 'GATT connection failed.');
      setCurrentStep('ERROR_STATE');
    }
  };

  // Load real Wi-Fi networks (for BLE onboarding)
  const loadWifiNetworks = async (session?: ConnectedBleSession | null) => {
    setIsScanningWifi(true);
    const wifiActive = await WifiService.checkDeviceWifiEnabled();
    setIsWifiEnabled(wifiActive);

    if (!wifiActive) {
      setIsScanningWifi(false);
      setIsWifiTurnedOff(true);
      return;
    }

    try {
      const networks = await WifiService.scanWifiNetworks(session || bleSession);
      setWifiNetworks(networks);
      if (networks.length > 0) {
        setSelectedSsid(networks[0].ssid);
      }
    } catch (e: any) {
      if (e.message === 'WIFI_DISABLED') {
        setIsWifiEnabled(false);
        setIsWifiTurnedOff(true);
      }
    } finally {
      setIsScanningWifi(false);
    }
  };

  // Turn on Wi-Fi trigger (opens system flyout / settings)
  const handleTurnOnWifi = () => {
    WifiService.openSystemWifiSettings();
  };

  // Start dedicated Wi-Fi connection flow
  const handleStartWifiFlow = async () => {
    if (!selectedProduct) return;
    setErrorMessage('');
    setCurrentStep('WIFI_SCANNING');

    // 1. Deep check Wi-Fi state
    const wifiActive = await WifiService.checkDeviceWifiEnabled();
    if (!wifiActive) {
      setIsWifiTurnedOff(true);
      setIsWifiEnabled(false);
      return;
    }
    setIsWifiTurnedOff(false);
    setIsWifiEnabled(true);

    // 2. Request permissions
    const perm = await WifiService.requestPermissions();
    if (perm === 'DENIED' || perm === 'PERMANENTLY_DENIED') {
      setWifiPermissionDenied(true);
      return;
    }
    setWifiPermissionDenied(false);

    // 3. Begin real scan
    await startWifiScan();
  };

  // Real Wi-Fi scan query
  const startWifiScan = async () => {
    setIsScanningWifi(true);
    setErrorMessage('');

    // Ensure Wi-Fi is actively enabled before proceeding
    const wifiActive = await WifiService.checkDeviceWifiEnabled();
    if (!wifiActive) {
      setIsScanningWifi(false);
      setIsWifiTurnedOff(true);
      setIsWifiEnabled(false);
      return;
    }

    const controller = new AbortController();
    wifiAbortControllerRef.current = controller;

    try {
      const networks = await WifiService.scanWifiNetworks(bleSession, controller.signal);
      setWifiNetworks(networks);
      if (networks.length > 0) {
        setSelectedSsid(networks[0].ssid);
      }
    } catch (err: any) {
      if (err.message === 'WIFI_DISABLED') {
        setIsWifiTurnedOff(true);
        setIsWifiEnabled(false);
      } else if (err.message === 'PERMISSION_DENIED' || err.message === 'PERMISSION_PERMANENTLY_DENIED') {
        setWifiPermissionDenied(true);
      } else {
        setErrorMessage(err.message || 'Wi-Fi scan failed.');
      }
    } finally {
      setIsScanningWifi(false);
    }
  };

  // Stop scanning
  const stopWifiScan = () => {
    if (wifiAbortControllerRef.current) {
      wifiAbortControllerRef.current.abort();
    }
    setIsScanningWifi(false);
  };

  // Tap on a discovered network
  const handleSelectNetwork = (net: DiscoveredWifiNetwork) => {
    setSelectedNetwork(net);
    setSelectedSsid(net.ssid);
    setPasswordValidationError('');
    setWifiPassword('');
    if (net.security === 'OPEN') {
      handleProvisionDeviceDirect(net.ssid, '');
    } else {
      setPasswordModalVisible(true);
    }
  };

  // Confirm password and connect
  const handleConfirmPasswordAndConnect = () => {
    const trimmed = wifiPassword.trim();
    if (selectedNetwork && selectedNetwork.security !== 'OPEN') {
      if (trimmed.length < 8) {
        setPasswordValidationError('Password must be at least 8 characters for WPA2/WPA3.');
        return;
      }
    }
    setPasswordModalVisible(false);
    handleProvisionDeviceDirect(selectedSsid, trimmed);
  };

  // Provision device (Supports both BLE session and direct Wi-Fi)
  const handleProvisionDeviceDirect = async (ssid: string, pass: string) => {
    if (!ssid.trim()) {
      Alert.alert('Missing SSID', 'Please select a Wi-Fi network.');
      return;
    }

    setCurrentStep('PROVISIONING');
    setErrorMessage('');
    setProvisionStepNumber(1);

    try {
      // Step 1: Sending Wi-Fi configuration to device
      setProvisionStepNumber(1);
      setProvisioningStatusText('Sending Wi-Fi configuration to device...');
      await new Promise((r) => setTimeout(r, 600));

      // Step 2: Connecting gadget to home router
      setProvisionStepNumber(2);
      setProvisioningStatusText(`Connecting gadget to "${ssid}"...`);

      const result = await DeviceProvisioningService.provisionEsp32(
        bleSession,
        {
          ssid: ssid.trim(),
          password: pass,
          customDeviceName: `${selectedProduct?.name} (${customRoomName})`,
          room: customRoomName,
        },
        (step, details) => {
          if (step === 'CONNECTING_ROUTER') {
            setProvisionStepNumber(2);
          } else if (step === 'OBTAINING_IP') {
            setProvisionStepNumber(3);
          }
          if (details) setProvisioningStatusText(details);
        }
      );

      // Step 3: Waiting for IP assignment
      setProvisionStepNumber(3);
      setProvisioningStatusText(`Assigned IP: ${result.ipAddress}`);
      setAssignedIp(result.ipAddress);
      setVerifiedModel(result.model);
      await new Promise((r) => setTimeout(r, 500));

      // Step 4: Verifying device communication
      setProvisionStepNumber(4);
      setProvisioningStatusText('Verifying device communication over network...');
      setCurrentStep('DEVICE_VERIFICATION');

      await verifyDevice(result.ipAddress);
    } catch (err: any) {
      console.error('Provisioning failed');
      let friendlyMsg = err.message || 'Wi-Fi setup failed.';
      if (friendlyMsg.includes('password') || friendlyMsg.includes('AUTH_FAILED')) {
        friendlyMsg = 'Wi-Fi connection failed. Please check your password.';
      } else if (friendlyMsg.includes('not found') || friendlyMsg.includes('SSID_NOT_FOUND')) {
        friendlyMsg = 'Network not found. Make sure the router is powered on.';
      } else if (friendlyMsg.includes('timed out') || friendlyMsg.includes('timeout')) {
        friendlyMsg = 'Connection timed out. Please bring the device closer to the Wi-Fi router.';
      } else if (friendlyMsg.includes('unreachable') || friendlyMsg.includes('Network verification failed')) {
        friendlyMsg = 'Could not reach device on the network.';
      }
      setErrorMessage(friendlyMsg);
      setCurrentStep('ERROR_STATE');
    }
  };

  // Legacy handler for BLE flow step 5
  const handleProvisionDevice = () => {
    handleProvisionDeviceDirect(selectedSsid, wifiPassword);
  };

  // Network verification
  const verifyDevice = async (ip: string) => {
    try {
      const info = await Esp32Service.verifyDeviceOverNetwork(ip);
      setVerifiedModel(info.model);

      // Save device into persistent multi-device store
      const newSavedDevice = {
        deviceId: info.deviceId,
        name: `${selectedProduct?.name || 'Washroom Safety Gadget'}`,
        model: info.model || 'WSG-01',
        room: customRoomName,
        ipAddress: ip,
        isOnline: true,
        lastSeen: 'Just now',
        firmwareVersion: info.firmware,
        sensor: info.sensor,
        connectionType: 'WIFI' as const,
      };

      addOrUpdateDevice(newSavedDevice);
      setActiveDeviceId(newSavedDevice.deviceId);

      // Update active app store
      setDeviceConfig({
        deviceId: newSavedDevice.deviceId,
        deviceName: `${newSavedDevice.name} — ${newSavedDevice.room}`,
        stillnessThreshold: 25,
        responseTimeout: 15,
        voiceDetectionEnabled: true,
        speakerEnabled: true,
        emergencyKeywords: ['HELP', 'EMERGENCY'],
        voiceSensitivity: 'Medium',
        emergencyEscalation: 'VOICE_AND_ALERT',
      });

      setTelemetry({
        deviceId: newSavedDevice.deviceId,
        timestamp: new Date().toISOString(),
        presence: true,
        movement: true,
        stillnessSeconds: 0,
        state: 'IDLE',
        voiceDetected: false,
        wifiRSSI: -52,
        uptime: 10,
        firmwareVersion: info.firmware,
      });

      setIsOnline(true);
      setIsSimulatorMode(false);

      setCurrentStep('SETUP_COMPLETE');
    } catch (verErr: any) {
      setErrorMessage(`Network verification failed: ${verErr.message}`);
      setCurrentStep('ERROR_STATE');
    }
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {/* Wizard Top Bar */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          onPress={() => {
            if (currentStep === 'PRODUCT_DETAILS') setCurrentStep('PRODUCT_SELECTION');
            else if (currentStep === 'BLUETOOTH_DISCOVERY') setCurrentStep('PRODUCT_DETAILS');
            else if (currentStep === 'WIFI_SCANNING') setCurrentStep('PRODUCT_DETAILS');
            else if (currentStep === 'WIFI_SETUP') setCurrentStep('PRODUCT_DETAILS');
            else onClose();
          }}
          style={styles.backBtn}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {currentStep === 'PRODUCT_SELECTION' && 'Choose Your Device'}
          {currentStep === 'PRODUCT_DETAILS' && 'Device Details'}
          {currentStep === 'BLUETOOTH_DISCOVERY' && 'Bluetooth Discovery'}
          {currentStep === 'BLE_CONNECTING' && 'Connecting to Device'}
          {currentStep === 'WIFI_SCANNING' && 'Wi-Fi Discovery'}
          {currentStep === 'WIFI_SETUP' && 'Connect Device to Wi-Fi'}
          {currentStep === 'PROVISIONING' && 'Provisioning Device'}
          {currentStep === 'DEVICE_VERIFICATION' && 'Verifying Hardware'}
          {currentStep === 'SETUP_COMPLETE' && 'Setup Complete'}
          {currentStep === 'ERROR_STATE' && 'Setup Issue'}
        </Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Progress Dots */}
      <View style={styles.stepProgressRow}>
        <View
          style={[
            styles.stepDot,
            (currentStep === 'PRODUCT_SELECTION' || currentStep === 'PRODUCT_DETAILS') && styles.stepDotActive,
          ]}
        />
        <View style={styles.stepConnector} />
        <View
          style={[
            styles.stepDot,
            (currentStep === 'BLUETOOTH_DISCOVERY' || currentStep === 'BLE_CONNECTING' || currentStep === 'WIFI_SCANNING') &&
              styles.stepDotActive,
          ]}
        />
        <View style={styles.stepConnector} />
        <View
          style={[
            styles.stepDot,
            (currentStep === 'WIFI_SETUP' || currentStep === 'PROVISIONING' || currentStep === 'DEVICE_VERIFICATION') &&
              styles.stepDotActive,
          ]}
        />
        <View style={styles.stepConnector} />
        <View style={[styles.stepDot, currentStep === 'SETUP_COMPLETE' && styles.stepDotActive]} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ========================================================================= */}
        {/* STEP 1: PRODUCT SELECTION */}
        {/* ========================================================================= */}
        {currentStep === 'PRODUCT_SELECTION' && (
          <View>
            <Text style={styles.sectionHeadline}>Select a device to add</Text>
            <Text style={styles.sectionSubtitle}>
              Make sure your device is powered on and within 5 meters of your phone/computer.
            </Text>

            {/* Category Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text
                    style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Product Cards */}
            {filteredProducts.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={styles.productCard}
                onPress={() => handleSelectProduct(product)}
                activeOpacity={0.85}
              >
                <Image source={product.image} style={styles.productThumbnail} resizeMode="contain" />
                <View style={styles.productCardInfo}>
                  <View style={styles.modelBadgeRow}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <View style={styles.modelBadge}>
                      <Text style={styles.modelBadgeText}>{product.model}</Text>
                    </View>
                  </View>
                  <Text style={styles.productTagline} numberOfLines={2}>
                    {product.tagline}
                  </Text>
                  <View style={styles.featureTagsRow}>
                    <View style={styles.featureTag}>
                      <Eye size={12} color={colors.primary} />
                      <Text style={styles.featureTagText}>24GHz Radar</Text>
                    </View>
                    <View style={styles.featureTag}>
                      <Activity size={12} color="#059669" />
                      <Text style={styles.featureTagText}>Stillness Monitor</Text>
                    </View>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: PRODUCT DETAILS */}
        {/* ========================================================================= */}
        {currentStep === 'PRODUCT_DETAILS' && selectedProduct && (
          <View>
            <View style={styles.heroImageContainer}>
              <Image source={selectedProduct.image} style={styles.heroProductImage} resizeMode="contain" />
            </View>

            <View style={styles.detailsHeader}>
              <View style={styles.modelPillBig}>
                <Text style={styles.modelPillBigText}>{selectedProduct.model}</Text>
              </View>
              <Text style={styles.detailsTitle}>{selectedProduct.name}</Text>
              <Text style={styles.detailsDescription}>{selectedProduct.description}</Text>
            </View>

            {/* Features Checklist */}
            <Text style={styles.featuresHeading}>Key Capabilities</Text>
            <View style={styles.featuresList}>
              {selectedProduct.features.map((feat, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <View style={styles.featureIconWrap}>
                    <CheckCircle size={18} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featureTitle}>{feat.title}</Text>
                    <Text style={styles.featureDesc}>{feat.description}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Hardware Specifications */}
            <Text style={styles.featuresHeading}>Hardware Specifications</Text>
            <View style={styles.specsCard}>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Microcontroller</Text>
                <Text style={styles.specValue}>{selectedProduct.specs.mcu}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Presence Sensor</Text>
                <Text style={styles.specValue}>{selectedProduct.specs.radarSensor}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Connectivity</Text>
                <Text style={styles.specValue}>{selectedProduct.specs.connectivity}</Text>
              </View>
              <View style={styles.specItem}>
                <Text style={styles.specLabel}>Detection Zone</Text>
                <Text style={styles.specValue}>{selectedProduct.specs.detectionRange}</Text>
              </View>
            </View>

            {/* Connection Method Selector */}
            <View style={styles.methodSelectorCard}>
              <Text style={styles.methodSelectorHeading}>Connection Method</Text>
              <View style={styles.methodTabsRow}>
                <TouchableOpacity
                  style={[
                    styles.methodTab,
                    connectionMethod === 'BLUETOOTH' && styles.methodTabActive,
                  ]}
                  onPress={() => setConnectionMethod('BLUETOOTH')}
                  activeOpacity={0.85}
                >
                  <Bluetooth
                    size={18}
                    color={connectionMethod === 'BLUETOOTH' ? '#FFFFFF' : colors.textPrimary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.methodTabText,
                      connectionMethod === 'BLUETOOTH' && styles.methodTabTextActive,
                    ]}
                  >
                    Bluetooth
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.methodTab,
                    connectionMethod === 'WIFI' && styles.methodTabActive,
                  ]}
                  onPress={() => setConnectionMethod('WIFI')}
                  activeOpacity={0.85}
                >
                  <Wifi
                    size={18}
                    color={connectionMethod === 'WIFI' ? '#FFFFFF' : colors.textPrimary}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.methodTabText,
                      connectionMethod === 'WIFI' && styles.methodTabTextActive,
                    ]}
                  >
                    Wi-Fi
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.methodTabDesc}>
                {connectionMethod === 'BLUETOOTH'
                  ? 'Fast local hardware discovery and BLE GATT pairing.'
                  : 'Connect gadget to your 2.4GHz Wi-Fi for real-time safety telemetry and sync.'}
              </Text>
            </View>

            {/* Action CTA depending on selected connection method */}
            {connectionMethod === 'BLUETOOTH' ? (
              <TouchableOpacity
                style={styles.connectPrimaryBtn}
                onPress={handleStartBluetoothScan}
                activeOpacity={0.85}
              >
                <Bluetooth size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.connectPrimaryBtnText}>Connect This Device</Text>
                <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.connectPrimaryBtn}
                onPress={handleStartWifiFlow}
                activeOpacity={0.85}
              >
                <Wifi size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.connectPrimaryBtnText}>Setup via Wi-Fi</Text>
                <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: BLUETOOTH DISCOVERY (100% Untouched) */}
        {/* ========================================================================= */}
        {currentStep === 'BLUETOOTH_DISCOVERY' && selectedProduct && (
          <View style={styles.centerContainer}>
            {!isBluetoothEnabled ? (
              <View style={styles.errorBox}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
                  <BluetoothOff size={40} color="#DC2626" />
                </View>
                <Text style={styles.errorTitle}>Bluetooth is turned off</Text>
                <Text style={styles.errorDesc}>
                  Please turn on Bluetooth in your device settings so we can discover your{' '}
                  {selectedProduct.name}.
                </Text>
                <TouchableOpacity style={styles.turnOnBtn} onPress={handleTurnOnBluetooth}>
                  <Text style={styles.turnOnBtnText}>Turn On Bluetooth</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelScanBtn, { marginTop: 12 }]}
                  onPress={handleStartBluetoothScan}
                >
                  <RefreshCw size={14} color={colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.cancelScanText}>I've Turned It On, Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : discoveredDevice ? (
              <View style={{ width: '100%' }}>
                <View style={styles.foundBadge}>
                  <Sparkles size={18} color="#059669" />
                  <Text style={styles.foundBadgeText}>Device Found!</Text>
                </View>

                <View style={styles.foundDeviceCard}>
                  <Image source={selectedProduct.image} style={styles.foundDeviceThumb} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.foundDeviceName}>{discoveredDevice.name}</Text>
                    <Text style={styles.foundDeviceModel}>Model: {selectedProduct.model}</Text>
                    <View style={styles.signalPill}>
                      <Radio size={13} color="#059669" />
                      <Text style={styles.signalPillText}>Signal: {discoveredDevice.rssi} dBm</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity style={styles.connectPrimaryBtn} onPress={handleConnectBle}>
                  <Text style={styles.connectPrimaryBtnText}>Connect</Text>
                  <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems: 'center', width: '100%' }}>
                <View style={styles.radarWrapper}>
                  <Animated.View style={[styles.radarWave, { transform: [{ scale: pulseAnim }] }]} />
                  <View style={styles.radarCenter}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <Bluetooth size={38} color={colors.primary} />
                    </Animated.View>
                  </View>
                </View>

                <Text style={styles.scanningTitle}>Looking for your {selectedProduct.name}</Text>
                <Text style={styles.scanningSubtitle}>
                  Searching for {selectedProduct.model} via BLE service UUID ({selectedProduct.bleServiceUuid.slice(0, 8)}...).
                  Make sure your device is powered on and nearby.
                </Text>

                {errorMessage ? (
                  <View style={styles.inlineWarning}>
                    <AlertTriangle size={16} color="#B45309" />
                    <Text style={styles.inlineWarningText}>{errorMessage}</Text>
                  </View>
                ) : null}

                <TouchableOpacity style={styles.cancelScanBtn} onPress={handleStartBluetoothScan}>
                  <RefreshCw size={14} color={colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.cancelScanText}>Rescan</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 4: BLE CONNECTING HANDSHAKE (100% Untouched) */}
        {/* ========================================================================= */}
        {currentStep === 'BLE_CONNECTING' && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.lg }} />
            <Text style={styles.scanningTitle}>Establishing Secure BLE Connection...</Text>
            <Text style={styles.scanningSubtitle}>
              Connecting to GATT server, discovering primary services, and validating device identity.
            </Text>
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP: WI-FI DISCOVERY & REAL SCANNING */}
        {/* ========================================================================= */}
        {currentStep === 'WIFI_SCANNING' && (
          <View>
            {/* If Wi-Fi is turned off */}
            {isWifiTurnedOff ? (
              <View style={styles.errorBox}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
                  <WifiOff size={44} color="#DC2626" />
                </View>
                <Text style={styles.errorTitle}>Wi-Fi is Turned Off</Text>
                <Text style={styles.errorDesc}>
                  Your device's Wi-Fi is currently turned off. Please turn on Wi-Fi on your phone/computer so we can scan for available networks and pair your {selectedProduct?.name || 'safety gadget'}.
                </Text>
                <TouchableOpacity style={styles.turnOnBtn} onPress={handleTurnOnWifi}>
                  <Wifi size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.turnOnBtnText}>Turn On Wi-Fi</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cancelScanBtn, { marginTop: 12, backgroundColor: '#EFF6FF', borderColor: colors.primary }]}
                  onPress={handleStartWifiFlow}
                >
                  <RefreshCw size={14} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.cancelScanText, { color: colors.primary, fontWeight: '700' }]}>
                    I've Turned It On, Try Again
                  </Text>
                </TouchableOpacity>

                <View style={styles.autoContinueNotice}>
                  <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.autoContinueText}>
                    Detecting Wi-Fi status... When enabled, scanning will continue automatically.
                  </Text>
                </View>
              </View>
            ) : wifiPermissionDenied ? (
              /* Android runtime permissions denied */
              <View style={styles.errorBox}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <ShieldCheck size={40} color="#D97706" />
                </View>
                <Text style={styles.errorTitle}>Wi-Fi Permission Required</Text>
                <Text style={styles.errorDesc}>
                  Android requires Wi-Fi and location permissions to scan for nearby safety gadgets and 2.4GHz routers.
                </Text>
                <TouchableOpacity
                  style={[styles.turnOnBtn, { backgroundColor: colors.primary }]}
                  onPress={() => WifiService.openAppSettings()}
                >
                  <Text style={styles.turnOnBtnText}>Open App Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.cancelScanBtn, { marginTop: 12 }]}
                  onPress={handleStartWifiFlow}
                >
                  <RefreshCw size={14} color={colors.primary} style={{ marginRight: 4 }} />
                  <Text style={styles.cancelScanText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : isScanningWifi ? (
              /* Real Wi-Fi Scanning Animation */
              <View style={styles.centerContainer}>
                <View style={styles.radarWrapper}>
                  <Animated.View style={[styles.radarWave, { transform: [{ scale: pulseAnim }] }]} />
                  <View style={styles.radarCenter}>
                    <Animated.View style={{ transform: [{ rotate: spin }] }}>
                      <Wifi size={38} color={colors.primary} />
                    </Animated.View>
                  </View>
                </View>

                <Text style={styles.scanningTitle}>Searching for Wi-Fi networks...</Text>
                <Text style={styles.scanningSubtitle}>
                  Scanning for in-range 2.4GHz Wi-Fi networks nearby.
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.lg }}>
                  <TouchableOpacity style={styles.cancelScanBtn} onPress={startWifiScan}>
                    <RefreshCw size={14} color={colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.cancelScanText}>Scan Again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cancelScanBtn, { backgroundColor: '#FEE2E2' }]}
                    onPress={stopWifiScan}
                  >
                    <Text style={[styles.cancelScanText, { color: '#DC2626' }]}>Stop Scanning</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              /* Scan Results */
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={styles.sectionHeadline}>Select Wi-Fi Network</Text>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 }}
                    onPress={startWifiScan}
                  >
                    <RefreshCw size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Scan Again</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sectionSubtitle}>
                  Choose your home or facility 2.4GHz Wi-Fi network to connect your {selectedProduct?.name}.
                </Text>

                {wifiNetworks.length === 0 ? (
                  <View style={[styles.errorBox, { marginTop: spacing.md }]}>
                    <Text style={styles.errorTitle}>No Networks Found</Text>
                    <Text style={styles.errorDesc}>
                      Make sure your 2.4GHz Wi-Fi router is broadcasting and within range.
                    </Text>
                    <TouchableOpacity style={styles.connectPrimaryBtn} onPress={startWifiScan}>
                      <RefreshCw size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.connectPrimaryBtnText}>Scan Again</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    {wifiNetworks.map((net) => (
                      <TouchableOpacity
                        key={net.ssid}
                        style={[
                          styles.networkItem,
                          selectedSsid === net.ssid && styles.networkItemSelected,
                        ]}
                        onPress={() => handleSelectNetwork(net)}
                        activeOpacity={0.8}
                      >
                        <Wifi size={20} color={selectedSsid === net.ssid ? colors.primary : '#475569'} />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.networkSsid,
                              selectedSsid === net.ssid && { color: colors.primary, fontWeight: '700' },
                            ]}
                          >
                            {net.ssid}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {/* Signal Rating Pill */}
                            <View
                              style={[
                                styles.signalRatingBadge,
                                net.signalLevel === 'Excellent' && styles.signalRatingBadgeGreen,
                                net.signalLevel === 'Good' && styles.signalRatingBadgeBlue,
                                net.signalLevel === 'Fair' && styles.signalRatingBadgeAmber,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.signalRatingText,
                                  net.signalLevel === 'Excellent' && { color: '#047857' },
                                  net.signalLevel === 'Good' && { color: '#0284C7' },
                                  net.signalLevel === 'Fair' && { color: '#B45309' },
                                ]}
                              >
                                ● {net.signalLevel} ({net.rssi} dBm)
                              </Text>
                            </View>

                            {/* Security Type */}
                            <View style={styles.securityBadge}>
                              <Text style={styles.securityBadgeText}>{net.security}</Text>
                            </View>
                          </View>
                        </View>

                        {net.security !== 'OPEN' ? (
                          <Lock size={16} color="#64748B" />
                        ) : (
                          <Text style={{ fontSize: 11, color: '#059669', fontWeight: '600' }}>OPEN</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 5: WI-FI SETUP (Manual / BLE Fallback) */}
        {/* ========================================================================= */}
        {currentStep === 'WIFI_SETUP' && (
          <View>
            <Text style={styles.sectionHeadline}>Connect Your Device to Wi-Fi</Text>
            <Text style={styles.sectionSubtitle}>
              The ESP32 uses 2.4GHz Wi-Fi to sync emergency alerts and safety status in real time.
            </Text>

            {!isWifiEnabled ? (
              <View style={styles.errorBox}>
                <WifiOff size={38} color="#DC2626" />
                <Text style={styles.errorTitle}>Wi-Fi is turned off</Text>
                <Text style={styles.errorDesc}>
                  Please turn on Wi-Fi so the gadget can discover your local network.
                </Text>
                <TouchableOpacity style={styles.turnOnBtn} onPress={handleTurnOnWifi}>
                  <Text style={styles.turnOnBtnText}>Turn On Wi-Fi</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {/* Available Networks List */}
                {wifiNetworks.length > 0 && (
                  <View style={{ marginBottom: spacing.md }}>
                    <Text style={styles.inputLabel}>Available 2.4GHz Networks</Text>
                    {wifiNetworks.map((net) => (
                      <TouchableOpacity
                        key={net.ssid}
                        style={[
                          styles.networkItem,
                          selectedSsid === net.ssid && styles.networkItemSelected,
                        ]}
                        onPress={() => setSelectedSsid(net.ssid)}
                      >
                        <Wifi size={18} color={selectedSsid === net.ssid ? colors.primary : '#64748B'} />
                        <Text
                          style={[
                            styles.networkSsid,
                            selectedSsid === net.ssid && { color: colors.primary, fontWeight: '700' },
                          ]}
                        >
                          {net.ssid}
                        </Text>
                        <Text style={styles.networkSignal}>{net.rssi} dBm</Text>
                        {net.security !== 'OPEN' && <Lock size={14} color="#64748B" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Wi-Fi SSID input */}
                <Text style={styles.inputLabel}>Wi-Fi Network Name (SSID)</Text>
                <TextInput
                  style={styles.textInput}
                  value={selectedSsid}
                  onChangeText={setSelectedSsid}
                  placeholder="e.g. MyHome_2.4G"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                />

                {/* Password input */}
                <Text style={styles.inputLabel}>Wi-Fi Password</Text>
                <View style={styles.passwordInputWrap}>
                  <TextInput
                    style={[styles.textInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                    value={wifiPassword}
                    onChangeText={setWifiPassword}
                    placeholder="Enter network password"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 8 }}>
                    <Text style={{ fontSize: 12, color: colors.primary, fontWeight: '600' }}>
                      {showPassword ? 'Hide' : 'Show'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Room tagging */}
                <Text style={styles.inputLabel}>Assign Room</Text>
                <TextInput
                  style={styles.textInput}
                  value={customRoomName}
                  onChangeText={setCustomRoomName}
                  placeholder="e.g. Master Bathroom, Guest Bathroom"
                  placeholderTextColor={colors.textSecondary}
                />

                <TouchableOpacity
                  style={[styles.connectPrimaryBtn, { marginTop: spacing.md }]}
                  onPress={handleProvisionDevice}
                >
                  <Text style={styles.connectPrimaryBtnText}>Provision &amp; Connect</Text>
                  <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 6: 4-STEP PROVISIONING & HARDWARE VERIFICATION */}
        {/* ========================================================================= */}
        {(currentStep === 'PROVISIONING' || currentStep === 'DEVICE_VERIFICATION') && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: spacing.lg }} />
            <Text style={styles.scanningTitle}>
              {currentStep === 'PROVISIONING' ? 'Connecting Gadget to Wi-Fi...' : 'Verifying Hardware over Network...'}
            </Text>
            <Text style={styles.scanningSubtitle}>
              {provisioningStatusText || 'Communicating with safety device...'}
            </Text>

            {/* 4-Step Visual Progress */}
            <View style={styles.provStepsContainer}>
              <View style={styles.provStepRow}>
                <View style={styles.provStepIcon}>
                  {provisionStepNumber > 1 ? (
                    <CheckCircle size={18} color="#059669" />
                  ) : provisionStepNumber === 1 ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <View style={styles.provPendingDot} />
                  )}
                </View>
                <Text
                  style={[
                    styles.provStepText,
                    provisionStepNumber === 1 && styles.provStepTextActive,
                    provisionStepNumber > 1 && styles.provStepTextDone,
                  ]}
                >
                  Step 1: Sending Wi-Fi configuration to device...
                </Text>
              </View>

              <View style={styles.provStepRow}>
                <View style={styles.provStepIcon}>
                  {provisionStepNumber > 2 ? (
                    <CheckCircle size={18} color="#059669" />
                  ) : provisionStepNumber === 2 ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <View style={styles.provPendingDot} />
                  )}
                </View>
                <Text
                  style={[
                    styles.provStepText,
                    provisionStepNumber === 2 && styles.provStepTextActive,
                    provisionStepNumber > 2 && styles.provStepTextDone,
                  ]}
                >
                  Step 2: Connecting gadget to home router...
                </Text>
              </View>

              <View style={styles.provStepRow}>
                <View style={styles.provStepIcon}>
                  {provisionStepNumber > 3 ? (
                    <CheckCircle size={18} color="#059669" />
                  ) : provisionStepNumber === 3 ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <View style={styles.provPendingDot} />
                  )}
                </View>
                <Text
                  style={[
                    styles.provStepText,
                    provisionStepNumber === 3 && styles.provStepTextActive,
                    provisionStepNumber > 3 && styles.provStepTextDone,
                  ]}
                >
                  Step 3: Waiting for IP assignment...
                </Text>
              </View>

              <View style={styles.provStepRow}>
                <View style={styles.provStepIcon}>
                  {provisionStepNumber >= 4 ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <View style={styles.provPendingDot} />
                  )}
                </View>
                <Text
                  style={[
                    styles.provStepText,
                    provisionStepNumber === 4 && styles.provStepTextActive,
                  ]}
                >
                  Step 4: Verifying device communication...
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* STEP 7: SETUP COMPLETE */}
        {/* ========================================================================= */}
        {currentStep === 'SETUP_COMPLETE' && selectedProduct && (
          <View style={styles.centerContainer}>
            <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
              <CheckCircle size={56} color="#059669" />
            </View>
            <Text style={styles.successTitle}>Wi-Fi Connected</Text>
            <Text style={styles.successSubtitle}>
              Your {selectedProduct.name} ({verifiedModel || selectedProduct.model}) is successfully connected
              to Wi-Fi and actively monitoring for stillness.
            </Text>

            <View style={styles.verifiedCard}>
              <View style={styles.verifiedRow}>
                <Text style={styles.verifiedLabel}>Device Name:</Text>
                <Text style={styles.verifiedVal}>{selectedProduct.name}</Text>
              </View>
              <View style={styles.verifiedRow}>
                <Text style={styles.verifiedLabel}>Model:</Text>
                <Text style={styles.verifiedVal}>{selectedProduct.model}</Text>
              </View>
              <View style={styles.verifiedRow}>
                <Text style={styles.verifiedLabel}>Location:</Text>
                <Text style={styles.verifiedVal}>{customRoomName}</Text>
              </View>
              <View style={styles.verifiedRow}>
                <Text style={styles.verifiedLabel}>Presence Sensor:</Text>
                <Text style={[styles.verifiedVal, { color: '#059669' }]}>LD2410C (Online)</Text>
              </View>
              <View style={styles.verifiedRow}>
                <Text style={styles.verifiedLabel}>IP Address:</Text>
                <Text style={styles.verifiedVal}>{assignedIp || 'Not Assigned'}</Text>
              </View>
              <View style={styles.verifiedRow}>
                <Text style={styles.verifiedLabel}>Connection:</Text>
                <Text style={styles.verifiedVal}>Wi-Fi 2.4GHz</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.connectPrimaryBtn} onPress={onComplete}>
              <Text style={styles.connectPrimaryBtnText}>Go to Dashboard</Text>
              <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* ========================================================================= */}
        {/* ERROR STATE */}
        {/* ========================================================================= */}
        {currentStep === 'ERROR_STATE' && (
          <View style={styles.centerContainer}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
              <AlertTriangle size={48} color="#DC2626" />
            </View>
            <Text style={styles.errorTitle}>Connection Issue</Text>
            <Text style={styles.errorDesc}>{errorMessage || 'An error occurred during setup.'}</Text>

            <View style={styles.retryBtnRow}>
              <TouchableOpacity
                style={[styles.connectPrimaryBtn, { flex: 1, marginRight: 8 }]}
                onPress={() => {
                  if (selectedSsid) {
                    handleProvisionDeviceDirect(selectedSsid, wifiPassword);
                  } else {
                    handleStartWifiFlow();
                  }
                }}
              >
                <RefreshCw size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.connectPrimaryBtnText}>Try Again</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryActionBtn}
                onPress={() => {
                  setPasswordModalVisible(false);
                  setCurrentStep('WIFI_SCANNING');
                  startWifiScan();
                }}
              >
                <Text style={styles.secondaryActionBtnText}>Choose Another Network</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ========================================================================= */}
      {/* PASSWORD ENTRY MODAL / DIALOG */}
      {/* ========================================================================= */}
      {passwordModalVisible && selectedNetwork && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Lock size={20} color={colors.primary} />
                <Text style={styles.modalTitle}>{selectedNetwork.ssid}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPasswordModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              {selectedNetwork.security} Network • Signal: {selectedNetwork.signalLevel} ({selectedNetwork.rssi} dBm)
            </Text>

            {/* Password input */}
            <Text style={styles.inputLabel}>Wi-Fi Password</Text>
            <View
              style={[
                styles.passwordInputWrap,
                passwordValidationError ? { borderColor: '#DC2626' } : {},
              ]}
            >
              <TextInput
                style={[styles.textInput, { flex: 1, marginBottom: 0, borderWidth: 0 }]}
                value={wifiPassword}
                onChangeText={(t) => {
                  setWifiPassword(t);
                  if (passwordValidationError) setPasswordValidationError('');
                }}
                placeholder="Enter network password"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 8 }}>
                {showPassword ? (
                  <EyeOff size={18} color={colors.textSecondary} />
                ) : (
                  <Eye size={18} color={colors.textSecondary} />
                )}
              </TouchableOpacity>
            </View>

            {passwordValidationError ? (
              <Text style={styles.passwordErrorText}>{passwordValidationError}</Text>
            ) : null}

            {/* Room assignment */}
            <Text style={styles.inputLabel}>Assign Room</Text>
            <TextInput
              style={styles.textInput}
              value={customRoomName}
              onChangeText={setCustomRoomName}
              placeholder="e.g. Master Bathroom, Guest Bathroom"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={styles.passwordSecurityNote}>
              🔒 Wi-Fi passwords are transmitted securely to the device and never logged in plain text.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: spacing.lg }}>
              <TouchableOpacity
                style={[styles.cancelScanBtn, { flex: 1, justifyContent: 'center' }]}
                onPress={() => setPasswordModalVisible(false)}
              >
                <Text style={styles.cancelScanText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.connectPrimaryBtn, { flex: 1.5 }]}
                onPress={handleConfirmPasswordAndConnect}
              >
                <Text style={styles.connectPrimaryBtnText}>Connect</Text>
                <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: 6 },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  closeBtn: { padding: 6 },
  closeBtnText: { color: colors.textSecondary, fontWeight: '600' },
  stepProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E2E8F0',
  },
  stepDotActive: {
    backgroundColor: colors.primary,
    width: 20,
    borderRadius: 5,
  },
  stepConnector: {
    width: 32,
    height: 2,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 2,
  },
  sectionHeadline: { ...typography.h2, color: colors.textPrimary, marginBottom: 4 },
  sectionSubtitle: { ...typography.body2, color: colors.textSecondary, marginBottom: spacing.lg },
  categoryScroll: { flexDirection: 'row', marginBottom: spacing.lg },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: { ...typography.caption, fontWeight: '700', color: colors.textSecondary },
  categoryTextActive: { color: '#FFFFFF' },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  productThumbnail: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.md,
    marginRight: spacing.md,
  },
  productCardInfo: { flex: 1 },
  modelBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  productName: { ...typography.body1, fontWeight: '700', color: colors.textPrimary },
  modelBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modelBadgeText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  productTagline: { ...typography.caption, color: colors.textSecondary, marginBottom: 6 },
  featureTagsRow: { flexDirection: 'row', gap: 6 },
  featureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  featureTagText: { fontSize: 10, fontWeight: '600', color: '#475569' },
  heroImageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroProductImage: {
    width: 220,
    height: 220,
  },
  detailsHeader: { marginBottom: spacing.lg },
  modelPillBig: {
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  modelPillBigText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  detailsTitle: { ...typography.h2, color: colors.textPrimary, marginBottom: 6 },
  detailsDescription: { ...typography.body2, color: colors.textSecondary, lineHeight: 20 },
  featuresHeading: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md, marginTop: spacing.md },
  featuresList: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  featureIconWrap: { marginTop: 2 },
  featureTitle: { ...typography.body2, fontWeight: '700', color: colors.textPrimary },
  featureDesc: { ...typography.caption, color: colors.textSecondary },
  specsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: 8,
  },
  specItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  specLabel: { ...typography.caption, color: colors.textSecondary },
  specValue: { ...typography.caption, fontWeight: '600', color: colors.textPrimary },
  connectPrimaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    width: '100%',
  },
  connectPrimaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  radarWrapper: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  radarWave: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: 'rgba(2, 132, 199, 0.25)',
    backgroundColor: 'rgba(2, 132, 199, 0.06)',
  },
  radarCenter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  scanningTitle: { ...typography.h3, color: colors.textPrimary, textAlign: 'center', marginBottom: 6 },
  scanningSubtitle: { ...typography.body2, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.md, lineHeight: 20 },
  cancelScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: borderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  cancelScanText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  foundBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  foundBadgeText: { fontSize: 13, fontWeight: '700', color: '#047857' },
  foundDeviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  foundDeviceThumb: { width: 64, height: 64, marginRight: spacing.md },
  foundDeviceName: { ...typography.body1, fontWeight: '700', color: colors.textPrimary },
  foundDeviceModel: { ...typography.caption, color: colors.textSecondary, marginVertical: 2 },
  signalPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  signalPillText: { fontSize: 11, fontWeight: '600', color: '#059669' },
  errorBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  errorTitle: { ...typography.h3, color: '#DC2626', marginBottom: 6 },
  errorDesc: { ...typography.body2, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  turnOnBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  turnOnBtnText: { color: '#FFFFFF', fontWeight: '700' },
  inputLabel: { ...typography.caption, fontWeight: '700', color: colors.textPrimary, marginBottom: 6, marginTop: spacing.md },
  textInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  networkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: 12,
    marginBottom: 6,
    gap: 10,
  },
  networkItemSelected: {
    borderColor: colors.primary,
    backgroundColor: '#EFF6FF',
  },
  networkSsid: { flex: 1, ...typography.body2, color: colors.textPrimary },
  networkSignal: { fontSize: 11, color: colors.textSecondary },
  successTitle: { ...typography.h2, color: '#059669', marginBottom: 6 },
  successSubtitle: { ...typography.body2, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  verifiedCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  verifiedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  verifiedLabel: { ...typography.caption, color: colors.textSecondary },
  verifiedVal: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
  inlineWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  inlineWarningText: { fontSize: 12, color: '#92400E' },
  methodSelectorCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodSelectorHeading: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  methodTabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.sm,
  },
  methodTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
  },
  methodTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  methodTabText: {
    ...typography.body2,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  methodTabTextActive: {
    color: '#FFFFFF',
  },
  methodTabDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    zIndex: 1000,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  passwordErrorText: {
    fontSize: 12,
    color: '#DC2626',
    marginBottom: spacing.sm,
    fontWeight: '600',
  },
  passwordSecurityNote: {
    fontSize: 11,
    color: '#059669',
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  provStepsContainer: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  provStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  provStepIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  provPendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  provStepText: {
    ...typography.body2,
    color: colors.textSecondary,
    flex: 1,
  },
  provStepTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  provStepTextDone: {
    color: '#059669',
    fontWeight: '600',
  },
  retryBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    width: '100%',
  },
  secondaryActionBtn: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  signalRatingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: '#F1F5F9',
  },
  signalRatingBadgeGreen: {
    backgroundColor: '#ECFDF5',
  },
  signalRatingBadgeBlue: {
    backgroundColor: '#EFF6FF',
  },
  signalRatingBadgeAmber: {
    backgroundColor: '#FEF3C7',
  },
  signalRatingText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  securityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
  },
  securityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  autoContinueNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
    width: '100%',
  },
  autoContinueText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
    flex: 1,
  },
});
