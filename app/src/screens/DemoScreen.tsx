import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { deviceService } from '../services/DeviceCommunicationService';
import { useAppStore } from '../store/useAppStore';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import {
  Play,
  Pause,
  UserPlus,
  UserMinus,
  Activity,
  Volume2,
  WifiOff,
  Wifi,
  Shield,
  Clock,
  User,
  ArrowRight,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';

export const DemoScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { voicePrompt, telemetry, isOnline, isSimulatorMode, setIsSimulatorMode, deviceConfig } =
    useAppStore();

  const handleAction = (actionFn: () => void) => {
    if (!isSimulatorMode) {
      setIsSimulatorMode(true);
    }
    actionFn();
  };

  const getStateColor = (state?: string) => {
    switch (state) {
      case 'MOVING':
      case 'SAFE':
        return colors.safe;
      case 'PERSON_PRESENT':
        return colors.info;
      case 'STILL_MONITORING':
        return colors.warning;
      case 'CHECKING_WELLBEING':
      case 'WAITING_FOR_RESPONSE':
        return '#EA580C';
      case 'EMERGENCY':
        return colors.emergency;
      case 'DEVICE_OFFLINE':
        return colors.offline;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Device Simulator</Text>
      <Text style={styles.subtitle}>
        Simulate real mmWave radar, motion, and stillness scenarios to test dashboard safety responses.
      </Text>

      {/* Live State Card */}
      <View style={styles.liveStateCard}>
        <View style={styles.liveStateHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={[
                styles.statePill,
                { backgroundColor: getStateColor(telemetry?.state) + '20', borderColor: getStateColor(telemetry?.state) },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: getStateColor(telemetry?.state) }]} />
              <Text style={[styles.statePillText, { color: getStateColor(telemetry?.state) }]}>
                {telemetry?.state || 'IDLE'}
              </Text>
            </View>
            <Text style={styles.modeText}>
              {isSimulatorMode ? '🧪 SIMULATOR ACTIVE' : '📡 HARDWARE MODE'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.viewDashboardLink}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <Text style={styles.viewDashboardText}>View Dashboard</Text>
            <ArrowRight size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <User size={14} color={telemetry?.presence ? colors.info : colors.textSecondary} />
            <Text style={styles.metricLabel}>Presence:</Text>
            <Text
              style={[
                styles.metricVal,
                { color: telemetry?.presence ? colors.info : colors.textSecondary },
              ]}
            >
              {telemetry?.presence ? 'Detected' : 'None'}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Activity size={14} color={telemetry?.movement ? colors.safe : colors.textSecondary} />
            <Text style={styles.metricLabel}>Movement:</Text>
            <Text
              style={[
                styles.metricVal,
                { color: telemetry?.movement ? colors.safe : colors.textSecondary },
              ]}
            >
              {telemetry?.movement ? 'Moving' : 'Still'}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Clock size={14} color={colors.textSecondary} />
            <Text style={styles.metricLabel}>Stillness:</Text>
            <Text style={[styles.metricVal, { color: colors.textPrimary }]}>
              {telemetry?.stillnessSeconds ?? 0}s
            </Text>
          </View>
        </View>
      </View>

      {!isSimulatorMode && (
        <View style={styles.liveBanner}>
          <Text style={styles.liveBannerTitle}>📡 Live ESP32 Mode is currently Active</Text>
          <Text style={styles.liveBannerText}>
            Clicking any button below will automatically switch to Simulator Mode and broadcast live events.
          </Text>
          <TouchableOpacity style={styles.switchModeBtn} onPress={() => setIsSimulatorMode(true)}>
            <Text style={styles.switchModeBtnText}>Switch to Simulator Mode Now</Text>
          </TouchableOpacity>
        </View>
      )}

      {voicePrompt && (
        <View style={styles.voicePromptCard}>
          <Volume2 color={colors.primary} size={24} style={{ marginRight: 12 }} />
          <Text style={styles.voicePromptText}>Device says: "{voicePrompt}"</Text>
        </View>
      )}

      {/* 1. Presence & Movement Controls */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Presence & Movement</Text>
        <View style={styles.grid}>
          <DemoButton 
            title="Person Enters" 
            desc="Enters washroom & moves"
            icon={<UserPlus size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoPersonEnters())}
            color={colors.info}
          />
          <DemoButton 
            title="Person Leaves" 
            desc="Exits washroom (IDLE)"
            icon={<UserMinus size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoPersonLeaves())}
            color={colors.textSecondary}
          />
          <DemoButton 
            title="Person Moves" 
            desc="Active motion in room"
            icon={<Activity size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoMovement())}
            color={colors.safe}
          />
          <DemoButton 
            title="Person Stops" 
            desc="Stops moving (timer starts)"
            icon={<Pause size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoStops())}
            color={colors.warning}
          />
        </View>
      </View>

      {/* 2. Emergency Triggers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Emergencies & Voice</Text>
        <View style={styles.grid}>
          <DemoButton 
            title={`Voice "HELP"`} 
            desc="Voice keyword detected"
            icon={<Volume2 size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoVoiceHelp())}
            color={colors.emergency}
          />
          <DemoButton 
            title="Response / OK" 
            desc="Patient responds to prompt"
            icon={<Play size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoResponse())}
            color={colors.safe}
          />
          <DemoButton 
            title="Emergency Button" 
            desc="Physical SOS button pressed"
            icon={<Play size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoEmergencyButton())}
            color={colors.emergency}
          />
        </View>
      </View>

      {/* 3. Connection Triggers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Connection State</Text>
        <View style={styles.grid}>
          <DemoButton 
            title="Device Offline" 
            desc="Simulate power loss"
            icon={<WifiOff size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoDeviceOffline())}
            color={colors.offline}
          />
          <DemoButton 
            title="Device Online" 
            desc="Restore connection"
            icon={<Wifi size={20} color={colors.surface} />} 
            onPress={() => handleAction(() => deviceService.demoDeviceOnline())}
            color={colors.safe}
          />
        </View>
      </View>
    </ScrollView>
  );
};

const DemoButton = ({ title, desc, icon, onPress, color, disabled }: any) => (
  <TouchableOpacity 
    style={[styles.button, { backgroundColor: disabled ? colors.border : color }]} 
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.8}
  >
    <View style={styles.btnIconBox}>{icon}</View>
    <View style={{ flex: 1 }}>
      <Text style={styles.buttonText}>{title}</Text>
      {desc && <Text style={styles.buttonDesc}>{desc}</Text>}
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  liveStateCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  liveStateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statePillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  viewDashboardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDashboardText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  metricVal: {
    fontSize: 12,
    fontWeight: '700',
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
    cursor: 'pointer' as any,
  },
  btnIconBox: {
    marginRight: spacing.sm,
  },
  buttonText: {
    ...typography.body2,
    color: colors.surface,
    fontWeight: '700',
  },
  buttonDesc: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
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
  },
  liveBanner: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  liveBannerTitle: {
    fontWeight: '700',
    fontSize: 14,
    color: '#1D4ED8',
    marginBottom: 4,
  },
  liveBannerText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  switchModeBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
  },
  switchModeBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
});
