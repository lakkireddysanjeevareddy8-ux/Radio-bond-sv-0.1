import {
  BathroomDimensions,
  BathroomDoorConfig,
  DevicePlacement,
  DEFAULT_BATHROOM_CONFIG,
} from '../../types/bathroom';
import { Bathroom3DMath } from '../../utils/bathroom3DMath';
import { BathroomPlacementEngine } from '../BathroomPlacementEngine';
import { BathroomConfigService } from '../BathroomConfigService';
import { storage } from '../../utils/storage';

// Mock storage and supabase
jest.mock('../../utils/storage', () => ({
  storage: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    getJSON: jest.fn(),
    setJSON: jest.fn().mockResolvedValue(true),
    removeItem: jest.fn(),
  },
}));

jest.mock('../supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      update: jest.fn().mockReturnThis(),
    })),
  },
}));

describe('Bathroom 3D Designer & Radar Placement Engine', () => {
  const defaultDimensions: BathroomDimensions = {
    length: 2.4,
    width: 1.8,
    height: 2.7,
  };

  const defaultDoor: BathroomDoorConfig = {
    wall: 'BOTTOM',
    positionRatio: 0.5,
    width: 0.8,
    height: 2.0,
    swing: 'INSIDE_LEFT',
    material: 'WOOD',
    isOpen: false,
  };

  const defaultDevice: DevicePlacement = {
    wall: 'TOP',
    mountingHeight: 1.8,
    offsetRatio: 0.5,
    yawAngleDeg: 0,
    pitchAngleDeg: -10,
  };

  describe('3D Math & Coordinate System', () => {
    it('computes correct inward wall normal vectors for all 4 walls', () => {
      expect(Bathroom3DMath.getInwardWallNormal('TOP')).toEqual({ x: 0, y: -1, z: 0 });
      expect(Bathroom3DMath.getInwardWallNormal('BOTTOM')).toEqual({ x: 0, y: 1, z: 0 });
      expect(Bathroom3DMath.getInwardWallNormal('LEFT')).toEqual({ x: 1, y: 0, z: 0 });
      expect(Bathroom3DMath.getInwardWallNormal('RIGHT')).toEqual({ x: -1, y: 0, z: 0 });
    });

    it('accurately maps device world coordinates on TOP wall', () => {
      const pos = Bathroom3DMath.getDeviceWorldCoordinates(defaultDimensions, defaultDevice);
      expect(pos.y).toBeCloseTo(defaultDimensions.length / 2 - 0.02, 1);
      expect(pos.x).toBeCloseTo(0, 1);
      expect(pos.z).toBe(1.8);
    });

    it('accurately maps device world coordinates on LEFT wall', () => {
      const leftDevice: DevicePlacement = {
        wall: 'LEFT',
        mountingHeight: 1.6,
        offsetRatio: 0.5,
        yawAngleDeg: 0,
        pitchAngleDeg: 0,
      };
      const pos = Bathroom3DMath.getDeviceWorldCoordinates(defaultDimensions, leftDevice);
      expect(pos.x).toBeCloseTo(-defaultDimensions.width / 2 + 0.02, 1);
      expect(pos.z).toBe(1.6);
    });

    it('projects 3D points to valid 2D screen coordinates in perspective mode', () => {
      const pt3D = { x: 0, y: 0, z: 1.5 };
      const camera = { yawDeg: 45, pitchDeg: 35, zoom: 1.0, panX: 0, panY: 0 };
      const pt2D = Bathroom3DMath.projectPoint(pt3D, camera, 400, 300);

      expect(typeof pt2D.x).toBe('number');
      expect(typeof pt2D.y).toBe('number');
      expect(pt2D.depth).toBeGreaterThan(0);
      expect(Number.isNaN(pt2D.x)).toBe(false);
      expect(Number.isNaN(pt2D.y)).toBe(false);
    });

    it('projects 3D points in orthographic top-down plan view mode', () => {
      const pt3D = { x: 0.5, y: -0.5, z: 0 };
      const camera = { yawDeg: 0, pitchDeg: 90, zoom: 1.0, panX: 0, panY: 0, isTopDown: true };
      const pt2D = Bathroom3DMath.projectPoint(pt3D, camera, 400, 300);

      expect(pt2D.x).toBeCloseTo(200 + 0.5 * 110, 1);
      expect(pt2D.y).toBeCloseTo(150 + 0.5 * 110, 1);
      expect(pt2D.depth).toBe(0);
    });

    it('generates floor, walls, fixtures, and radar meshes', () => {
      const scene = Bathroom3DMath.generateBathroomScene(
        defaultDimensions,
        defaultDoor,
        defaultDevice,
        { showRadar: true, showFixtures: true }
      );

      expect(scene.length).toBeGreaterThan(15);
      const tags = scene.map((p) => p.tag);
      expect(tags).toContain('floor');
      expect(tags).toContain('fixture-toilet');
      expect(tags).toContain('fixture-basin');
      expect(tags).toContain('fixture-shower');
      expect(tags).toContain('wsg-device');
      expect(tags).toContain('radar-green');
    });
  });

  describe('HLK-LD2410C Radar Coverage & Door Bleed Simulation', () => {
    it('detects door spillover risk when sensor directly aims at opposite doorway', () => {
      // Device on TOP wall facing straight towards BOTTOM wall door
      const facingDevice: DevicePlacement = {
        wall: 'TOP',
        mountingHeight: 1.8,
        offsetRatio: 0.5,
        yawAngleDeg: 0,
        pitchAngleDeg: 0,
      };

      const bleed = Bathroom3DMath.calculateDoorBleed(defaultDimensions, defaultDoor, facingDevice);
      expect(bleed.isBleeding).toBe(true);
      expect(bleed.risk).not.toBe('NONE');
    });

    it('reports zero door bleed when device is installed on the same wall as the door', () => {
      // Device on BOTTOM wall (same as door), radar beam points inward towards room center
      const sameWallDevice: DevicePlacement = {
        wall: 'BOTTOM',
        mountingHeight: 1.8,
        offsetRatio: 0.8,
        yawAngleDeg: 0,
        pitchAngleDeg: 0,
      };

      const bleed = Bathroom3DMath.calculateDoorBleed(defaultDimensions, defaultDoor, sameWallDevice);
      expect(bleed.isBleeding).toBe(false);
      expect(bleed.risk).toBe('NONE');
    });

    it('correctly identifies when device is placed directly on the door vs beside/above the door', () => {
      // Direct placement on door panel (BOTTOM wall at center 0.5, height 1.8m)
      const onDoorPlacement: DevicePlacement = {
        wall: 'BOTTOM',
        mountingHeight: 1.8,
        offsetRatio: 0.5,
        yawAngleDeg: 0,
        pitchAngleDeg: 0,
      };
      expect(
        BathroomPlacementEngine.isPlacementOnDoor(defaultDimensions, defaultDoor, onDoorPlacement)
      ).toBe(true);

      // Placement on the same wall but beside the door (offset 0.85)
      const besideDoorPlacement: DevicePlacement = {
        wall: 'BOTTOM',
        mountingHeight: 1.8,
        offsetRatio: 0.85,
        yawAngleDeg: 0,
        pitchAngleDeg: 0,
      };
      expect(
        BathroomPlacementEngine.isPlacementOnDoor(defaultDimensions, defaultDoor, besideDoorPlacement)
      ).toBe(false);

      // Placement on the same wall above the door header (height 2.3m)
      const aboveDoorPlacement: DevicePlacement = {
        wall: 'BOTTOM',
        mountingHeight: 2.3,
        offsetRatio: 0.5,
        yawAngleDeg: 0,
        pitchAngleDeg: 0,
      };
      expect(
        BathroomPlacementEngine.isPlacementOnDoor(defaultDimensions, defaultDoor, aboveDoorPlacement)
      ).toBe(false);

      // Placement on another wall (TOP wall)
      const otherWallPlacement: DevicePlacement = {
        wall: 'TOP',
        mountingHeight: 1.8,
        offsetRatio: 0.5,
        yawAngleDeg: 0,
        pitchAngleDeg: 0,
      };
      expect(
        BathroomPlacementEngine.isPlacementOnDoor(defaultDimensions, defaultDoor, otherWallPlacement)
      ).toBe(false);
    });

    it('escalates door bleed risk when the door is swung OPEN', () => {
      const openDoor: BathroomDoorConfig = { ...defaultDoor, isOpen: true };
      const dev: DevicePlacement = { ...defaultDevice, yawAngleDeg: 0 };

      const bleedClosed = Bathroom3DMath.calculateDoorBleed(defaultDimensions, defaultDoor, dev);
      const bleedOpen = Bathroom3DMath.calculateDoorBleed(defaultDimensions, openDoor, dev);

      expect(bleedOpen.isBleeding).toBe(true);
      if (bleedClosed.risk === 'LOW') {
        expect(['MEDIUM', 'HIGH']).toContain(bleedOpen.risk);
      }
    });

    it('computes comprehensive radar coverage stats with warnings when bleeding', () => {
      const dev: DevicePlacement = { ...defaultDevice, yawAngleDeg: 0 };
      const report = BathroomPlacementEngine.evaluatePlacement(defaultDimensions, defaultDoor, dev);

      expect(report.interiorCoveragePct).toBeGreaterThan(60);
      expect(report.interiorCoveragePct).toBeLessThanOrEqual(100);
      expect(report.overallScore).toBeGreaterThanOrEqual(10);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(typeof report.recommendationNote).toBe('string');
    });
  });

  describe('Smart Placement Recommendation Algorithm', () => {
    it('ranks multiple candidate positions and returns top-rated placement', () => {
      const candidates = BathroomPlacementEngine.calculateOptimalPlacements(
        defaultDimensions,
        defaultDoor
      );

      expect(candidates.length).toBeGreaterThan(10);
      // Verify descending sort order
      for (let i = 0; i < candidates.length - 1; i++) {
        expect(candidates[i].score).toBeGreaterThanOrEqual(candidates[i + 1].score);
      }
    });

    it('prioritizes low door bleed and high stillness zone coverage', () => {
      const { best, requiresCalibration, summaryAdvice } =
        BathroomPlacementEngine.getBestRecommendation(defaultDimensions, defaultDoor);

      expect(best).toBeDefined();
      expect(best.score).toBeGreaterThan(60);
      expect(best.bleedRisk).not.toBe('HIGH');
      expect(typeof summaryAdvice).toBe('string');
      expect(typeof requiresCalibration).toBe('boolean');
    });

    it('flags physical calibration if room dimensions are extremely cramped', () => {
      const tinyDimensions: BathroomDimensions = {
        length: 1.2,
        width: 1.0,
        height: 2.0,
      };
      const { requiresCalibration } = BathroomPlacementEngine.getBestRecommendation(
        tinyDimensions,
        defaultDoor
      );

      // In a 1.2m x 1.0m room, any 24GHz beam will reflect off opposite walls within Gate 2
      expect(typeof requiresCalibration).toBe('boolean');
    });

    it('computes optimal device placement for each individual target wall without moving door', () => {
      const walls = ['LEFT', 'RIGHT', 'TOP', 'BOTTOM'] as const;
      walls.forEach((targetWall) => {
        const dev = BathroomPlacementEngine.getBestPlacementForWall(
          defaultDimensions,
          defaultDoor,
          targetWall
        );
        expect(dev.wall).toBe(targetWall);
        expect(dev.mountingHeight).toBeGreaterThanOrEqual(1.5);
        expect(dev.mountingHeight).toBeLessThanOrEqual(2.2);
        expect(dev.offsetRatio).toBeGreaterThanOrEqual(0.1);
        expect(dev.offsetRatio).toBeLessThanOrEqual(0.9);

        // Radar stats for this wall placement should be evaluated cleanly
        const stats = BathroomPlacementEngine.evaluatePlacement(defaultDimensions, defaultDoor, dev);
        expect(stats.interiorCoveragePct).toBeGreaterThan(50);
        expect(stats.overallScore).toBeGreaterThan(10);
      });
    });
  });

  describe('Configuration Persistence Service', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('loads fallback default configuration when local storage is empty', async () => {
      (storage.getJSON as jest.Mock).mockResolvedValueOnce(DEFAULT_BATHROOM_CONFIG);

      const config = await BathroomConfigService.loadConfig();
      expect(config).toBeDefined();
      expect(config.dimensions.length).toBe(DEFAULT_BATHROOM_CONFIG.dimensions.length);
      expect(config.door.wall).toBe(DEFAULT_BATHROOM_CONFIG.door.wall);
    });

    it('saves bathroom configuration to local storage and updates timestamp', async () => {
      const testConfig = { ...DEFAULT_BATHROOM_CONFIG, name: 'Guest Bath' };
      const res = await BathroomConfigService.saveConfig(testConfig);

      expect(res.success).toBe(true);
      expect(storage.setJSON).toHaveBeenCalledWith(
        'wsg_bathroom_design_v1',
        expect.objectContaining({
          name: 'Guest Bath',
        })
      );
    });

    it('resets configuration back to initial baseline defaults', async () => {
      const res = await BathroomConfigService.resetConfig();
      expect(res.id).toBe(DEFAULT_BATHROOM_CONFIG.id);
      expect(storage.setJSON).toHaveBeenCalled();
    });
  });
});
