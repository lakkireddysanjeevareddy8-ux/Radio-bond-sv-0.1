import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { AlertTriangle, X } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { borderRadius, spacing } from '../utils/theme';

export const DeviceErrorBanner: React.FC = () => {
  const deviceError = useAppStore((s) => s.deviceError);
  const setDeviceError = useAppStore((s) => s.setDeviceError);

  useEffect(() => {
    if (!deviceError) return;
    // Auto-dismiss after 10 seconds if not dismissed manually
    const timer = setTimeout(() => {
      setDeviceError(null);
    }, 10000);
    return () => clearTimeout(timer);
  }, [deviceError, setDeviceError]);

  if (!deviceError) return null;

  return (
    <View style={styles.bannerContainer}>
      <View style={styles.iconWrap}>
        <AlertTriangle size={18} color="#DC2626" />
      </View>
      <View style={styles.contentWrap}>
        <View style={styles.titleRow}>
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>{deviceError.code || 'DEV-ERROR'}</Text>
          </View>
          <Text style={styles.titleText}>Device Diagnostic Alert</Text>
        </View>
        <Text style={styles.messageText}>{deviceError.message}</Text>
      </View>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={() => setDeviceError(null)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <X size={18} color="#991B1B" />
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
    marginBottom: 2,
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
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },
  closeBtn: {
    marginLeft: 8,
    padding: 2,
  },
});

