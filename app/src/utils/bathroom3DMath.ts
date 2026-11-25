import {
  BathroomDimensions,
  BathroomDoorConfig,
  DevicePlacement,
  DoorWall,
  DoorMaterial,
} from '../types/bathroom';

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Point2D {
  x: number;
  y: number;
  depth: number;
}

export interface Polygon3D {
  id: string;
  points: Point3D[];
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  tag?: string;
  normal?: Point3D;
  isWireframe?: boolean;
}

export interface ProjectedPolygon {
  id: string;
  points: { x: number; y: number }[];
  avgDepth: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
  opacity?: number;
  tag?: string;
}

export interface CameraOptions {
  yawDeg: number;       // Orbit angle around vertical Z/Y axis (0 - 360)
  pitchDeg: number;     // Tilt angle (10 - 85 deg)
  zoom: number;         // Scale factor (0.5 - 2.5)
  panX: number;         // Screen horizontal offset
  panY: number;         // Screen vertical offset
  isTopDown?: boolean;  // Orthographic plan view mode
}

/**
 * 3D Coordinate Convention for Bathroom Space:
 * X: Left (-width/2) to Right (+width/2)
 * Y: Bottom (-length/2) to Top (+length/2)
 * Z: Floor (0) to Ceiling (+height)
 */

export class Bathroom3DMath {
  /**
   * Projects a 3D point in world space into 2D screen coordinates
   */
  public static projectPoint(
    pt: Point3D,
    camera: CameraOptions,
    viewportWidth: number,
    viewportHeight: number
  ): Point2D {
    const cx = viewportWidth / 2 + camera.panX;
    const cy = viewportHeight / 2 + camera.panY;

    if (camera.isTopDown) {
      // Direct orthographic top-down plan view
      const scale = 110 * camera.zoom;
      return {
        x: cx + pt.x * scale,
        y: cy - pt.y * scale,
        depth: pt.z,
      };
    }

    // Convert degrees to radians
    const yawRad = ((camera.yawDeg % 360) * Math.PI) / 180;
    const pitchRad = ((camera.pitchDeg % 360) * Math.PI) / 180;

    // 1. Rotate around Z (Yaw)
    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);
    const x1 = pt.x * cosY - pt.y * sinY;
    const y1 = pt.x * sinY + pt.y * cosY;
    const z1 = pt.z;

    // 2. Rotate around X (Pitch tilt)
    const cosP = Math.cos(pitchRad);
    const sinP = Math.sin(pitchRad);
    const x2 = x1;
    const y2 = y1 * cosP - (z1 - 1.2) * sinP;
    const z2 = y1 * sinP + (z1 - 1.2) * cosP;

    // 3. Perspective projection
    const cameraDistance = 5.2 / camera.zoom;
    const fov = 380;
    const distanceZ = cameraDistance + y2;
    const clampedZ = Math.max(distanceZ, 0.4);

    const projX = cx + (x2 * fov) / clampedZ;
    const projY = cy - (z2 * fov) / clampedZ;

    return {
      x: projX,
      y: projY,
      depth: distanceZ,
    };
  }

  /**
   * Projects an entire 3D polygon and computes its average depth for sorting
   */
  public static projectPolygon(
    poly: Polygon3D,
    camera: CameraOptions,
    width: number,
    height: number
  ): ProjectedPolygon {
    const projectedPts = poly.points.map((p) =>
      this.projectPoint(p, camera, width, height)
    );

    const avgDepth =
      projectedPts.reduce((acc, p) => acc + p.depth, 0) / projectedPts.length;

    return {
      id: poly.id,
      points: projectedPts.map((p) => ({ x: p.x, y: p.y })),
      avgDepth,
      color: poly.color,
      strokeColor: poly.strokeColor,
      strokeWidth: poly.strokeWidth,
      opacity: poly.opacity ?? 1,
      tag: poly.tag,
    };
  }

  /**
   * Generates all 3D mesh polygons for the bathroom scene
   */
  public static generateBathroomScene(
    dimensions: BathroomDimensions,
    door: BathroomDoorConfig,
    device: DevicePlacement,
    options: {
      showRadar?: boolean;
      showFixtures?: boolean;
      transparentWalls?: boolean;
      radarResolution?: number;
      pulsePhase?: number;
    } = {}
  ): Polygon3D[] {
    const polygons: Polygon3D[] = [];
    const W = Math.max(dimensions.width, 1.0);
    const L = Math.max(dimensions.length, 1.0);
    const H = Math.max(dimensions.height, 1.8);

    const halfW = W / 2;
    const halfL = L / 2;

    // 1. FLOOR TILES (Modern light grey / stone slate grid)
    polygons.push({
      id: 'floor-base',
      points: [
        { x: -halfW, y: -halfL, z: 0 },
        { x: halfW, y: -halfL, z: 0 },
        { x: halfW, y: halfL, z: 0 },
        { x: -halfW, y: halfL, z: 0 },
      ],
      color: '#E2E8F0',
      strokeColor: '#CBD5E1',
      strokeWidth: 1.5,
      tag: 'floor',
    });

    // Floor tile grid lines (subdivisions)
    const tileStep = 0.6; // 60cm tiles
    let tileIndex = 0;
    for (let x = -halfW; x <= halfW; x += tileStep) {
      polygons.push({
        id: `tile-x-${tileIndex++}`,
        points: [
          { x, y: -halfL, z: 0.002 },
          { x, y: halfL, z: 0.002 },
        ],
        color: '#CBD5E1',
        strokeColor: '#94A3B8',
        strokeWidth: 0.8,
        isWireframe: true,
        tag: 'floor-grid',
      });
    }
    for (let y = -halfL; y <= halfL; y += tileStep) {
      polygons.push({
        id: `tile-y-${tileIndex++}`,
        points: [
          { x: -halfW, y, z: 0.002 },
          { x: halfW, y, z: 0.002 },
        ],
        color: '#CBD5E1',
        strokeColor: '#94A3B8',
        strokeWidth: 0.8,
        isWireframe: true,
        tag: 'floor-grid',
      });
    }

    // 2. WALLS & DOORWAY
    // Wall colors with directional shading
    const wallColorNorth = '#F1F5F9';
    const wallColorSouth = '#E2E8F0';
    const wallColorEast = '#E2E8F0';
    const wallColorWest = '#CBD5E1';
    const wallOpacity = options.transparentWalls ? 0.35 : 0.85;

    // Helper to generate a wall with or without doorway cutout
    const addWall = (
      wallId: DoorWall,
      p1: Point3D,
      p2: Point3D,
      baseColor: string
    ) => {
      const isDoorWall = door.wall === wallId;

      if (!isDoorWall) {
        // Solid wall
        polygons.push({
          id: `wall-${wallId}`,
          points: [
            { x: p1.x, y: p1.y, z: 0 },
            { x: p2.x, y: p2.y, z: 0 },
            { x: p2.x, y: p2.y, z: H },
            { x: p1.x, y: p1.y, z: H },
          ],
          color: baseColor,
          strokeColor: '#94A3B8',
          strokeWidth: 1,
          opacity: wallOpacity,
          tag: `wall-${wallId}`,
        });
        return;
      }

      // Door wall: split into Left Segment, Top Header, and Right Segment around doorway
      const doorW = Math.min(door.width, 1.2);
      const doorH = Math.min(door.height, H - 0.2);

      // Wall length
      const wallLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const doorCenterDist = wallLen * door.positionRatio;
      const doorStartDist = Math.max(0.1, doorCenterDist - doorW / 2);
      const doorEndDist = Math.min(wallLen - 0.1, doorCenterDist + doorW / 2);

      const dx = (p2.x - p1.x) / wallLen;
      const dy = (p2.y - p1.y) / wallLen;

      const d1x = p1.x + dx * doorStartDist;
      const d1y = p1.y + dy * doorStartDist;
      const d2x = p1.x + dx * doorEndDist;
      const d2y = p1.y + dy * doorEndDist;

      // Segment A (before door)
      polygons.push({
        id: `wall-${wallId}-segA`,
        points: [
          { x: p1.x, y: p1.y, z: 0 },
          { x: d1x, y: d1y, z: 0 },
          { x: d1x, y: d1y, z: H },
          { x: p1.x, y: p1.y, z: H },
        ],
        color: baseColor,
        strokeColor: '#94A3B8',
        strokeWidth: 1,
        opacity: wallOpacity,
        tag: `wall-${wallId}`,
      });

      // Segment Header (above door)
      polygons.push({
        id: `wall-${wallId}-header`,
        points: [
          { x: d1x, y: d1y, z: doorH },
          { x: d2x, y: d2y, z: doorH },
          { x: d2x, y: d2y, z: H },
          { x: d1x, y: d1y, z: H },
        ],
        color: baseColor,
        strokeColor: '#94A3B8',
        strokeWidth: 1,
        opacity: wallOpacity,
        tag: `wall-${wallId}`,
      });

      // Segment B (after door)
      polygons.push({
        id: `wall-${wallId}-segB`,
        points: [
          { x: d2x, y: d2y, z: 0 },
          { x: p2.x, y: p2.y, z: 0 },
          { x: p2.x, y: p2.y, z: H },
          { x: d2x, y: d2y, z: H },
        ],
        color: baseColor,
        strokeColor: '#94A3B8',
        strokeWidth: 1,
        opacity: wallOpacity,
        tag: `wall-${wallId}`,
      });

      // Door Frame
      polygons.push({
        id: `door-frame`,
        points: [
          { x: d1x, y: d1y, z: 0 },
          { x: d1x, y: d1y, z: doorH },
          { x: d2x, y: d2y, z: doorH },
          { x: d2x, y: d2y, z: 0 },
        ],
        color: 'transparent',
        strokeColor: '#475569',
        strokeWidth: 2.5,
        tag: 'door-frame',
      });

      // Door Panel
      const doorMaterialColors: Record<DoorMaterial, { bg: string; border: string; opacity: number }> = {
        WOOD: { bg: '#B45309', border: '#78350F', opacity: 0.9 },
        GLASS: { bg: '#38BDF8', border: '#0284C7', opacity: 0.35 },
        METAL: { bg: '#64748B', border: '#334155', opacity: 0.95 },
        OTHER: { bg: '#94A3B8', border: '#475569', opacity: 0.8 },
      };
      const dMat = doorMaterialColors[door.material] || doorMaterialColors.WOOD;

      if (!door.isOpen) {
        // Closed Door Panel
        polygons.push({
          id: 'door-panel-closed',
          points: [
            { x: d1x, y: d1y, z: 0.05 },
            { x: d2x, y: d2y, z: 0.05 },
            { x: d2x, y: d2y, z: doorH - 0.05 },
            { x: d1x, y: d1y, z: doorH - 0.05 },
          ],
          color: dMat.bg,
          strokeColor: dMat.border,
          strokeWidth: 1.5,
          opacity: dMat.opacity,
          tag: 'door-panel',
        });
      } else {
        // Open Door Panel (swung open 90 degrees inside room)
        const inwardNormal = this.getInwardWallNormal(wallId);
        const swungX = d1x + inwardNormal.x * (doorEndDist - doorStartDist);
        const swungY = d1y + inwardNormal.y * (doorEndDist - doorStartDist);

        polygons.push({
          id: 'door-panel-open',
          points: [
            { x: d1x, y: d1y, z: 0.05 },
            { x: swungX, y: swungY, z: 0.05 },
            { x: swungX, y: swungY, z: doorH - 0.05 },
            { x: d1x, y: d1y, z: doorH - 0.05 },
          ],
          color: dMat.bg,
          strokeColor: dMat.border,
          strokeWidth: 1.5,
          opacity: dMat.opacity * 0.8,
          tag: 'door-panel-open',
        });
      }
    };

    // Add 4 walls: TOP (North, y=+halfL), RIGHT (East, x=+halfW), BOTTOM (South, y=-halfL), LEFT (West, x=-halfW)
    addWall('TOP', { x: -halfW, y: halfL, z: 0 }, { x: halfW, y: halfL, z: 0 }, wallColorNorth);
    addWall('RIGHT', { x: halfW, y: halfL, z: 0 }, { x: halfW, y: -halfL, z: 0 }, wallColorEast);
    addWall('BOTTOM', { x: halfW, y: -halfL, z: 0 }, { x: -halfW, y: -halfL, z: 0 }, wallColorSouth);
    addWall('LEFT', { x: -halfW, y: -halfL, z: 0 }, { x: -halfW, y: halfL, z: 0 }, wallColorWest);

    // 3. FIXTURES (Toilet, Vanity Basin, Shower Area)
    if (options.showFixtures !== false) {
      this.generateFixtures(dimensions, polygons);
    }

    // 4. WSG-01 DEVICE REPRESENTATION
    this.generateDeviceMesh(dimensions, device, polygons);

    // 5. RADAR COVERAGE VOLUMETRIC CONE / SECTOR (HLK-LD2410C)
    if (options.showRadar !== false) {
      this.generateRadarCoverageMesh(dimensions, door, device, polygons, options.pulsePhase);
    }

    return polygons;
  }

  /**
   * Generates realistic 3D bathroom fixtures (Toilet, Basin, Shower Area)
   */
  private static generateFixtures(
    dim: BathroomDimensions,
    polygons: Polygon3D[]
  ): void {
    const halfW = dim.width / 2;
    const halfL = dim.length / 2;

    // A. TOILET (Positioned against Right Wall)
    const tX = halfW - 0.35;
    const tY = halfL * 0.3;
    const tZ = 0;

    // Toilet base / bowl
    polygons.push({
      id: 'toilet-bowl-top',
      points: [
        { x: tX - 0.22, y: tY - 0.25, z: 0.42 },
        { x: tX + 0.22, y: tY - 0.25, z: 0.42 },
        { x: tX + 0.18, y: tY + 0.25, z: 0.42 },
        { x: tX - 0.18, y: tY + 0.25, z: 0.42 },
      ],
      color: '#FFFFFF',
      strokeColor: '#94A3B8',
      strokeWidth: 1.5,
      tag: 'fixture-toilet',
    });

    // Toilet Tank (behind bowl against wall)
    polygons.push({
      id: 'toilet-tank-front',
      points: [
        { x: tX + 0.22, y: tY - 0.22, z: 0.42 },
        { x: tX + 0.22, y: tY + 0.22, z: 0.42 },
        { x: tX + 0.22, y: tY + 0.22, z: 0.82 },
        { x: tX + 0.22, y: tY - 0.22, z: 0.82 },
      ],
      color: '#F8FAFC',
      strokeColor: '#64748B',
      strokeWidth: 1.5,
      tag: 'fixture-toilet',
    });
    polygons.push({
      id: 'toilet-tank-top',
      points: [
        { x: tX + 0.05, y: tY - 0.22, z: 0.82 },
        { x: tX + 0.25, y: tY - 0.22, z: 0.82 },
        { x: tX + 0.25, y: tY + 0.22, z: 0.82 },
        { x: tX + 0.05, y: tY + 0.22, z: 0.82 },
      ],
      color: '#E2E8F0',
      strokeColor: '#64748B',
      strokeWidth: 1.5,
      tag: 'fixture-toilet',
    });

    // B. WASH BASIN / VANITY (Positioned against Left Wall)
    const bX = -halfW + 0.3;
    const bY = 0;
    const bW = 0.5;
    const bL = 0.7;
    const bH = 0.85;

    // Vanity counter top
    polygons.push({
      id: 'vanity-top',
      points: [
        { x: bX - 0.25, y: bY - bL / 2, z: bH },
        { x: bX + bW - 0.25, y: bY - bL / 2, z: bH },
        { x: bX + bW - 0.25, y: bY + bL / 2, z: bH },
        { x: bX - 0.25, y: bY + bL / 2, z: bH },
      ],
      color: '#0284C7', // Slate / Teal modern top
      strokeColor: '#0369A1',
      strokeWidth: 1.5,
      tag: 'fixture-basin',
    });

    // White ceramic basin sink inset
    polygons.push({
      id: 'basin-sink',
      points: [
        { x: bX - 0.15, y: bY - 0.22, z: bH + 0.01 },
        { x: bX + 0.15, y: bY - 0.22, z: bH + 0.01 },
        { x: bX + 0.15, y: bY + 0.22, z: bH + 0.01 },
        { x: bX - 0.15, y: bY + 0.22, z: bH + 0.01 },
      ],
      color: '#FFFFFF',
      strokeColor: '#94A3B8',
      strokeWidth: 1.2,
      tag: 'fixture-basin',
    });

    // Vanity Cabinet Front Face
    polygons.push({
      id: 'vanity-front',
      points: [
        { x: bX + bW - 0.25, y: bY - bL / 2, z: 0.1 },
        { x: bX + bW - 0.25, y: bY + bL / 2, z: 0.1 },
        { x: bX + bW - 0.25, y: bY + bL / 2, z: bH },
        { x: bX + bW - 0.25, y: bY - bL / 2, z: bH },
      ],
      color: '#0F172A',
      strokeColor: '#334155',
      strokeWidth: 1.2,
      tag: 'fixture-basin',
    });

    // Mirror on the wall above basin
    polygons.push({
      id: 'vanity-mirror',
      points: [
        { x: -halfW + 0.02, y: bY - 0.28, z: 1.15 },
        { x: -halfW + 0.02, y: bY + 0.28, z: 1.15 },
        { x: -halfW + 0.02, y: bY + 0.28, z: 1.85 },
        { x: -halfW + 0.02, y: bY - 0.28, z: 1.85 },
      ],
      color: '#BAE6FD',
      strokeColor: '#0284C7',
      strokeWidth: 2,
      opacity: 0.85,
      tag: 'fixture-mirror',
    });

    // C. SHOWER ENCLOSURE (Top-Left corner)
    const sSize = Math.min(0.9, Math.min(dim.width, dim.length) * 0.45);
    const sX = -halfW;
    const sY = halfL;

    // Shower Tray / Floor
    polygons.push({
      id: 'shower-tray',
      points: [
        { x: sX, y: sY - sSize, z: 0.03 },
        { x: sX + sSize, y: sY - sSize, z: 0.03 },
        { x: sX + sSize, y: sY, z: 0.03 },
        { x: sX, y: sY, z: 0.03 },
      ],
      color: '#CBD5E1',
      strokeColor: '#64748B',
      strokeWidth: 2,
      tag: 'fixture-shower',
    });

    // Glass Partition Screen
    polygons.push({
      id: 'shower-glass-partition',
      points: [
        { x: sX + sSize, y: sY - sSize, z: 0.03 },
        { x: sX + sSize, y: sY, z: 0.03 },
        { x: sX + sSize, y: sY, z: 2.0 },
        { x: sX + sSize, y: sY - sSize, z: 2.0 },
      ],
      color: '#38BDF8',
      strokeColor: '#0EA5E9',
      strokeWidth: 2,
      opacity: 0.35,
      tag: 'fixture-shower-glass',
    });
  }

  /**
   * Generates the 3D representation of the WSG-01 sensor hardware
   */
  private static generateDeviceMesh(
    dim: BathroomDimensions,
    dev: DevicePlacement,
    polygons: Polygon3D[]
  ): void {
    const devCoords = this.getDeviceWorldCoordinates(dim, dev);
    const normal = this.getInwardWallNormal(dev.wall);

    // Device body dimensions (20cm x 15cm x 6cm)
    const size = 0.18;
    const depth = 0.06;

    // Local tangential vector along the wall
    const tanX = -normal.y;
    const tanY = normal.x;

    const pX = devCoords.x;
    const pY = devCoords.y;
    const pZ = devCoords.z;

    // Device Face Plate
    polygons.push({
      id: 'wsg01-body',
      points: [
        {
          x: pX - (tanX * size) / 2 + normal.x * depth,
          y: pY - (tanY * size) / 2 + normal.y * depth,
          z: pZ - size / 2,
        },
        {
          x: pX + (tanX * size) / 2 + normal.x * depth,
          y: pY + (tanY * size) / 2 + normal.y * depth,
          z: pZ - size / 2,
        },
        {
          x: pX + (tanX * size) / 2 + normal.x * depth,
          y: pY + (tanY * size) / 2 + normal.y * depth,
          z: pZ + size / 2,
        },
        {
          x: pX - (tanX * size) / 2 + normal.x * depth,
          y: pY - (tanY * size) / 2 + normal.y * depth,
          z: pZ + size / 2,
        },
      ],
      color: '#0F172A', // Sleek dark aesthetic
      strokeColor: '#38BDF8',
      strokeWidth: 2,
      tag: 'wsg-device',
    });

    // Glowing Sensor Indicator LED / Lens (Center circle / diamond)
    const ledRadius = 0.04;
    polygons.push({
      id: 'wsg01-led',
      points: [
        { x: pX + normal.x * (depth + 0.01), y: pY + normal.y * (depth + 0.01), z: pZ + ledRadius },
        { x: pX + normal.x * (depth + 0.01) + tanX * ledRadius, y: pY + normal.y * (depth + 0.01) + tanY * ledRadius, z: pZ },
        { x: pX + normal.x * (depth + 0.01), y: pY + normal.y * (depth + 0.01), z: pZ - ledRadius },
        { x: pX + normal.x * (depth + 0.01) - tanX * ledRadius, y: pY + normal.y * (depth + 0.01) - tanY * ledRadius, z: pZ },
      ],
      color: '#10B981', // Glowing Green / Teal LED
      strokeColor: '#34D399',
      strokeWidth: 1.5,
      tag: 'wsg-device-led',
    });
  }

  /**
   * Generates a realistic 3D volumetric radar coverage visualization inspired by
   * the HLK-LD2410C 24 GHz FMCW mmWave radar presence sensor.
   *
   * Features:
   * - 3D origin at configured WSG-01 sensor position and mounting height.
   * - Continuous volumetric fan/cone with multiple radial ray beams spreading outward and downward.
   * - Realistic wall, floor, obstacle and doorway boundary clipping.
   * - Multi-zone gradient: Green (Core Stillness <1.8m) -> Cyan (Body Motion 1.8-3.0m) ->
   *   Yellow (Edge Sensitivity 3.0-4.0m) -> Orange (Fringe 4.0-4.8m) -> Red (Doorway Leak).
   * - Semi-transparent volumetric facets so bathroom fixtures remain clearly visible.
   * - Wavefront range gate arcs and animated FMCW travelling pulse.
   */
  private static generateRadarCoverageMesh(
    dim: BathroomDimensions,
    door: BathroomDoorConfig,
    dev: DevicePlacement,
    polygons: Polygon3D[],
    pulsePhase: number = 0
  ): void {
    const devPos = this.getDeviceWorldCoordinates(dim, dev);
    const wallNormal = this.getInwardWallNormal(dev.wall);

    // Compute central beam pointing direction with yaw & pitch angles
    const yawOffsetRad = (dev.yawAngleDeg * Math.PI) / 180;
    const pitchOffsetRad = (dev.pitchAngleDeg * Math.PI) / 180;

    const baseAngle = Math.atan2(wallNormal.y, wallNormal.x);
    const centerBeamAngle = baseAngle + yawOffsetRad;

    // HLK-LD2410C 24GHz FMCW Specifications:
    // Azimuth FOV: ±30° (60° total horizontal span)
    // Elevation FOV: ~45° total vertical spread (angled downward to floor)
    const halfBeamAzimuth = (30 * Math.PI) / 180;
    const maxRange = 4.8; // meters

    // Zone thresholds (meters)
    const rZone1 = 1.8; // Green: Core stillness / micro-motion
    const rZone2 = 3.0; // Cyan: Normal body walking motion
    const rZone3 = 4.0; // Yellow: Edge sensitivity zone
    const rZone4 = 4.8; // Orange: Outer perimeter fringe

    const halfW = dim.width / 2;
    const halfL = dim.length / 2;
    const doorPos = this.getDoorWorldCoordinates(dim, door);
    const doorCheck = this.calculateDoorBleed(dim, door, dev);

    // Number of discrete radial rays across the azimuth fan
    const numAzimuthRays = 18;

    // Arrays to store 3D points along the ray paths for volumetric meshing
    const centerRaysEnd: Point3D[] = [];
    const floorPoints: Point3D[] = [];
    const upperCanopyPoints: Point3D[] = [];
    const zone1Points: Point3D[] = [];
    const zone2Points: Point3D[] = [];
    const zone3Points: Point3D[] = [];

    // Helper: Clamps a 3D ray against bathroom boundaries (floor & walls)
    const getRayHitDistance = (
      origin: Point3D,
      dir: Point3D,
      targetRange: number
    ): { hitDist: number; hitPoint: Point3D; isDoorLeak: boolean } => {
      let tMin = targetRange;

      // 1. Floor collision (z = 0)
      if (dir.z < -0.001) {
        const tFloor = -origin.z / dir.z;
        if (tFloor > 0 && tFloor < tMin) {
          tMin = tFloor;
        }
      }

      // 2. Room wall collisions (X: ±halfW, Y: ±halfL)
      if (dir.x < -0.001) {
        const tWest = (-halfW - origin.x) / dir.x;
        if (tWest > 0 && tWest < tMin) tMin = tWest;
      } else if (dir.x > 0.001) {
        const tEast = (halfW - origin.x) / dir.x;
        if (tEast > 0 && tEast < tMin) tMin = tEast;
      }

      if (dir.y < -0.001) {
        const tSouth = (-halfL - origin.y) / dir.y;
        if (tSouth > 0 && tSouth < tMin) tMin = tSouth;
      } else if (dir.y > 0.001) {
        const tNorth = (halfL - origin.y) / dir.y;
        if (tNorth > 0 && tNorth < tMin) tMin = tNorth;
      }

      let hitPoint: Point3D = {
        x: origin.x + dir.x * tMin,
        y: origin.y + dir.y * tMin,
        z: Math.max(0, origin.z + dir.z * tMin),
      };

      // 3. Doorway penetration check
      // If ray hits the door wall and aligns with doorway, test if it bleeds through
      let isDoorLeak = false;
      const distToDoor = Math.hypot(hitPoint.x - doorPos.x, hitPoint.y - doorPos.y);
      const isNearDoorway = distToDoor <= ((door.width || 0.85) / 2 + 0.18) && hitPoint.z <= (door.height || 2.1);

      if (isNearDoorway && (door.isOpen || doorCheck.isBleeding)) {
        isDoorLeak = true;
        // Extend ray outside the bathroom by up to 1.1m
        const leakExtension = 1.1;
        hitPoint = {
          x: origin.x + dir.x * (tMin + leakExtension),
          y: origin.y + dir.y * (tMin + leakExtension),
          z: Math.max(0, origin.z + dir.z * (tMin + leakExtension)),
        };
      }

      return { hitDist: tMin, hitPoint, isDoorLeak };
    };

    // Generate radial ray directions and compute boundary intersections
    for (let i = 0; i <= numAzimuthRays; i++) {
      const azimuth = centerBeamAngle - halfBeamAzimuth + (2 * halfBeamAzimuth * i) / numAzimuthRays;
      const cosAz = Math.cos(azimuth);
      const sinAz = Math.sin(azimuth);

      // Pitch elevation angles:
      // - Core center ray: tilted down ~14°
      // - Floor ray: plunged down ~32°
      // - Upper canopy ray: near horizontal (+2°)
      const pitchMid = pitchOffsetRad - 0.24;
      const pitchDown = pitchOffsetRad - 0.54;
      const pitchUp = pitchOffsetRad + 0.04;

      const dirMid: Point3D = {
        x: cosAz * Math.cos(pitchMid),
        y: sinAz * Math.cos(pitchMid),
        z: Math.sin(pitchMid),
      };

      const dirDown: Point3D = {
        x: cosAz * Math.cos(pitchDown),
        y: sinAz * Math.cos(pitchDown),
        z: Math.sin(pitchDown),
      };

      const dirUp: Point3D = {
        x: cosAz * Math.cos(pitchUp),
        y: sinAz * Math.cos(pitchUp),
        z: Math.sin(pitchUp),
      };

      // Ray intersections
      const midHit = getRayHitDistance(devPos, dirMid, maxRange);
      const downHit = getRayHitDistance(devPos, dirDown, maxRange);
      const upHit = getRayHitDistance(devPos, dirUp, maxRange);

      centerRaysEnd.push(midHit.hitPoint);
      floorPoints.push({ x: downHit.hitPoint.x, y: downHit.hitPoint.y, z: 0.015 });
      upperCanopyPoints.push(upHit.hitPoint);

      // Distance zone boundary points along the core ray
      const d1 = Math.min(midHit.hitDist, rZone1);
      const d2 = Math.min(midHit.hitDist, rZone2);
      const d3 = Math.min(midHit.hitDist, rZone3);

      zone1Points.push({
        x: devPos.x + dirMid.x * d1,
        y: devPos.y + dirMid.y * d1,
        z: Math.max(0, devPos.z + dirMid.z * d1),
      });

      zone2Points.push({
        x: devPos.x + dirMid.x * d2,
        y: devPos.y + dirMid.y * d2,
        z: Math.max(0, devPos.z + dirMid.z * d2),
      });

      zone3Points.push({
        x: devPos.x + dirMid.x * d3,
        y: devPos.y + dirMid.y * d3,
        z: Math.max(0, devPos.z + dirMid.z * d3),
      });

      // ==========================================
      // A. RADIAL BEAM RAYS (Continuous 3D Ray Lines)
      // ==========================================
      // Segment 1: Origin -> Zone 1 (Green Core)
      polygons.push({
        id: `radar-ray-green-${i}`,
        points: [devPos, zone1Points[i]],
        color: '#10B981',
        strokeColor: '#10B981',
        strokeWidth: 1.5,
        opacity: 0.48,
        isWireframe: true,
        tag: 'radar-green',
      });

      // Segment 2: Zone 1 -> Zone 2 (Cyan Body Motion)
      if (midHit.hitDist > rZone1) {
        polygons.push({
          id: `radar-ray-cyan-${i}`,
          points: [zone1Points[i], zone2Points[i]],
          color: '#06B6D4',
          strokeColor: '#06B6D4',
          strokeWidth: 1.3,
          opacity: 0.42,
          isWireframe: true,
          tag: 'radar-cyan',
        });
      }

      // Segment 3: Zone 2 -> Zone 3 (Yellow Edge Sensitivity)
      if (midHit.hitDist > rZone2) {
        polygons.push({
          id: `radar-ray-yellow-${i}`,
          points: [zone2Points[i], zone3Points[i]],
          color: '#F59E0B',
          strokeColor: '#F59E0B',
          strokeWidth: 1.1,
          opacity: 0.35,
          isWireframe: true,
          tag: 'radar-yellow',
        });
      }

      // Segment 4: Zone 3 -> Ray Endpoint (Orange Fringe / Red Door Leak)
      if (midHit.hitDist > rZone3) {
        const rayColor = midHit.isDoorLeak ? '#EF4444' : '#F97316';
        polygons.push({
          id: `radar-ray-outer-${i}`,
          points: [zone3Points[i], midHit.hitPoint],
          color: rayColor,
          strokeColor: rayColor,
          strokeWidth: midHit.isDoorLeak ? 2.2 : 0.9,
          opacity: midHit.isDoorLeak ? 0.75 : 0.28,
          isWireframe: true,
          tag: midHit.isDoorLeak ? 'radar-red-ray' : 'radar-orange',
        });
      }

      // Vertical downward strut from apex to floor (adds volumetric lattice depth)
      if (i % 3 === 0) {
        polygons.push({
          id: `radar-down-strut-${i}`,
          points: [devPos, floorPoints[i]],
          color: '#10B981',
          strokeColor: '#059669',
          strokeWidth: 0.8,
          opacity: 0.25,
          isWireframe: true,
          tag: 'radar-strut',
        });
      }
    }

    // ==========================================
    // B. VOLUMETRIC CANOPY FACETS (Semi-Transparent Gradient Hull)
    // ==========================================
    for (let i = 0; i < numAzimuthRays; i++) {
      // 1. Zone 1: Emerald Green Core Presence Facet
      polygons.push({
        id: `radar-vol-green-${i}`,
        points: [devPos, zone1Points[i], zone1Points[i + 1]],
        color: '#10B981',
        strokeColor: '#059669',
        strokeWidth: 0.5,
        opacity: 0.16,
        tag: 'radar-green',
      });

      // 2. Zone 2: Cyan Body Motion Facet
      polygons.push({
        id: `radar-vol-cyan-${i}`,
        points: [zone1Points[i], zone2Points[i], zone2Points[i + 1], zone1Points[i + 1]],
        color: '#06B6D4',
        strokeColor: '#0891B2',
        strokeWidth: 0.4,
        opacity: 0.12,
        tag: 'radar-cyan',
      });

      // 3. Zone 3: Yellow Edge Motion Facet
      polygons.push({
        id: `radar-vol-yellow-${i}`,
        points: [zone2Points[i], zone3Points[i], zone3Points[i + 1], zone2Points[i + 1]],
        color: '#F59E0B',
        strokeColor: '#D97706',
        strokeWidth: 0.4,
        opacity: 0.10,
        tag: 'radar-yellow',
      });

      // 4. Zone 4: Orange Outer Fringe Facet
      polygons.push({
        id: `radar-vol-orange-${i}`,
        points: [zone3Points[i], centerRaysEnd[i], centerRaysEnd[i + 1], zone3Points[i + 1]],
        color: '#F97316',
        strokeColor: '#EA580C',
        strokeWidth: 0.3,
        opacity: 0.08,
        tag: 'radar-orange',
      });

      // 5. Floor Footprint Fan Facet (Ground coverage mapping)
      polygons.push({
        id: `radar-floor-fan-${i}`,
        points: [
          { x: devPos.x, y: devPos.y, z: 0.01 },
          floorPoints[i],
          floorPoints[i + 1],
        ],
        color: '#06B6D4',
        strokeColor: '#0891B2',
        strokeWidth: 0.3,
        opacity: 0.10,
        tag: 'radar-floor',
      });
    }

    // ==========================================
    // C. CONCENTRIC RANGE GATE WAVEFRONT ARCS
    // ==========================================
    // Connect points along the arc across adjacent rays at gate distances
    for (let i = 0; i < numAzimuthRays; i++) {
      // 1.8m Gate Arc (Green)
      polygons.push({
        id: `radar-gate-arc-1-${i}`,
        points: [zone1Points[i], zone1Points[i + 1]],
        color: '#10B981',
        strokeColor: '#34D399',
        strokeWidth: 1.2,
        opacity: 0.50,
        isWireframe: true,
        tag: 'radar-gate',
      });

      // 3.0m Gate Arc (Cyan)
      polygons.push({
        id: `radar-gate-arc-2-${i}`,
        points: [zone2Points[i], zone2Points[i + 1]],
        color: '#06B6D4',
        strokeColor: '#22D3EE',
        strokeWidth: 1.1,
        opacity: 0.42,
        isWireframe: true,
        tag: 'radar-gate',
      });

      // 4.0m Gate Arc (Yellow)
      polygons.push({
        id: `radar-gate-arc-3-${i}`,
        points: [zone3Points[i], zone3Points[i + 1]],
        color: '#F59E0B',
        strokeColor: '#FBBF24',
        strokeWidth: 1.0,
        opacity: 0.35,
        isWireframe: true,
        tag: 'radar-gate',
      });
    }

    // ==========================================
    // D. ANIMATED FMCW TRAVELLING PULSE WAVEFRONT
    // ==========================================
    if (pulsePhase > 0) {
      const pulseDist = 0.3 + pulsePhase * (maxRange - 0.4);
      const pulseColor = pulsePhase < 0.4 ? '#34D399' : pulsePhase < 0.7 ? '#38BDF8' : '#FBBF24';
      const pulseOpacity = Math.max(0.15, (1 - pulsePhase * 0.75) * 0.85);

      for (let i = 0; i < numAzimuthRays; i++) {
        const dA = Math.min(pulseDist, Math.hypot(centerRaysEnd[i].x - devPos.x, centerRaysEnd[i].y - devPos.y));
        const dB = Math.min(pulseDist, Math.hypot(centerRaysEnd[i + 1].x - devPos.x, centerRaysEnd[i + 1].y - devPos.y));

        const ptA: Point3D = {
          x: devPos.x + ((centerRaysEnd[i].x - devPos.x) * dA) / Math.max(0.01, Math.hypot(centerRaysEnd[i].x - devPos.x, centerRaysEnd[i].y - devPos.y)),
          y: devPos.y + ((centerRaysEnd[i].y - devPos.y) * dA) / Math.max(0.01, Math.hypot(centerRaysEnd[i].x - devPos.x, centerRaysEnd[i].y - devPos.y)),
          z: devPos.z + ((centerRaysEnd[i].z - devPos.z) * dA) / Math.max(0.01, Math.hypot(centerRaysEnd[i].x - devPos.x, centerRaysEnd[i].y - devPos.y)),
        };

        const ptB: Point3D = {
          x: devPos.x + ((centerRaysEnd[i + 1].x - devPos.x) * dB) / Math.max(0.01, Math.hypot(centerRaysEnd[i + 1].x - devPos.x, centerRaysEnd[i + 1].y - devPos.y)),
          y: devPos.y + ((centerRaysEnd[i + 1].y - devPos.y) * dB) / Math.max(0.01, Math.hypot(centerRaysEnd[i + 1].x - devPos.x, centerRaysEnd[i + 1].y - devPos.y)),
          z: devPos.z + ((centerRaysEnd[i + 1].z - devPos.z) * dB) / Math.max(0.01, Math.hypot(centerRaysEnd[i + 1].x - devPos.x, centerRaysEnd[i + 1].y - devPos.y)),
        };

        polygons.push({
          id: `radar-pulse-arc-${i}`,
          points: [ptA, ptB],
          color: pulseColor,
          strokeColor: pulseColor,
          strokeWidth: 2.2,
          opacity: pulseOpacity,
          isWireframe: true,
          tag: 'radar-pulse',
        });
      }
    }

    // ==========================================
    // E. RED DOORWAY SPILLOVER WARNING VOLUME
    // ==========================================
    if (doorCheck.isBleeding) {
      const doorNorm = this.getInwardWallNormal(door.wall);
      const outX = doorPos.x - doorNorm.x * 1.0;
      const outY = doorPos.y - doorNorm.y * 1.0;

      // Highlight the doorway spill floor patch in vivid RED
      polygons.push({
        id: 'radar-bleed-danger-area',
        points: [
          { x: doorPos.x - 0.45, y: doorPos.y, z: 0.05 },
          { x: doorPos.x + 0.45, y: doorPos.y, z: 0.05 },
          { x: outX + 0.45, y: outY, z: 0.05 },
          { x: outX - 0.45, y: outY, z: 0.05 },
        ],
        color: '#EF4444',
        strokeColor: '#DC2626',
        strokeWidth: 2,
        opacity: 0.42,
        tag: 'radar-red-bleed',
      });

      // Distinct red warning ray line escaping through the door
      polygons.push({
        id: 'radar-bleed-ray',
        points: [
          devPos,
          { x: doorPos.x, y: doorPos.y, z: 1.0 },
          { x: outX, y: outY, z: 0.8 },
        ],
        color: '#EF4444',
        strokeColor: '#EF4444',
        strokeWidth: 2.4,
        isWireframe: true,
        tag: 'radar-red-ray',
      });
    }
  }

  /**
   * Calculates world coordinates of the device given wall & offsets
   */
  public static getDeviceWorldCoordinates(
    dim: BathroomDimensions,
    dev: DevicePlacement
  ): Point3D {
    const halfW = dim.width / 2;
    const halfL = dim.length / 2;
    const ratio = Math.max(0.05, Math.min(0.95, dev.offsetRatio));

    let x = 0;
    let y = 0;

    switch (dev.wall) {
      case 'TOP': // North Wall (y = +halfL)
        x = -halfW + dim.width * ratio;
        y = halfL - 0.02;
        break;
      case 'BOTTOM': // South Wall (y = -halfL)
        x = halfW - dim.width * ratio;
        y = -halfL + 0.02;
        break;
      case 'LEFT': // West Wall (x = -halfW)
        x = -halfW + 0.02;
        y = halfL - dim.length * ratio;
        break;
      case 'RIGHT': // East Wall (x = +halfW)
        x = halfW - 0.02;
        y = -halfL + dim.length * ratio;
        break;
    }

    return {
      x,
      y,
      z: Math.max(0.5, Math.min(dim.height - 0.1, dev.mountingHeight)),
    };
  }

  /**
   * Calculates world coordinates of the door center
   */
  public static getDoorWorldCoordinates(
    dim: BathroomDimensions,
    door: BathroomDoorConfig
  ): Point3D {
    const halfW = dim.width / 2;
    const halfL = dim.length / 2;
    const ratio = Math.max(0.1, Math.min(0.9, door.positionRatio));

    let x = 0;
    let y = 0;

    switch (door.wall) {
      case 'TOP':
        x = -halfW + dim.width * ratio;
        y = halfL;
        break;
      case 'BOTTOM':
        x = halfW - dim.width * ratio;
        y = -halfL;
        break;
      case 'LEFT':
        x = -halfW;
        y = halfL - dim.length * ratio;
        break;
      case 'RIGHT':
        x = halfW;
        y = -halfL + dim.length * ratio;
        break;
    }

    return { x, y, z: door.height / 2 };
  }

  /**
   * Returns normal unit vector pointing inward into the room from a wall
   */
  public static getInwardWallNormal(wall: DoorWall): Point3D {
    switch (wall) {
      case 'TOP':
        return { x: 0, y: -1, z: 0 };
      case 'BOTTOM':
        return { x: 0, y: 1, z: 0 };
      case 'LEFT':
        return { x: 1, y: 0, z: 0 };
      case 'RIGHT':
        return { x: -1, y: 0, z: 0 };
    }
  }

  /**
   * Calculates whether the sensor beam bleeds through or directly faces the doorway
   */
  public static calculateDoorBleed(
    dim: BathroomDimensions,
    door: BathroomDoorConfig,
    dev: DevicePlacement
  ): { isBleeding: boolean; risk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'; angleDeg: number; distanceM: number } {
    const devPos = this.getDeviceWorldCoordinates(dim, dev);
    const doorPos = this.getDoorWorldCoordinates(dim, door);

    const dx = doorPos.x - devPos.x;
    const dy = doorPos.y - devPos.y;
    const distanceM = Math.hypot(dx, dy);

    // Vector to door
    const angleToDoor = Math.atan2(dy, dx);

    // Sensor beam central angle
    const wallNormal = this.getInwardWallNormal(dev.wall);
    const baseWallAngle = Math.atan2(wallNormal.y, wallNormal.x);
    const sensorBeamAngle = baseWallAngle + (dev.yawAngleDeg * Math.PI) / 180;

    // Angle difference between beam center and door
    let angleDiff = Math.abs(sensorBeamAngle - angleToDoor);
    while (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    const angleDiffDeg = (angleDiff * Math.PI) / 180;

    // HLK-LD2410C has ±30° FOV (30 deg = ~0.52 rad)
    const halfBeamRad = (30 * Math.PI) / 180;
    const inBeam = angleDiff < halfBeamRad + 0.1;

    // On same wall as door?
    const onSameWall = dev.wall === door.wall;

    if (onSameWall) {
      return { isBleeding: false, risk: 'NONE', angleDeg: angleDiffDeg, distanceM };
    }

    // Facing directly opposite door
    const isOppositeWall =
      (dev.wall === 'TOP' && door.wall === 'BOTTOM') ||
      (dev.wall === 'BOTTOM' && door.wall === 'TOP') ||
      (dev.wall === 'LEFT' && door.wall === 'RIGHT') ||
      (dev.wall === 'RIGHT' && door.wall === 'LEFT');

    let risk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' = 'NONE';
    let isBleeding = false;

    if (inBeam) {
      isBleeding = true;
      if (door.isOpen || door.material === 'GLASS') {
        risk = distanceM < 3.2 ? 'HIGH' : 'MEDIUM';
      } else if (door.material === 'WOOD' || door.material === 'OTHER') {
        risk = isOppositeWall && distanceM < 2.5 ? 'MEDIUM' : 'LOW';
      } else if (door.material === 'METAL') {
        // 24GHz RF is largely reflected by solid metal
        risk = 'LOW';
      }
    } else if (angleDiff < halfBeamRad + 0.25) {
      risk = 'LOW';
    }

    return { isBleeding, risk, angleDeg: angleDiffDeg, distanceM };
  }
}
