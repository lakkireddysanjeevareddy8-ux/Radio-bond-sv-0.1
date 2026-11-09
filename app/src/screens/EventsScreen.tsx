import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  TOUCH_TARGET,
  toneColors,
} from '../utils/theme';
import { Card, Pill, IconBadge } from '../components/ui';
import { EmergencyContactService } from '../services/EmergencyContactService';
import {
  AlertTriangle,
  User,
  Activity,
  Wifi,
  Info,
  CheckCircle2,
  FlaskConical,
  Shield,
  Clock,
  Radio,
} from 'lucide-react-native';

type EventCategory = 'ALL' | 'EMERGENCY' | 'WELLBEING' | 'PRESENCE' | 'MOVEMENT' | 'DEVICE';

interface SafetyEvent {
  id: string;
  time: string;
  dateStr?: string;
  title: string;
  detail: string;
  category: EventCategory;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  feedbackStatus?: 'CONFIRMED_REAL' | 'FALSE_ALARM' | 'NOT_SURE';
  isTest?: boolean;
  isLive?: boolean;
  deviceId?: string;
  trigger?: string;
  status?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

const MOCK_EVENTS: SafetyEvent[] = [
  {
    id: '1',
    time: '16:42',
    dateStr: 'Today',
    title: 'Emergency voice detected',
    detail: '"HELP" keyword — 92% confidence',
    category: 'EMERGENCY',
    severity: 'HIGH',
    feedbackStatus: 'CONFIRMED_REAL',
    deviceId: 'WSG-01-A482',
    trigger: 'VOICE_KEYWORD ("HELP")',
    status: 'resolved',
    acknowledgedAt: '16:43',
    resolvedAt: '16:45',
  },
  {
    id: '2',
    time: '16:40',
    title: 'Wellbeing check triggered',
    detail: 'Stillness threshold reached (25s)',
    category: 'WELLBEING',
    severity: 'MEDIUM',
  },
  {
    id: '3',
    time: '16:38',
    title: 'Person became still',
    detail: 'No movement detected',
    category: 'MOVEMENT',
    severity: 'LOW',
  },
  {
    id: '4',
    time: '16:35',
    title: 'Movement detected',
    detail: 'Person is active',
    category: 'MOVEMENT',
    severity: 'LOW',
  },
  {
    id: 'test_1',
    time: '15:10',
    dateStr: 'Today',
    title: 'Safety System Test',
    detail: 'Self-test check-in & alarm sequence',
    category: 'EMERGENCY',
    severity: 'MEDIUM',
    isTest: true,
    deviceId: 'WSG-01-A482',
    trigger: 'TEST_EMERGENCY',
    status: 'resolved',
    acknowledgedAt: '15:10',
    resolvedAt: '15:11',
  },
  {
    id: '5',
    time: '14:20',
    dateStr: 'Today',
    title: 'Stillness emergency resolved',
    detail: 'Inactivity alarm triggered',
    category: 'EMERGENCY',
    severity: 'HIGH',
    feedbackStatus: 'FALSE_ALARM',
    deviceId: 'WSG-01-A482',
    trigger: 'INACTIVITY_STILLNESS',
    status: 'cancelled',
    acknowledgedAt: '14:21',
    resolvedAt: '14:22',
  },
  {
    id: '6',
    time: '12:15',
    dateStr: 'Today',
    title: 'Manual SOS button pressed',
    detail: 'Wall button triggered by occupant',
    category: 'EMERGENCY',
    severity: 'HIGH',
    feedbackStatus: 'CONFIRMED_REAL',
    deviceId: 'WSG-01-A482',
    trigger: 'MANUAL_EMERGENCY',
    status: 'resolved',
    acknowledgedAt: '12:16',
    resolvedAt: '12:20',
  },
  {
    id: '7',
    time: '11:10',
    title: 'Device came online',
    detail: 'Wi-Fi connected',
    category: 'DEVICE',
    severity: 'LOW',
  },
];

export const EventsScreen: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<EventCategory>('ALL');
  const [hideTests, setHideTests] = useState<boolean>(true);
  const [liveEvents, setLiveEvents] = useState<SafetyEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const filters: EventCategory[] = ['ALL', 'EMERGENCY', 'WELLBEING', 'PRESENCE', 'MOVEMENT', 'DEVICE'];

  useEffect(() => {
    let isMounted = true;
    const fetchLiveHistory = async () => {
      setIsLoading(true);
      try {
        const data = await EmergencyContactService.getEmergencyHistory();
        if (isMounted && data && data.length > 0) {
          const mapped: SafetyEvent[] = data.map((ev) => {
            const date = new Date(ev.detectedAt);
            const timeStr = !isNaN(date.getTime())
              ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : 'Recent';
            const dateStr = !isNaN(date.getTime())
              ? date.toLocaleDateString([], { month: 'short', day: 'numeric' })
              : undefined;

            const formatIso = (iso?: string) => {
              if (!iso) return undefined;
              const d = new Date(iso);
              return !isNaN(d.getTime()) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined;
            };

            const triggerName = ev.trigger || ev.source || 'Emergency Trigger';
            const title = triggerName === 'MANUAL_EMERGENCY'
              ? 'Manual SOS Button'
              : triggerName.includes('INACTIVITY') || triggerName.includes('STILL') || triggerName === 'NO_RESPONSE'
              ? 'Stillness Inactivity Alert'
              : (ev.eventType || 'Emergency Alert');

            return {
              id: ev.id,
              time: timeStr,
              dateStr,
              title,
              detail: `Device: ${ev.deviceId} • Trigger: ${triggerName}`,
              category: 'EMERGENCY' as EventCategory,
              severity: (ev.severity === 'HIGH' || ev.severity === 'CRITICAL'
                ? 'HIGH'
                : ev.severity === 'MEDIUM'
                ? 'MEDIUM'
                : 'LOW') as any,
              isLive: true,
              isTest: ev.eventType?.toLowerCase().includes('test') || triggerName.toLowerCase().includes('test') || false,
              deviceId: ev.deviceId,
              trigger: triggerName,
              status: ev.status,
              acknowledgedAt: formatIso(ev.acknowledgedAt),
              resolvedAt: formatIso(ev.resolvedAt),
            };
          });
          setLiveEvents(mapped);
        }
      } catch (err) {
        console.warn('[EventsScreen] Failed to fetch live emergency history:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchLiveHistory();
    return () => {
      isMounted = false;
    };
  }, []);

  const isUsingMock = liveEvents.length === 0;
  const currentEvents = isUsingMock ? MOCK_EVENTS : liveEvents;

  const categoryFiltered =
    activeFilter === 'ALL'
      ? currentEvents
      : currentEvents.filter((e) => e.category === activeFilter);

  const filtered = hideTests ? categoryFiltered.filter((e) => !e.isTest) : categoryFiltered;

  const getCategoryIcon = (category: EventCategory) => {
    switch (category) {
      case 'PRESENCE':
        return User;
      case 'MOVEMENT':
      case 'WELLBEING':
        return Activity;
      case 'EMERGENCY':
        return AlertTriangle;
      case 'DEVICE':
        return Wifi;
      case 'ALL':
      default:
        return Activity;
    }
  };

  const getSeverityTone = (sev: 'LOW' | 'MEDIUM' | 'HIGH') => {
    switch (sev) {
      case 'HIGH':
        return 'emergency' as const;
      case 'MEDIUM':
        return 'warning' as const;
      case 'LOW':
      default:
        return 'safe' as const;
    }
  };

  return (
    <View style={styles.container}>
      {/* Sample Data Banner when using mock events */}
      {isUsingMock && (
        <View style={styles.sampleBanner}>
          <View style={styles.sampleBannerIconWrap}>
            <Info size={18} color={colors.infoText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sampleBannerTitle}>Sample Activity History</Text>
            <Text style={styles.sampleBannerText}>
              Sample data shown until live device events are recorded. Real incidents will
              automatically appear here.
            </Text>
          </View>
        </View>
      )}

      {/* Filter Chips Bar */}
      <View style={styles.filterBarWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterBar}
          contentContainerStyle={styles.filterContent}
        >
          {filters.map((f) => {
            const isSelected = activeFilter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setActiveFilter(f)}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${f}`}
              >
                <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>{f}</Text>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.filterChip, hideTests ? styles.testToggleActive : styles.testToggleInactive]}
            onPress={() => setHideTests(!hideTests)}
            accessibilityRole="button"
            accessibilityLabel={hideTests ? 'Show test events' : 'Hide test events'}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {hideTests ? (
                <Shield size={13} color={colors.primaryDark} />
              ) : (
                <FlaskConical size={13} color="#7C3AED" />
              )}
              <Text
                style={[
                  styles.filterText,
                  hideTests ? styles.testToggleTextActive : styles.testToggleTextInactive,
                ]}
              >
                {hideTests ? 'Tests Hidden' : 'Showing Tests'}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Events List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading history records...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Clock size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No events in this category</Text>
            <Text style={styles.emptySubtitle}>Events matching this filter will appear here.</Text>
          </View>
        ) : (
          filtered.map((event) => {
            const Icon = getCategoryIcon(event.category);
            const isTestEvent = Boolean(event.isTest);
            const tone = isTestEvent ? 'info' : getSeverityTone(event.severity);
            const toneSet = toneColors(tone);

            return (
              <Card key={event.id} style={styles.eventCard}>
                <View style={styles.eventRow}>
                  {/* Category / Status Icon Badge */}
                  <IconBadge
                    icon={<Icon size={18} color={toneSet.icon} />}
                    tone={tone}
                    size={40}
                    style={{ marginRight: spacing.md }}
                  />

                  {/* Main Event Info */}
                  <View style={styles.eventInfo}>
                    <View style={styles.eventTitleRow}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      {isTestEvent ? (
                        <Pill
                          size="sm"
                          tone="info"
                          icon={<FlaskConical size={10} color={colors.infoText} />}
                          label="Test"
                        />
                      ) : event.feedbackStatus === 'CONFIRMED_REAL' ? (
                        <Pill
                          size="sm"
                          tone="emergency"
                          icon={<CheckCircle2 size={10} color={colors.emergencyText} />}
                          label="Real Incident"
                        />
                      ) : event.feedbackStatus === 'FALSE_ALARM' ? (
                        <Pill
                          size="sm"
                          tone="warning"
                          icon={<AlertTriangle size={10} color={colors.warningText} />}
                          label="False Alarm"
                        />
                      ) : null}
                    </View>
                    <Text style={styles.eventDetail}>{event.detail}</Text>
                  </View>

                  {/* Timestamp and Severity indicator */}
                  <View style={styles.eventMeta}>
                    <Text style={styles.eventTime}>{event.time}</Text>
                    <View style={[styles.severityDot, { backgroundColor: toneSet.solid }]} />
                  </View>
                </View>

                {/* Emergency Audit Details: Time, Device, Trigger, Acknowledgment, Resolution */}
                {event.category === 'EMERGENCY' && (event.deviceId || event.trigger) && (
                  <View style={styles.emergencyAuditBox}>
                    <View style={styles.auditRow}>
                      <Text style={styles.auditLabel}>Device:</Text>
                      <Text style={styles.auditValue}>{event.deviceId || 'WSG-000001'}</Text>
                    </View>
                    <View style={styles.auditRow}>
                      <Text style={styles.auditLabel}>Trigger:</Text>
                      <Text style={styles.auditValue}>{event.trigger || 'Manual / Sensor'}</Text>
                    </View>
                    <View style={styles.auditRow}>
                      <Text style={styles.auditLabel}>Acknowledgment:</Text>
                      <Text style={[styles.auditValue, event.acknowledgedAt ? styles.auditSuccess : styles.auditPending]}>
                        {event.acknowledgedAt ? `Acknowledged (${event.acknowledgedAt})` : 'Unacknowledged'}
                      </Text>
                    </View>
                    <View style={styles.auditRow}>
                      <Text style={styles.auditLabel}>Resolution:</Text>
                      <Text style={[styles.auditValue, event.resolvedAt ? styles.auditResolved : (event.status === 'cancelled' ? styles.auditCancelled : styles.auditActive)]}>
                        {event.resolvedAt
                          ? `Resolved (${event.resolvedAt})`
                          : event.status === 'cancelled'
                          ? 'Cancelled (False Alarm)'
                          : event.status === 'acknowledged'
                          ? 'Acknowledged (Attending)'
                          : 'Active Alarm'}
                      </Text>
                    </View>
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sampleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoSoft,
    borderBottomWidth: 1,
    borderBottomColor: '#BAE6FD',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  sampleBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleBannerTitle: {
    ...typography.label,
    color: colors.infoText,
    fontWeight: '700',
  },
  sampleBannerText: {
    ...typography.caption,
    color: colors.infoText,
    lineHeight: 16,
    marginTop: 1,
  },
  filterBarWrapper: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterBar: {
    maxHeight: 54,
  },
  filterContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChip: {
    minHeight: TOUCH_TARGET - 14,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  testToggleActive: {
    backgroundColor: colors.primarySoft,
    borderColor: '#BAE6FD',
  },
  testToggleInactive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  testToggleTextActive: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  testToggleTextInactive: {
    color: '#7C3AED',
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  eventCard: {
    marginVertical: 4,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  eventTitle: {
    ...typography.body2,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  eventDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  eventMeta: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    gap: 6,
  },
  eventTime: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '500',
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emergencyAuditBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  auditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  auditLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  auditValue: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 12,
  },
  auditSuccess: {
    color: colors.safeText,
  },
  auditPending: {
    color: colors.warningText,
  },
  auditResolved: {
    color: colors.safeText,
  },
  auditCancelled: {
    color: colors.textMuted,
  },
  auditActive: {
    color: colors.emergency,
  },
  loadingContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  emptyContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.body1,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptySubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
});
