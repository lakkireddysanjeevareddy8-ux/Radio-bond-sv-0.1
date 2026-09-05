import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { Shield, ShieldAlert, ShieldX } from 'lucide-react-native';

interface Props {
  status: 'SAFE' | 'MONITORING' | 'CHECKING' | 'EMERGENCY' | 'OFFLINE';
}

export const SafetyStatusCard: React.FC<Props> = ({ status }) => {
  let backgroundColor = colors.safe;
  let text = 'SAFE';
  let subtext = 'No emergency detected';
  let Icon = Shield;

  switch (status) {
    case 'MONITORING':
      backgroundColor = colors.info;
      text = 'MONITORING';
      subtext = 'Person present';
      break;
    case 'CHECKING':
      backgroundColor = colors.warning;
      text = 'CHECKING WELLBEING';
      subtext = 'Unusual stillness detected';
      Icon = ShieldAlert;
      break;
    case 'EMERGENCY':
      backgroundColor = colors.emergency;
      text = 'EMERGENCY';
      subtext = 'Immediate assistance required';
      Icon = ShieldAlert;
      break;
    case 'OFFLINE':
      backgroundColor = colors.offline;
      text = 'OFFLINE';
      subtext = 'Device status unavailable';
      Icon = ShieldX;
      break;
  }

  return (
    <View style={styles.card}>
      <View style={[styles.iconContainer, { backgroundColor }]}>
        <Icon color={colors.surface} size={32} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{text}</Text>
        <Text style={styles.subtitle}>{subtext}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginVertical: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.body2,
    color: colors.textSecondary,
  },
});
