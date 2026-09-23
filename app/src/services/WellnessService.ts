import { supabase } from './supabaseClient';
import { storage } from '../utils/storage';
import { VisitRecord, WellnessStats, VisitOutcome } from '../types';

const STORAGE_PREFIX = 'wsg_visit_log_';

class WellnessServiceClass {
  private activeVisitStarts: Map<string, number> = new Map();
  private lastPresenceState: Map<string, boolean> = new Map();
  private onStatsUpdatedCallbacks: Set<(deviceId: string, stats: WellnessStats) => void> = new Set();

  public subscribeToStats(cb: (deviceId: string, stats: WellnessStats) => void) {
    this.onStatsUpdatedCallbacks.add(cb);
    return () => this.onStatsUpdatedCallbacks.delete(cb);
  }

  /**
   * Hook into incoming telemetry presence to detect visit start & finish
   */
  public handleTelemetryPresence(deviceId: string, presence: boolean, isEmergencyActive: boolean = false) {
    const prevPresence = this.lastPresenceState.get(deviceId) ?? false;
    this.lastPresenceState.set(deviceId, presence);

    // 1. Person entered washroom: false -> true
    if (!prevPresence && presence) {
      this.activeVisitStarts.set(deviceId, Date.now());
      return;
    }

    // 2. Person exited washroom: true -> false
    if (prevPresence && !presence) {
      const startTime = this.activeVisitStarts.get(deviceId);
      this.activeVisitStarts.delete(deviceId);

      if (startTime) {
        const durationSec = Math.round((Date.now() - startTime) / 1000);
        // Ignore noise / radar flicker under 3 seconds
        if (durationSec >= 3) {
          const outcome: VisitOutcome = isEmergencyActive ? 'EMERGENCY' : 'NORMAL';
          this.recordVisit(deviceId, new Date(startTime).toISOString(), new Date().toISOString(), durationSec, outcome);
        }
      }
    }
  }

  /**
   * Persist visit record to Supabase and local cache
   */
  public async recordVisit(
    deviceId: string,
    startedAt: string,
    endedAt: string,
    durationSeconds: number,
    outcome: VisitOutcome = 'NORMAL'
  ): Promise<VisitRecord | null> {
    const record: VisitRecord = {
      id: `v_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      deviceId,
      startedAt,
      endedAt,
      durationSeconds,
      outcome,
      createdAt: new Date().toISOString(),
    };

    // 1. Optimistic local cache update
    const current = await this.getVisitHistory(deviceId);
    const updated = [record, ...current].slice(0, 100);
    await storage.setJSON(STORAGE_PREFIX + deviceId, updated);

    // 2. Push to Supabase
    try {
      await supabase.from('visit_log').insert({
        device_id: deviceId,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        outcome,
      });
    } catch (e) {
      console.warn('[WellnessService] Supabase insert note:', e);
    }

    // 3. Re-calculate stats and notify listeners
    const stats = this.computeStats(updated);
    this.onStatsUpdatedCallbacks.forEach((cb) => cb(deviceId, stats));

    return record;
  }

  /**
   * Fetch recent visit history
   */
  public async getVisitHistory(deviceId: string): Promise<VisitRecord[]> {
    if (!deviceId) return [];

    try {
      const { data, error } = await supabase
        .from('visit_log')
        .select('*')
        .eq('device_id', deviceId)
        .order('started_at', { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        const mapped: VisitRecord[] = data.map((r: any) => ({
          id: String(r.id),
          deviceId: r.device_id,
          startedAt: r.started_at,
          endedAt: r.ended_at,
          durationSeconds: r.duration_seconds,
          outcome: r.outcome,
          createdAt: r.created_at,
        }));
        await storage.setJSON(STORAGE_PREFIX + deviceId, mapped);
        return mapped;
      }
    } catch {}

    return await storage.getJSON<VisitRecord[]>(STORAGE_PREFIX + deviceId, this.getDemoVisits(deviceId));
  }

  /**
   * Deterministic statistical wellness calculation (rolling averages & absence anomaly check)
   */
  public computeStats(visits: VisitRecord[]): WellnessStats {
    if (!visits || visits.length === 0) {
      return {
        todayVisitCount: 0,
        avgDurationSeconds: 0,
        lastVisitEndedAt: null,
        interVisitAvgMinutes: 180, // default 3 hours
        hasAnomaly: false,
      };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // 1. Visits today
    const todayVisits = visits.filter((v) => new Date(v.startedAt).getTime() >= todayStart);
    const todayCount = todayVisits.length;

    // 2. Average duration of normal visits
    const normalVisits = visits.filter((v) => v.outcome === 'NORMAL');
    const avgDuration =
      normalVisits.length > 0
        ? Math.round(normalVisits.reduce((acc, v) => acc + v.durationSeconds, 0) / normalVisits.length)
        : 180;

    // 3. Most recent visit end time
    const lastVisit = visits[0];
    const lastVisitEndedAt = lastVisit ? lastVisit.endedAt : null;

    // 4. Typical inter-visit interval (time between consecutive visits)
    let totalGapMinutes = 0;
    let gapCount = 0;

    for (let i = 0; i < visits.length - 1; i++) {
      const currentVisitStart = new Date(visits[i].startedAt).getTime();
      const prevVisitEnd = new Date(visits[i + 1].endedAt).getTime();
      const gapMin = Math.round((currentVisitStart - prevVisitEnd) / (1000 * 60));
      // Only include reasonable daytime gaps (< 12 hours) to avoid night sleep skew
      if (gapMin > 10 && gapMin < 720) {
        totalGapMinutes += gapMin;
        gapCount++;
      }
    }

    const interVisitAvgMinutes = gapCount > 0 ? Math.round(totalGapMinutes / gapCount) : 210; // ~3.5 hours

    // 5. Anomaly detection: Has it been 2x longer than the typical inter-visit gap?
    let hasAnomaly = false;
    let anomalyReason: string | undefined;

    if (lastVisitEndedAt) {
      const elapsedSinceLastVisitMin = Math.round((Date.now() - new Date(lastVisitEndedAt).getTime()) / (1000 * 60));
      const anomalyThresholdMin = Math.max(interVisitAvgMinutes * 2, 480); // At least 8 hours threshold

      if (elapsedSinceLastVisitMin >= anomalyThresholdMin) {
        hasAnomaly = true;
        const hoursElapsed = (elapsedSinceLastVisitMin / 60).toFixed(1);
        const typicalHours = (interVisitAvgMinutes / 60).toFixed(1);
        anomalyReason = `No washroom visit in ${hoursElapsed}h (typical inter-visit gap is ~${typicalHours}h).`;
      }
    }

    return {
      todayVisitCount: todayCount,
      avgDurationSeconds: avgDuration,
      lastVisitEndedAt,
      interVisitAvgMinutes,
      hasAnomaly,
      anomalyReason,
    };
  }

  /**
   * Sample demo visits for simulator and fresh demo installations
   */
  private getDemoVisits(deviceId: string): VisitRecord[] {
    const now = Date.now();
    return [
      {
        id: 'v_demo_1',
        deviceId,
        startedAt: new Date(now - 1000 * 60 * 45).toISOString(),
        endedAt: new Date(now - 1000 * 60 * 42).toISOString(),
        durationSeconds: 180,
        outcome: 'NORMAL',
        createdAt: new Date(now - 1000 * 60 * 45).toISOString(),
      },
      {
        id: 'v_demo_2',
        deviceId,
        startedAt: new Date(now - 1000 * 60 * 210).toISOString(),
        endedAt: new Date(now - 1000 * 60 * 206).toISOString(),
        durationSeconds: 240,
        outcome: 'NORMAL',
        createdAt: new Date(now - 1000 * 60 * 210).toISOString(),
      },
      {
        id: 'v_demo_3',
        deviceId,
        startedAt: new Date(now - 1000 * 60 * 390).toISOString(),
        endedAt: new Date(now - 1000 * 60 * 387).toISOString(),
        durationSeconds: 160,
        outcome: 'NORMAL',
        createdAt: new Date(now - 1000 * 60 * 390).toISOString(),
      },
    ];
  }
}

export const WellnessService = new WellnessServiceClass();
