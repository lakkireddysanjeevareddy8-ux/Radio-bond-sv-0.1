import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { WellnessService } from '../services/WellnessService';
import { VisitRecord, WellnessStats } from '../types';
import { colors, spacing, borderRadius } from '../utils/theme';
import {
  HeartPulse,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Info,
} from 'lucide-react-native';

interface WellnessTabViewProps {
  deviceId: string;
  isSimulatorMode?: boolean;
}

export const WellnessTabView: React.FC<WellnessTabViewProps> = ({
  deviceId,
  isSimulatorMode = false,
}) => {
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [stats, setStats] = useState<WellnessStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async () => {
    try {
      const history = await WellnessService.getVisitHistory(deviceId);
      const computed = WellnessService.computeStats(history);
      setVisits(history);
      setStats(computed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = WellnessService.subscribeToStats((dId, newStats) => {
      if (dId === deviceId) {
        setStats(newStats);
        WellnessService.getVisitHistory(deviceId).then(setVisits);
      }
    });

    return () => {
      unsub();
    };
  }, [deviceId]);

  const handleSimulateVisit = async () => {
    const now = Date.now();
    await WellnessService.recordVisit(
      deviceId,
      new Date(now - 1000 * 180).toISOString(),
      new Date().toISOString(),
      180,
      'NORMAL'
    );
    loadData();
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    if (mins === 0) return `${remainder}s`;
    return `${mins}m ${remainder > 0 ? remainder + 's' : ''}`;
  };

  const formatElapsed = (iso: string | null) => {
    if (!iso) return 'None yet';
    const elapsedMin = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60));
    if (elapsedMin < 1) return 'Just now';
    if (elapsedMin < 60) return `${elapsedMin}m ago`;
    const hours = Math.floor(elapsedMin / 60);
    return `${hours}h ${elapsedMin % 60}m ago`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#2563EB" />
        <Text style={styles.loadingText}>Loading wellness history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Wellness Anomaly Banner (Absence of any visit) */}
      {stats?.hasAnomaly && (
        <View style={styles.anomalyBanner}>
          <View style={styles.anomalyHeader}>
            <View style={styles.anomalyIconCircle}>
              <HeartPulse size={18} color="#D97706" />
            </View>
            <Text style={styles.anomalyTitle}>Routine Check-in Observation</Text>
          </View>
          <Text style={styles.anomalyDesc}>{stats.anomalyReason}</Text>
          <View style={styles.anomalyNoticeRow}>
            <Info size={12} color="#92400E" />
            <Text style={styles.anomalyNoticeText}>
              Gentle wellness flag only — emergency sirens are not triggered.
            </Text>
          </View>
        </View>
      )}

      {/* 3 Metric Cards */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Calendar size={18} color="#2563EB" />
          <Text style={styles.statNumber}>{stats?.todayVisitCount ?? 0}</Text>
          <Text style={styles.statLabel}>Visits Today</Text>
        </View>

        <View style={styles.statCard}>
          <Clock size={18} color="#059669" />
          <Text style={styles.statNumber}>{formatSeconds(stats?.avgDurationSeconds ?? 180)}</Text>
          <Text style={styles.statLabel}>Avg Duration</Text>
        </View>

        <View style={styles.statCard}>
          <TrendingUp size={18} color="#7C3AED" />
          <Text style={styles.statNumber}>{formatElapsed(stats?.lastVisitEndedAt ?? null)}</Text>
          <Text style={styles.statLabel}>Last Activity</Text>
        </View>
      </View>

      {/* Recent Visits Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Washroom Visits</Text>
        {isSimulatorMode && (
          <TouchableOpacity style={styles.simulateBtn} onPress={handleSimulateVisit} activeOpacity={0.8}>
            <Sparkles size={12} color="#2563EB" />
            <Text style={styles.simulateBtnText}>Simulate Visit</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Visits List */}
      {visits.length === 0 ? (
        <View style={styles.emptyCard}>
          <HeartPulse size={32} color="#94A3B8" />
          <Text style={styles.emptyTitle}>No Visits Recorded Yet</Text>
          <Text style={styles.emptySubtitle}>
            When someone enters and leaves the washroom, visits will be automatically tracked here.
          </Text>
        </View>
      ) : (
        <View style={styles.timelineList}>
          {visits.slice(0, 8).map((visit) => {
            const timeStr = new Date(visit.startedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const dateStr = new Date(visit.startedAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            });

            const isEmergency = visit.outcome === 'EMERGENCY';

            return (
              <View key={visit.id} style={styles.timelineItem}>
                <View style={styles.timelineLeft}>
                  <View
                    style={[
                      styles.outcomeDot,
                      { backgroundColor: isEmergency ? '#DC2626' : '#10B981' },
                    ]}
                  />
                  <View>
                    <Text style={styles.timeText}>{timeStr}</Text>
                    <Text style={styles.dateText}>{dateStr}</Text>
                  </View>
                </View>

                <View style={styles.timelineRight}>
                  <View style={styles.durationPill}>
                    <Clock size={12} color="#475569" />
                    <Text style={styles.durationText}>{formatSeconds(visit.durationSeconds)}</Text>
                  </View>
                  <View
                    style={[
                      styles.outcomeBadge,
                      { backgroundColor: isEmergency ? '#FEF2F2' : '#F0FDF4' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.outcomeBadgeText,
                        { color: isEmergency ? '#DC2626' : '#059669' },
                      ]}
                    >
                      {isEmergency ? 'Emergency' : 'Normal'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  anomalyBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: spacing.md,
  },
  anomalyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  anomalyIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  anomalyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  anomalyDesc: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
    marginBottom: 6,
  },
  anomalyNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  anomalyNoticeText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  statNumber: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  simulateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  simulateBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginTop: 8,
    marginBottom: 2,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
  },
  timelineList: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  timelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  timelineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  outcomeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  timelineRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  durationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  outcomeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  outcomeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
