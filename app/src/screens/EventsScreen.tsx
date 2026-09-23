import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../utils/theme';
import { AlertTriangle, User, Activity, Mic, Wifi, Power } from 'lucide-react-native';

type EventCategory = 'ALL' | 'PRESENCE' | 'MOVEMENT' | 'WELLBEING' | 'EMERGENCY' | 'DEVICE';

interface SafetyEvent {
  id: string;
  time: string;
  title: string;
  detail: string;
  category: EventCategory;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  feedbackStatus?: 'CONFIRMED_REAL' | 'FALSE_ALARM' | 'NOT_SURE';
}

const MOCK_EVENTS: SafetyEvent[] = [
  { id: '1', time: '16:42', title: 'Emergency voice detected', detail: '"HELP" keyword — 92% confidence', category: 'EMERGENCY', severity: 'HIGH', feedbackStatus: 'CONFIRMED_REAL' },
  { id: '2', time: '16:40', title: 'Wellbeing check triggered', detail: 'Stillness threshold reached (25s)', category: 'WELLBEING', severity: 'MEDIUM' },
  { id: '3', time: '16:38', title: 'Person became still', detail: 'No movement detected', category: 'MOVEMENT', severity: 'LOW' },
  { id: '4', time: '16:35', title: 'Movement detected', detail: 'Person is active', category: 'MOVEMENT', severity: 'LOW' },
  { id: '5', time: '14:20', title: 'Stillness emergency resolved', detail: 'Inactivity alarm triggered', category: 'EMERGENCY', severity: 'HIGH', feedbackStatus: 'FALSE_ALARM' },
  { id: '6', time: '12:15', title: 'Manual SOS button pressed', detail: 'Wall button triggered by occupant', category: 'EMERGENCY', severity: 'HIGH', feedbackStatus: 'CONFIRMED_REAL' },
  { id: '7', time: '11:10', title: 'Device came online', detail: 'Wi-Fi connected', category: 'DEVICE', severity: 'LOW' },
];

const SEVERITY_COLORS = { LOW: colors.safe, MEDIUM: colors.warning, HIGH: colors.emergency };
const CATEGORY_ICONS: Record<EventCategory, any> = {
  ALL: Activity, PRESENCE: User, MOVEMENT: Activity,
  WELLBEING: Activity, EMERGENCY: AlertTriangle, DEVICE: Wifi,
};

export const EventsScreen: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<EventCategory>('ALL');
  const filters: EventCategory[] = ['ALL', 'EMERGENCY', 'WELLBEING', 'PRESENCE', 'MOVEMENT', 'DEVICE'];

  const filtered = activeFilter === 'ALL' ? MOCK_EVENTS : MOCK_EVENTS.filter(e => e.category === activeFilter);

  const renderFeedbackBadge = (status?: 'CONFIRMED_REAL' | 'FALSE_ALARM' | 'NOT_SURE') => {
    if (!status) return null;
    if (status === 'CONFIRMED_REAL') {
      return (
        <View style={[styles.feedbackBadge, { backgroundColor: '#FEF2F2' }]}>
          <Text style={[styles.feedbackBadgeText, { color: '#DC2626' }]}>✓ Real Incident</Text>
        </View>
      );
    }
    if (status === 'FALSE_ALARM') {
      return (
        <View style={[styles.feedbackBadge, { backgroundColor: '#FFFBEB' }]}>
          <Text style={[styles.feedbackBadgeText, { color: '#D97706' }]}>⚠ False Alarm</Text>
        </View>
      );
    }
    return (
      <View style={[styles.feedbackBadge, { backgroundColor: '#F1F5F9' }]}>
        <Text style={[styles.feedbackBadgeText, { color: '#64748B' }]}>Unconfirmed</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
        {filters.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
            onPress={() => setActiveFilter(f)}
          >
            <Text style={[styles.filterText, activeFilter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filtered.map(event => {
          const Icon = CATEGORY_ICONS[event.category];
          return (
            <View key={event.id} style={styles.eventCard}>
              <View style={[styles.iconBox, { backgroundColor: SEVERITY_COLORS[event.severity] + '20' }]}>
                <Icon size={20} color={SEVERITY_COLORS[event.severity]} />
              </View>
              <View style={styles.eventInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  {renderFeedbackBadge(event.feedbackStatus)}
                </View>
                <Text style={styles.eventDetail}>{event.detail}</Text>
              </View>
              <View style={styles.eventMeta}>
                <Text style={styles.eventTime}>{event.time}</Text>
                <View style={[styles.severityDot, { backgroundColor: SEVERITY_COLORS[event.severity] }]} />
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterBar: { maxHeight: 56, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: borderRadius.full, backgroundColor: colors.background,
    borderWidth: 1, borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  filterTextActive: { color: colors.surface },
  list: { flex: 1 },
  listContent: { padding: spacing.md, gap: spacing.sm },
  eventCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.md,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
  eventInfo: { flex: 1 },
  eventTitle: { ...typography.body2, color: colors.textPrimary, fontWeight: '600', marginBottom: 2 },
  eventDetail: { ...typography.caption, color: colors.textSecondary },
  eventMeta: { alignItems: 'flex-end', gap: 6 },
  eventTime: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  feedbackBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  feedbackBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
