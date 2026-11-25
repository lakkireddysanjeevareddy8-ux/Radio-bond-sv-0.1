import React from 'react';
import { View, Text, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Radio, ShieldAlert, Activity, Eye, Info } from 'lucide-react-native';
import { colors, borderRadius, shadows } from '../utils/theme';

export interface RadarZoneInfo {
  name: string;
  rangeDesc: string;
  color: string;
  description: string;
}

export const LD2410C_RADAR_ZONES: RadarZoneInfo[] = [
  {
    name: 'Core Presence',
    rangeDesc: '< 1.8m',
    color: '#10B981',
    description: 'High-sensitivity stillness zone (breathing, micro-motion).',
  },
  {
    name: 'Body Motion',
    rangeDesc: '1.8m - 3.0m',
    color: '#06B6D4',
    description: 'Normal walking & active body movement detection.',
  },
  {
    name: 'Edge Motion',
    rangeDesc: '3.0m - 4.0m',
    color: '#F59E0B',
    description: 'Perimeter sensitivity zone with moderate threshold.',
  },
  {
    name: 'Fringe Boundary',
    rangeDesc: '4.0m - 4.8m',
    color: '#F97316',
    description: 'Outer signal attenuation boundary near walls.',
  },
  {
    name: 'Doorway Leak',
    rangeDesc: 'Spillover',
    color: '#EF4444',
    description: 'Unwanted radar leakage escaping through entrance door.',
  },
];

interface RadarVolumetricLegendProps {
  compact?: boolean;
  showBleed?: boolean;
}

/**
 * Reusable color legend for the 3D Volumetric Radar Coverage Visualization.
 * Fully responsive across mobile phones and desktop displays.
 */
export const RadarVolumetricLegend: React.FC<RadarVolumetricLegendProps> = ({
  compact = false,
  showBleed = true,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 640;

  const zonesToDisplay = showBleed
    ? LD2410C_RADAR_ZONES
    : LD2410C_RADAR_ZONES.filter((z) => z.color !== '#EF4444');

  return (
    <View style={styles.legendWrapper}>
      <View style={[styles.legendItemsContainer, isMobile && styles.legendItemsMobile]}>
        {zonesToDisplay.map((zone) => (
          <View key={zone.name} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: zone.color }]} />
            <Text style={styles.legendLabelText}>{zone.name}</Text>
            {!compact && <Text style={styles.legendRangeText}>({zone.rangeDesc})</Text>}
          </View>
        ))}
      </View>
    </View>
  );
};

interface RadarSimulatedNoticeProps {
  style?: any;
}

/**
 * Notice banner clearly distinguishing simulated volumetric coverage from live sensor targets.
 */
export const RadarSimulatedNotice: React.FC<RadarSimulatedNoticeProps> = ({ style }) => {
  return (
    <View style={[styles.noticeContainer, style]}>
      <Info size={14} color="#38BDF8" style={{ marginTop: 1 }} />
      <Text style={styles.noticeText}>
        <Text style={styles.noticeBold}>Simulated LD2410C 24GHz FMCW Model: </Text>
        Displays volumetric 60° azimuth fan and boundary rays based on room geometry. Actual sensor sensitivity gates can be fine-tuned via ESP32 BLE firmware settings.
      </Text>
    </View>
  );
};

interface RadarSpecsPillsProps {
  mountingHeight?: number;
  yawDeg?: number;
}

/**
 * Quick radar hardware specifications pill row
 */
export const RadarSpecsPills: React.FC<RadarSpecsPillsProps> = ({
  mountingHeight,
  yawDeg,
}) => {
  return (
    <View style={styles.specsRow}>
      <View style={styles.specPill}>
        <Radio size={11} color="#10B981" />
        <Text style={styles.specPillText}>24 GHz FMCW mmWave</Text>
      </View>
      <View style={styles.specPill}>
        <Activity size={11} color="#06B6D4" />
        <Text style={styles.specPillText}>60° Azimuth • 45° Elevation</Text>
      </View>
      <View style={styles.specPill}>
        <Text style={styles.specPillText}>Range: 4.8m (8 Gates)</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  legendWrapper: {
    width: '100%',
    paddingVertical: 4,
  },
  legendItemsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItemsMobile: {
    justifyContent: 'flex-start',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  legendLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  legendRangeText: {
    fontSize: 9,
    color: '#94A3B8',
  },
  noticeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  noticeBold: {
    fontWeight: '700',
    color: '#38BDF8',
  },
  noticeText: {
    fontSize: 11,
    color: '#BAE6FD',
    lineHeight: 16,
    flex: 1,
  },
  specsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  specPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  specPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#CBD5E1',
  },
});
