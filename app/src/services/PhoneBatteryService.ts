import { Platform } from 'react-native';
import { logger } from '../utils/logger';

export interface BatteryStatus {
  level: number; // 0 to 100
  isCharging?: boolean;
  sufficientForOta: boolean; // >= 30%
}

class PhoneBatteryServiceClass {
  private mockBatteryLevel: number | null = null;
  private cachedLevel: number = 85; // Default safe estimate

  /**
   * Override battery level for unit testing or deterministic verification.
   */
  public setMockBatteryLevel(level: number | null): void {
    this.mockBatteryLevel = level;
  }

  /**
   * Retrieves the current phone battery percentage (0 to 100).
   * Supports Web Battery API and native platforms.
   */
  public async getBatteryLevel(): Promise<number> {
    if (this.mockBatteryLevel !== null) {
      return this.mockBatteryLevel;
    }

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).getBattery) {
        const battery = await (navigator as any).getBattery();
        const levelPercent = Math.round(battery.level * 100);
        this.cachedLevel = levelPercent;
        return levelPercent;
      }
    } catch (err: any) {
      logger.debug('BATTERY', `Web Battery API not available: ${err?.message}`);
    }

    return this.cachedLevel;
  }

  /**
   * Checks whether the phone battery level is sufficient for OTA firmware updates.
   * Hard requirement: Battery must be strictly above 30%.
   */
  public async checkBatteryForOta(minThreshold = 30): Promise<{
    sufficient: boolean;
    level: number;
    reason?: string;
  }> {
    const level = await this.getBatteryLevel();
    const sufficient = level > minThreshold;

    if (!sufficient) {
      return {
        sufficient: false,
        level,
        reason: `Phone battery is at ${level}%. Please charge your phone to above ${minThreshold}% before starting firmware update.`,
      };
    }

    return {
      sufficient: true,
      level,
    };
  }
}

export const PhoneBatteryService = new PhoneBatteryServiceClass();

