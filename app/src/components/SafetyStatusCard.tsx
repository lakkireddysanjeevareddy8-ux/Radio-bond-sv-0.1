import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  toneColors,
  Tone,
} from '../utils/theme';
import {
  ShieldCheck,
  User,
  ShieldAlert,
  AlertTriangle,
  WifiOff,
} from 'lucide-react-native';

export type SafetyStatusType =
  | 'SAFE'
  | 'MONITORING'
  | 'CHECKING'
  | 'INACTIVE_DETECTED'
  | 'NO_RESPONSE'
  | 'ALARM'
  | 'EMERGENCY'
  | 'OFFLINE';

interface Props {
  status: SafetyStatusType;
}

export const SafetyStatusCard: React.FC<Props> = ({ status }) => {
  let title = 'All clear';
  let subtitle = 'Washroom is empty. System is actively monitoring.';
  let tone: Tone = 'safe';
  let isSolidEmergency = false;
  let IconComponent = ShieldCheck;

  switch (status) {
    case 'MONITORING':
      title = 'Someone is inside';
      subtitle = 'Movement detected. Monitoring calmly.';
      tone = 'info';
      IconComponent = User;
      break;
    case 'CHECKING':
    case 'INACTIVE_DETECTED':
      title = 'Checking if they are OK';
      subtitle = 'Stillness detected. Gentle voice check-in initiated.';
      tone = 'warning';
      IconComponent = AlertTriangle;
      break;
    case 'NO_RESPONSE':
      title = 'No response yet';
      subtitle = 'Second voice prompt sounding. Awaiting movement or reply.';
      tone = 'warning';
      IconComponent = ShieldAlert;
      break;
    case 'ALARM':
    case 'EMERGENCY':
      title = 'Emergency';
      subtitle = 'Urgent alarm active. Emergency contacts are being notified.';
      tone = 'emergency';
      isSolidEmergency = true;
      IconComponent = ShieldAlert;
      break;
    case 'OFFLINE':
      title = "Can't reach the device";
      subtitle = 'The device still sounds its own alarm locally in the washroom.';
      tone = 'offline';
      IconComponent = WifiOff;
      break;
    case 'SAFE':
    default:
      title = 'All clear';
      subtitle = 'Washroom is empty. System is actively monitoring.';
      tone = 'safe';
      IconComponent = ShieldCheck;
      break;
  }

  const toneStyle = toneColors(tone);

  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion={isSolidEmergency ? 'assertive' : 'polite'}
      accessibilityLabel={`Safety status: ${title}. ${subtitle}`}
      style={[
        styles.heroCard,
        isSolidEmergency
          ? styles.emergencyHero
          : {
              backgroundColor: toneStyle.bg,
              borderColor: toneStyle.border,
            },
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          isSolidEmergency
            ? styles.emergencyIconCircle
            : {
                backgroundColor: colors.surface,
                borderColor: toneStyle.border,
              },
        ]}
      >
        <IconComponent
          size={34}
          color={isSolidEmergency ? '#FFFFFF' : toneStyle.icon}
          strokeWidth={2.2}
        />
      </View>

      <View style={styles.textContainer}>
        <Text
          style={[
            styles.titleText,
            isSolidEmergency ? styles.emergencyTitle : { color: toneStyle.text },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.subtitleText,
            isSolidEmergency
              ? styles.emergencySubtitle
              : { color: toneStyle.text, opacity: 0.85 },
          ]}
        >
          {subtitle}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    marginVertical: spacing.sm,
    ...shadows.sm,
  },
  emergencyHero: {
    backgroundColor: colors.emergency,
    borderColor: '#DC2626',
    ...shadows.md,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginRight: spacing.md,
  },
  emergencyIconCircle: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    ...typography.h2,
    fontWeight: '700',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  emergencyTitle: {
    color: '#FFFFFF',
  },
  subtitleText: {
    ...typography.body2,
    lineHeight: 20,
    fontWeight: '500',
  },
  emergencySubtitle: {
    color: '#FFFFFF',
    opacity: 0.95,
  },
});
