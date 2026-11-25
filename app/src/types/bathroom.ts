export type DoorWall = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

export type DoorSwing = 'INSIDE_LEFT' | 'INSIDE_RIGHT' | 'OUTSIDE_LEFT' | 'OUTSIDE_RIGHT';

export type DoorMaterial = 'WOOD' | 'GLASS' | 'METAL' | 'OTHER';

export interface BathroomDimensions {
  length: number; // Y-axis depth in meters (e.g. 2.4)
  width: number;  // X-axis width in meters (e.g. 1.8)
  height: number; // Z-axis ceiling height in meters (e.g. 2.7)
}

export interface BathroomDoorConfig {
  wall: DoorWall;
  positionRatio: number; // 0.1 to 0.9 along the wall
  width: number;         // in meters (e.g. 0.8)
  height: number;        // in meters (e.g. 2.0)
  swing: DoorSwing;
  material: DoorMaterial;
  isOpen: boolean;       // for dynamic radar leak testing
}

export interface DevicePlacement {
  wall: DoorWall;
  mountingHeight: number;  // in meters from floor (e.g. 1.8)
  offsetRatio: number;     // 0.1 to 0.9 along the wall (0.5 = center)
  yawAngleDeg: number;     // -60 to +60 degrees relative to wall inward normal
  pitchAngleDeg: number;   // -30 to +30 degrees tilt
}

export interface FixtureLayout {
  toilet: { wall: DoorWall; offsetRatio: number };
  basin: { wall: DoorWall; offsetRatio: number };
  shower: { wall: DoorWall; corner: 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT'; size: number };
}

export type DoorBleedSeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface RadarCoverageReport {
  interiorCoveragePct: number; // 0 to 100
  doorBleedRisk: DoorBleedSeverity;
  doorBleedPct: number;        // estimated % of beam escaping doorway
  isDirectlyFacingDoor: boolean;
  distanceToDoorMeters: number;
  overallScore: number;        // 0 to 100
  recommendationNote: string;
  warningNote?: string;
}

export interface RecommendedPlacement {
  wall: DoorWall;
  mountingHeight: number;
  offsetRatio: number;
  yawAngleDeg: number;
  score: number;
  coveragePct: number;
  bleedRisk: DoorBleedSeverity;
  reason: string;
}

export interface Bathroom3DConfig {
  id: string;
  deviceId?: string;
  name: string;
  dimensions: BathroomDimensions;
  door: BathroomDoorConfig;
  device: DevicePlacement;
  fixtures?: FixtureLayout;
  stats?: RadarCoverageReport;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_BATHROOM_CONFIG: Bathroom3DConfig = {
  id: 'bth-default-01',
  name: 'Master Bathroom',
  dimensions: {
    length: 2.4,
    width: 1.8,
    height: 2.7,
  },
  door: {
    wall: 'BOTTOM',
    positionRatio: 0.5,
    width: 0.8,
    height: 2.0,
    swing: 'INSIDE_LEFT',
    material: 'WOOD',
    isOpen: false,
  },
  device: {
    wall: 'TOP',
    mountingHeight: 1.8,
    offsetRatio: 0.5,
    yawAngleDeg: 0,
    pitchAngleDeg: -10,
  },
  fixtures: {
    toilet: { wall: 'RIGHT', offsetRatio: 0.7 },
    basin: { wall: 'LEFT', offsetRatio: 0.5 },
    shower: { wall: 'TOP', corner: 'TOP_LEFT', size: 0.9 },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
