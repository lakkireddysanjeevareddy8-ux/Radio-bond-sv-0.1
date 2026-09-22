import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import {
  Bluetooth,
  Bell,
  MapPin,
  Settings,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react-native';
import { PermissionService } from '../services/PermissionService';

export type PermissionType = 'bluetooth' | 'notifications' | 'location';

interface PermissionPrimerModalProps {
  visible: boolean;
  type: PermissionType;
  isBlocked?: boolean;
  onContinue: () => void | Promise<void>;
  onDismiss: () => void;
  title?: string;
  description?: string;
}

interface PermissionConfig {
  title: string;
  blockedTitle: string;
  badge: string;
  description: string;
  blockedDescription: string;
  primaryColor: string;
  iconBg: string;
  icon: React.ReactNode;
}

const PERMISSION_CONFIGS: Record<PermissionType, PermissionConfig> = {
  bluetooth: {
    title: 'Enable Bluetooth Access',
    blockedTitle: 'Bluetooth Permission Required',
    badge: 'DEVICE DISCOVERY',
    description:
      'Washroom Safety Gadget requires Bluetooth to discover, configure, and pair with your WSG-01 sensor nearby.',
    blockedDescription:
      'Bluetooth permission was denied. Please open Settings and enable Bluetooth for this app so we can find your WSG-01 sensor.',
    primaryColor: '#2563EB',
    iconBg: '#EFF6FF',
    icon: <Bluetooth size={36} color="#2563EB" />,
  },
  notifications: {
    title: 'Allow Emergency Notifications',
    blockedTitle: 'Notification Permission Required',
    badge: 'CRITICAL SAFETY',
    description:
      'Notifications allow urgent emergency alarms and fall/stillness alerts to reach your device even when the app is in the background or your screen is locked.',
    blockedDescription:
      'Notifications are currently disabled. Please open Settings and turn on notifications so critical safety emergencies can immediately reach you.',
    primaryColor: '#DC2626',
    iconBg: '#FEF2F2',
    icon: <Bell size={36} color="#DC2626" />,
  },
  location: {
    title: 'Allow Location for BLE Discovery',
    blockedTitle: 'Location Permission Required',
    badge: 'BLUETOOTH REQUIREMENT',
    description:
      'Android requires location access to discover Bluetooth Low Energy devices. Your physical location is never tracked, stored, or shared.',
    blockedDescription:
      'Location permission was previously denied. Android requires this to scan for Bluetooth devices. Please enable location access in system settings.',
    primaryColor: '#059669',
    iconBg: '#ECFDF5',
    icon: <MapPin size={36} color="#059669" />,
  },
};

export const PermissionPrimerModal: React.FC<PermissionPrimerModalProps> = ({
  visible,
  type,
  isBlocked = false,
  onContinue,
  onDismiss,
  title,
  description,
}) => {
  const { width } = useWindowDimensions();
  const config = PERMISSION_CONFIGS[type] || PERMISSION_CONFIGS.bluetooth;

  const displayTitle = isBlocked
    ? title || config.blockedTitle
    : title || config.title;

  const displayDesc = isBlocked
    ? description || config.blockedDescription
    : description || config.description;

  const handlePrimaryPress = async () => {
    if (isBlocked) {
      await PermissionService.openSettings();
      onDismiss();
    } else {
      await onContinue();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { maxWidth: Math.min(width - 40, 420) }]}>
          {/* Header Badge */}
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.badgePill,
                {
                  backgroundColor: isBlocked
                    ? '#FEF3C7'
                    : config.iconBg,
                },
              ]}
            >
              {isBlocked ? (
                <AlertTriangle size={12} color="#D97706" style={{ marginRight: 4 }} />
              ) : (
                <ShieldCheck size={12} color={config.primaryColor} style={{ marginRight: 4 }} />
              )}
              <Text
                style={[
                  styles.badgeText,
                  { color: isBlocked ? '#B45309' : config.primaryColor },
                ]}
              >
                {isBlocked ? 'ACTION REQUIRED' : config.badge}
              </Text>
            </View>
          </View>

          {/* Central Icon Emblem */}
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: isBlocked ? '#FFFBEB' : config.iconBg,
                borderColor: isBlocked ? '#FDE68A' : `${config.primaryColor}25`,
              },
            ]}
          >
            {isBlocked ? <Settings size={36} color="#D97706" /> : config.icon}
          </View>

          {/* Title & Description */}
          <Text style={styles.title}>{displayTitle}</Text>
          <Text style={styles.description}>{displayDesc}</Text>

          {/* Actions */}
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: isBlocked ? '#D97706' : config.primaryColor },
              ]}
              onPress={handlePrimaryPress}
              activeOpacity={0.88}
            >
              <Text style={styles.primaryButtonText}>
                {isBlocked ? 'Open System Settings' : 'Continue'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>
                {isBlocked ? 'Cancel' : 'Not now'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 8,
  },
  badgeRow: {
    marginBottom: 16,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderWidth: 1.5,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 25,
  },
  description: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  buttonGroup: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
});
