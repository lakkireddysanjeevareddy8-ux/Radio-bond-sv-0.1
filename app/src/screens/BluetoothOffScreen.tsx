import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import { BluetoothService } from '../services/bluetoothService';

interface BluetoothOffScreenProps {
  appName?: string;
  onTurnedOn?: () => void;
  onLater?: () => void;
  showSystemPrompt?: boolean;
}

export const BluetoothOffScreen: React.FC<BluetoothOffScreenProps> = ({
  appName = 'Washroom Safety Gadget',
  onTurnedOn,
  onLater,
  showSystemPrompt = true,
}) => {
  const [askingPermission, setAskingPermission] = useState<boolean>(showSystemPrompt);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const isTablet = width >= 600;
  const isCompactMobile = height < 700;

  // Listen for AppState changes when returning from Android Bluetooth Settings
  useEffect(() => {
    let isMounted = true;

    const checkStateAndNotify = async () => {
      const effectiveState = await BluetoothService.getEffectiveBluetoothState();
      if (effectiveState === 'on' && isMounted && onTurnedOn) {
        onTurnedOn();
      }
    };

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkStateAndNotify();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Also listen to central BluetoothService state events (e.g. real adapter change or dev simulation toggle)
    const unsubBtListener = BluetoothService.addBluetoothStateListener((effectiveState) => {
      if (effectiveState === 'on' && isMounted && onTurnedOn) {
        onTurnedOn();
      }
    });

    // Initial check on mount
    checkStateAndNotify();

    return () => {
      isMounted = false;
      subscription.remove();
      unsubBtListener();
    };
  }, [onTurnedOn]);

  const handleTurnOn = async () => {
    // 1. Check if Bluetooth is already ON
    const effectiveState = await BluetoothService.getEffectiveBluetoothState();
    if (effectiveState === 'on') {
      if (onTurnedOn) onTurnedOn();
      return;
    }

    // 2. If fake simulation is currently active in development, allow clearing it
    if (BluetoothService.isFakeBluetoothOff()) {
      BluetoothService.setFakeBluetoothOff(false);
      const realState = await BluetoothService.getRealBluetoothState();
      if (realState === 'on') {
        if (onTurnedOn) onTurnedOn();
        return;
      }
    }

    // 3. Open official Android / iOS / OS Bluetooth settings
    BluetoothService.openSystemBluetoothSettings();
  };

  const handleAllow = () => {
    setAskingPermission(false);
    handleTurnOn();
  };

  const handleDeny = () => {
    setAskingPermission(false);
    if (onLater) {
      onLater();
    }
  };

  // Scale emblem smoothly on compact mobile screens vs tablet
  const emblemSize = isCompactMobile ? 150 : isTablet ? 190 : 170;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 20),
        },
      ]}
    >
      <View style={[styles.content, { maxWidth: isTablet ? 500 : 420 }]}>
        {/* Soft Circular Gradient Bluetooth-Off Emblem */}
        <View
          style={[
            styles.emblemContainer,
            { marginBottom: isCompactMobile ? 24 : 36 },
          ]}
        >
          <Svg
            width={emblemSize}
            height={emblemSize}
            viewBox="0 0 180 180"
          >
            <Defs>
              {/* Outer soft halo gradient */}
              <LinearGradient id="haloGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#DDD6FE" stopOpacity="0.65" />
                <Stop offset="100%" stopColor="#F5D0FE" stopOpacity="0.45" />
              </LinearGradient>

              {/* Inner vibrant gradient */}
              <LinearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#A855F7" />
                <Stop offset="100%" stopColor="#C084FC" />
              </LinearGradient>
            </Defs>

            {/* Outer halo */}
            <Circle cx="90" cy="90" r="82" fill="url(#haloGrad)" />

            {/* Inner circle */}
            <Circle cx="90" cy="90" r="54" fill="url(#circleGrad)" />

            {/* Crossed-out Bluetooth Symbol */}
            <Path
              d="M90 62 L90 118 M90 62 L106 76 L90 90 L106 104 L90 118"
              stroke="#FFFFFF"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Left barbs */}
            <Path
              d="M90 76 L78 88"
              stroke="#FFFFFF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            {/* Slash line through Bluetooth */}
            <Path
              d="M72 108 L108 72"
              stroke="#FFFFFF"
              strokeWidth="3.8"
              strokeLinecap="round"
            />
          </Svg>
        </View>

        {/* Title */}
        <Text style={[styles.title, isCompactMobile && { fontSize: 24, marginBottom: 8 }]}>
          Bluetooth is Off
        </Text>

        {/* Subtitle */}
        <Text
          style={[
            styles.subtitle,
            isCompactMobile && { fontSize: 14, marginBottom: 32 },
          ]}
        >
          Turn on Bluetooth to connect your WSG-01 device.
        </Text>

        {/* Action Buttons */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleTurnOn}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Turn on Bluetooth</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onLater}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Android/Tablet Floating Permission Bottom Card */}
      {askingPermission && (
        <View
          style={[
            styles.bottomCardOverlay,
            { bottom: Math.max(insets.bottom + 16, 20) },
          ]}
        >
          <View style={[styles.bottomCard, { maxWidth: isTablet ? 480 : 380 }]}>
            <Text style={styles.bottomCardText}>
              {appName} is asking to turn on Bluetooth.
            </Text>
            <View style={styles.bottomActions}>
              <TouchableOpacity
                style={styles.bottomActionBtn}
                onPress={handleDeny}
                activeOpacity={0.7}
              >
                <Text style={styles.bottomActionText}>Deny</Text>
              </TouchableOpacity>
              <View style={styles.bottomDivider} />
              <TouchableOpacity
                style={styles.bottomActionBtn}
                onPress={handleAllow}
                activeOpacity={0.7}
              >
                <Text style={styles.bottomActionText}>Allow</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emblemContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 290,
    marginBottom: 44,
  },
  buttonGroup: {
    width: '100%',
    maxWidth: 320,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#0F172A',
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#94A3B8',
    borderWidth: 1,
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  bottomCardOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  bottomCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 22,
    paddingBottom: 14,
    paddingHorizontal: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bottomCardText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '500',
    textAlign: 'left',
    marginBottom: 20,
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  bottomActionBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  bottomDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
  },
});
