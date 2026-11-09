import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { AlertTriangle, X, HelpCircle } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { borderRadius, spacing, colors } from '../utils/theme';
import { strings } from '../constants/strings';

export const DeviceErrorBanner: React.FC = () => {
  const deviceError = useAppStore((s) => s.deviceError);
  const setDeviceError = useAppStore((s) => s.setDeviceError);

  useEffect(() => {
    if (!deviceError) return;
    // Auto-dismiss after 15 seconds if not dismissed manually
    const timer = setTimeout(() => {
      setDeviceError(null);
    }, 15000);
    return () => clearTimeout(timer);
  }, [deviceError, setDeviceError]);

  if (!deviceError) return null;

  // Determine friendly what-to-do guidance based on error code or message
  const getWhatToDo = (): string => {
    const code = (deviceError.code || '').toUpperCase();
    const msg = (deviceError.message || '').toLowerCase();

    if (code.includes('AUTH') || msg.includes('password')) {
      return strings.errors.wrongPassword.whatToDo;
    }
    if (code.includes('5G') || msg.includes('5 ghz') || msg.includes('5ghz')) {
      return strings.errors.fiveGhzNetwork.whatToDo;
    }
    if (code.includes('NO_SSID') || msg.includes('ssid')) {
      return strings.errors.deviceNotFound.whatToDo;
    }
    if (code.includes('BLE_OFF') || msg.includes('bluetooth')) {
      return strings.errors.bluetoothOff.whatToDo;
    }
    if (code.includes('TIMEOUT') || msg.includes('timeout')) {
      return strings.errors.wifiTimeout.whatToDo;
    }
    if (code.includes('RANGE') || msg.includes('range') || msg.includes('disconnected')) {
      return strings.errors.deviceOutOfRange.whatToDo;
    }
    return strings.errors.generalError.whatToDo;
  };

  return (
    <View
      style={styles.bannerContainer}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLabel={`Error ${deviceError.code || ''}: ${deviceError.message}. What to do: ${getWhatToDo()}`}
    >
      <View style={styles.iconWrap}>
        <AlertTriangle size={20} color="#DC2626" />
      </View>
      <View style={styles.contentWrap}>
        <View style={styles.titleRow}>
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>{deviceError.code || 'DEV-ALERT'}</Text>
          </View>
          <Text style={styles.titleText}>Device Diagnostic Alert</Text>
        </View>
        <Text style={styles.messageText}>{deviceError.message}</Text>

        {/* Actionable "What to do" line */}
        <View style={styles.whatToDoContainer}>
          <HelpCircle size={13} color="#991B1B" />
          <Text style={styles.whatToDoText}>
            <Text style={styles.whatToDoBold}>What to do: </Text>
            {getWhatToDo()}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => setDeviceError(null)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Dismiss device error alert"
      >
        <X size={20} color="#991B1B" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 12,
    left: 16,
    right: 16,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  iconWrap: {
    marginRight: 10,
    marginTop: 2,
  },
  contentWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  codeBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  codeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.2,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  messageText: {
    fontSize: 13,
    color: '#7F1D1D',
    lineHeight: 18,
    marginBottom: 6,
  },
  whatToDoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 6,
    padding: 6,
    gap: 6,
    marginTop: 2,
  },
  whatToDoText: {
    fontSize: 11,
    color: '#450A0A',
    flex: 1,
    lineHeight: 15,
  },
  whatToDoBold: {
    fontWeight: '700',
    color: '#991B1B',
  },
  closeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});

