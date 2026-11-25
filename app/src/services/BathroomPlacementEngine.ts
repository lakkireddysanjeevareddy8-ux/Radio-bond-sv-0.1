import {
  BathroomDimensions,
  BathroomDoorConfig,
  DevicePlacement,
  DoorWall,
  RadarCoverageReport,
  RecommendedPlacement,
  DoorBleedSeverity,
} from '../types/bathroom';
import { Bathroom3DMath } from '../utils/bathroom3DMath';

// Helper to format wall to intuitive Front, Back, Right, Left terminology
export const formatWallName = (wall: DoorWall): string => {
  switch (wall) {
    case 'TOP':
      return 'Front';
    case 'BOTTOM':
      return 'Back';
    case 'RIGHT':
      return 'Right';
    case 'LEFT':
      return 'Left';
  }
};

export class BathroomPlacementEngine {
  /**
   * Evaluates the radar coverage and doorway risk of a given placement
   */
  public static evaluatePlacement(
    dim: BathroomDimensions,
    door: BathroomDoorConfig,
    dev: DevicePlacement
  ): RadarCoverageReport {
    const bleed = Bathroom3DMath.calculateDoorBleed(dim, door, dev);
    const roomArea = dim.length * dim.width;

    // Estimate interior coverage percentage:
    // HLK-LD2410C has ~60° horizontal coverage up to ~4.5m
    const wallNormal = Bathroom3DMath.getInwardWallNormal(dev.wall);
    const yawOffsetRad = (dev.yawAngleDeg * Math.PI) / 180;
    const centerBeamAngle = Math.atan2(wallNormal.y, wallNormal.x) + yawOffsetRad;

    // Check distance to primary bathroom zones (shower top-left, toilet right)
    const devPos = Bathroom3DMath.getDeviceWorldCoordinates(dim, dev);
    const halfW = dim.width / 2;
    const halfL = dim.length / 2;

    const showerPos = { x: -halfW + 0.45, y: halfL - 0.45, z: 0.8 };
    const toiletPos = { x: halfW - 0.35, y: halfL * 0.3, z: 0.5 };

    const distToShower = Math.hypot(showerPos.x - devPos.x, showerPos.y - devPos.y);
    const distToToilet = Math.hypot(toiletPos.x - devPos.x, toiletPos.y - devPos.y);

    // LD2410C performs best within 1.0m - 3.5m for stillness/breathing detection
    let showerScore = Math.max(0, 100 - Math.abs(distToShower - 2.2) * 30);
    let toiletScore = Math.max(0, 100 - Math.abs(distToToilet - 2.0) * 30);

    // Height score: 1.8m is peak optimal for mmWave washroom presence, stillness & fall detection.
    // Continuously scales based on vertical deviation from 1.8m.
    const heightDev = Math.abs(dev.mountingHeight - 1.8);
    let heightScore = 100;
    if (heightDev > 0.05) {
      heightScore = Math.max(20, Math.min(100, Math.round(100 - (heightDev - 0.05) * 85)));
    }

    // Base interior coverage percentage
    let interiorCoveragePct = Math.round(
      Math.min(98, 70 + (showerScore + toiletScore) * 0.14)
    );

    // Door bleed penalty
    let bleedPenalty = 0;
    let doorBleedPct = 0;

    switch (bleed.risk) {
      case 'HIGH':
        bleedPenalty = 45;
        doorBleedPct = 32;
        break;
      case 'MEDIUM':
        bleedPenalty = 25;
        doorBleedPct = 18;
        break;
      case 'LOW':
        bleedPenalty = 8;
        doorBleedPct = 6;
        break;
      case 'NONE':
        bleedPenalty = 0;
        doorBleedPct = 0;
        break;
    }

    // Check if device is physically placed directly on the door panel surface
    const isOnDoor = this.isPlacementOnDoor(dim, door, dev);
    const doorClashPenalty = isOnDoor ? 55 : 0;

    const overallScore = Math.max(
      10,
      Math.min(
        100,
        Math.round(
          interiorCoveragePct * 0.50 + heightScore * 0.25 - bleedPenalty - doorClashPenalty
        )
      )
    );

    let recommendationNote = '';
    let warningNote: string | undefined;

    if (isOnDoor) {
      warningNote = `WSG-01 cannot be mounted directly on the door panel! Position it on the wall beside the door, above the door header, or on another wall.`;
    } else if (bleed.risk === 'HIGH') {
      warningNote = `WSG-01 radar beam directly aims at the ${formatWallName(door.wall).toLowerCase()} doorway (${bleed.distanceM.toFixed(1)}m away). 24GHz waves may penetrate lightweight doors or open doorways, causing false alarms outside the bathroom.`;
    } else if (bleed.risk === 'MEDIUM') {
      warningNote = `Moderate radar spillover risk near doorway. Angling the device or mounting adjacent to the door is recommended.`;
    } else if (dev.mountingHeight < 1.35) {
      warningNote = `WSG-01 is mounted low (${dev.mountingHeight.toFixed(1)}m). Floor bounce and fixture obstructions may cause blind spots.`;
    } else if (dev.mountingHeight > 2.25) {
      warningNote = `WSG-01 is mounted high (${dev.mountingHeight.toFixed(1)}m). Steep angle reduces Doppler resolution for stillness detection.`;
    }

    if (overallScore >= 80) {
      recommendationNote = `Excellent placement: High coverage of stillness zones (${interiorCoveragePct}%) with low doorway spillover risk.`;
    } else if (overallScore >= 60) {
      recommendationNote = `Acceptable placement: Covers key bathroom areas. Ensure door sensitivity gate thresholds are calibrated.`;
    } else {
      recommendationNote = `Sub-optimal placement: High risk of false triggers outside the doorway or blind spots in the shower.`;
    }

    return {
      interiorCoveragePct,
      doorBleedRisk: bleed.risk,
      doorBleedPct,
      isDirectlyFacingDoor: bleed.isBleeding && bleed.risk !== 'NONE',
      distanceToDoorMeters: Math.round(bleed.distanceM * 10) / 10,
      overallScore,
      recommendationNote,
      warningNote,
    };
  }

  /**
   * Checks whether the device position physically clashes with the entry door panel itself.
   * Mounting on the wall beside the door or above the door header is valid; only
   * mounting directly on the door panel surface is forbidden.
   */
  public static isPlacementOnDoor(
    dim: BathroomDimensions,
    door: BathroomDoorConfig,
    dev: { wall: DoorWall; offsetRatio: number; mountingHeight: number }
  ): boolean {
    if (dev.wall !== door.wall) return false;

    // Door vertical height (default 2.0m)
    const doorH = door.height || 2.0;
    if (dev.mountingHeight > doorH) {
      // Mounted on the wall header above the door frame - completely valid!
      return false;
    }

    // Wall length along this wall
    const wallLen = (dev.wall === 'TOP' || dev.wall === 'BOTTOM') ? dim.width : dim.length;
    const doorW = door.width || 0.8;
    const doorPosRatio = door.positionRatio ?? 0.5;
    const halfDoorRatio = (doorW / wallLen) / 2;

    // Inside the door panel rectangle with a small safety margin
    return Math.abs(dev.offsetRatio - doorPosRatio) <= (halfDoorRatio + 0.03);
  }

  /**
   * Evaluates all valid wall placements and returns ranked recommendations
   */
  public static calculateOptimalPlacements(
    dim: BathroomDimensions,
    door: BathroomDoorConfig
  ): RecommendedPlacement[] {
    const walls: DoorWall[] = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
    const candidates: RecommendedPlacement[] = [];

    const heights = [1.6, 1.8, 2.0];
    const yaws = [-20, 0, 20];

    for (const wall of walls) {
      // If evaluating the wall having the door, test safe offsets beside the door
      let offsets = [0.25, 0.5, 0.75];
      if (wall === door.wall) {
        const wallLen = (wall === 'TOP' || wall === 'BOTTOM') ? dim.width : dim.length;
        const doorW = door.width || 0.8;
        const doorPosRatio = door.positionRatio ?? 0.5;
        const halfDoorRatio = (doorW / wallLen) / 2;
        const leftBeside = Math.max(0.12, Math.round((doorPosRatio - halfDoorRatio - 0.12) * 100) / 100);
        const rightBeside = Math.min(0.88, Math.round((doorPosRatio + halfDoorRatio + 0.12) * 100) / 100);
        offsets = [leftBeside, rightBeside];
      }

      for (const offset of offsets) {
        for (const height of heights) {
          for (const yaw of yaws) {
            const placement: DevicePlacement = {
              wall,
              mountingHeight: height,
              offsetRatio: offset,
              yawAngleDeg: yaw,
              pitchAngleDeg: -10,
            };

            const stats = this.evaluatePlacement(dim, door, placement);

            let reason = '';
            if (wall === door.wall) {
              reason = `Mounted on the ${formatWallName(wall).toLowerCase()} wall beside the door: radar covers room with zero doorway spillover.`;
            } else if (stats.doorBleedRisk === 'NONE' || stats.doorBleedRisk === 'LOW') {
              reason = `Mounted on the ${formatWallName(wall).toLowerCase()} wall: main radar beam covers room while avoiding the ${formatWallName(door.wall).toLowerCase()} doorway.`;
            } else {
              reason = `Facing toward room center with ${stats.interiorCoveragePct}% coverage.`;
            }

            candidates.push({
              wall,
              mountingHeight: height,
              offsetRatio: offset,
              yawAngleDeg: yaw,
              score: stats.overallScore,
              coveragePct: stats.interiorCoveragePct,
              bleedRisk: stats.doorBleedRisk,
              reason,
            });
          }
        }
      }
    }

    // Sort descending by score
    candidates.sort((a, b) => b.score - a.score);

    return candidates;
  }

  /**
   * Returns the single best recommendation, or advice if room geometry requires physical calibration
   */
  public static getBestRecommendation(
    dim: BathroomDimensions,
    door: BathroomDoorConfig
  ): { best: RecommendedPlacement; requiresCalibration: boolean; summaryAdvice: string } {
    const candidates = this.calculateOptimalPlacements(dim, door);
    // Best candidate
    const best = candidates[0];

    // If even the best placement has a score under 55, physical gate calibration is mandatory
    const requiresCalibration = best.score < 55 || best.bleedRisk === 'HIGH';

    let summaryAdvice = '';
    if (requiresCalibration) {
      summaryAdvice = `Due to compact room dimensions (${dim.width}m x ${dim.length}m) or central door alignment, standard placement may cause radar beam reflections. Physical sensitivity gate calibration via device settings is strongly recommended after mounting.`;
    } else {
      summaryAdvice = `Mount WSG-01 on the ${formatWallName(best.wall)} wall at ${best.mountingHeight}m height (${Math.round(best.offsetRatio * 100)}% along wall). Provides ${best.coveragePct}% room coverage with minimal doorway bleed.`;
    }

    return { best, requiresCalibration, summaryAdvice };
  }

  /**
   * Returns the best candidate placement for a specific target wall using the radar evaluation algorithm
   */
  public static getBestPlacementForWall(
    dim: BathroomDimensions,
    door: BathroomDoorConfig,
    targetWall: DoorWall
  ): DevicePlacement {
    const candidates = this.calculateOptimalPlacements(dim, door);
    const wallCandidates = candidates.filter((c) => c.wall === targetWall);

    if (wallCandidates.length > 0) {
      const top = wallCandidates[0];
      return {
        wall: top.wall,
        mountingHeight: top.mountingHeight,
        offsetRatio: top.offsetRatio,
        yawAngleDeg: top.yawAngleDeg,
        pitchAngleDeg: -10,
      };
    }

    // Safe fallback offset (if targetWall has the door, position safely beside door)
    let safeOffset = 0.5;
    if (targetWall === door.wall) {
      const wallLen = (targetWall === 'TOP' || targetWall === 'BOTTOM') ? dim.width : dim.length;
      const doorW = door.width || 0.8;
      const doorPosRatio = door.positionRatio ?? 0.5;
      const halfDoorRatio = (doorW / wallLen) / 2;
      safeOffset = doorPosRatio >= 0.5
        ? Math.max(0.12, doorPosRatio - halfDoorRatio - 0.12)
        : Math.min(0.88, doorPosRatio + halfDoorRatio + 0.12);
    }

    return {
      wall: targetWall,
      mountingHeight: 1.8,
      offsetRatio: safeOffset,
      yawAngleDeg: 0,
      pitchAngleDeg: -10,
    };
  }
}
