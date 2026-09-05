import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { deviceService } from '../services/DeviceCommunicationService';
import { useAppStore } from '../store/useAppStore';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { Play, Pause, UserPlus, UserMinus, Activity, Volume2, WifiOff, Wifi } from 'lucide-react-native';

export const DemoScreen: React.FC = () => {
  const { voicePrompt, telemetry } = useAppStore();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Device Simulator</Text>
      <Text style={styles.subtitle}>Use these controls to test the hardware behavior without the physical ESP32 device.</Text>

      {voicePrompt && (
        <View style={styles.voicePromptCard}>
          <Volume2 color={colors.primary} size={24} style={{ marginRight: 12 }} />
          <Text style={styles.voicePromptText}>Device says: "{voicePrompt}"</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Presence & Movement</Text>
        <View style={styles.grid}>
          <DemoButton 
            title="Person Enters" 
            icon={<UserPlus size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoPersonEnters()}
            color={colors.info}
          />
          <DemoButton 
            title="Person Leaves" 
            icon={<UserMinus size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoPersonLeaves()}
            color={colors.textSecondary}
          />
          <DemoButton 
            title="Person Moves" 
            icon={<Activity size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoMovement()}
            color={colors.safe}
          />
          <DemoButton 
            title="Person Stops" 
            icon={<Pause size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoStops()}
            color={colors.warning}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Emergencies</Text>
        <View style={styles.grid}>
          <DemoButton 
            title={`Voice "HELP"`} 
            icon={<Volume2 size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoVoiceHelp()}
            color={colors.emergency}
          />
          <DemoButton 
            title="No Response" 
            icon={<Pause size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoResponse()}
            color={colors.warning}
            disabled={telemetry?.state !== 'CHECKING_WELLBEING' && telemetry?.state !== 'WAITING_FOR_RESPONSE'}
          />
          <DemoButton 
            title="Emergency Button" 
            icon={<Play size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoEmergencyButton()}
            color={colors.emergency}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection</Text>
        <View style={styles.grid}>
          <DemoButton 
            title="Device Offline" 
            icon={<WifiOff size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoDeviceOffline()}
            color={colors.offline}
          />
          <DemoButton 
            title="Device Online" 
            icon={<Wifi size={20} color={colors.surface} />} 
            onPress={() => deviceService.demoDeviceOnline()}
            color={colors.safe}
          />
        </View>
      </View>
    </ScrollView>
  );
};

const DemoButton = ({ title, icon, onPress, color, disabled }: any) => (
  <TouchableOpacity 
    style={[styles.button, { backgroundColor: disabled ? colors.border : color }]} 
    onPress={onPress}
    disabled={disabled}
  >
    {icon}
    <Text style={styles.buttonText}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  button: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  buttonText: {
    ...typography.body2,
    color: colors.surface,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  voicePromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  voicePromptText: {
    ...typography.body1,
    color: '#0284C7',
    fontWeight: '600',
  }
});
