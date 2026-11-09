import { Platform, Linking } from 'react-native';
import { storage } from '../utils/storage';
import { logger } from '../utils/logger';

const BATTERY_OPT_PROMPTED_KEY = 'wsg_battery_optimization_prompted';

class BatteryOptimizationServiceClass {
  /**
   * Checks whether the user has already been prompted to disable battery optimization.
   */
  public async hasPrompted(): Promise<boolean> {
    try {
      const prompted = await storage.getJSON<boolean>(BATTERY_OPT_PROMPTED_KEY, false);
      return Boolean(prompted);
    } catch {
      return false;
    }
  }

  /**
   * Marks that the user has received the battery optimization prompt (so it is not shown again).
   */
  public async markPrompted(): Promise<void> {
    try {
      await storage.setJSON(BATTERY_OPT_PROMPTED_KEY, true);
      logger.info('BATTERY_OPT', 'Marked battery optimization prompted');
    } catch (e) {
      logger.warn('BATTERY_OPT', 'Failed to save battery optimization prompted flag', e);
    }
  }

  /**
   * Checks if this platform requires and supports battery optimization exemption.
   * Applicable on Android where aggressive OS battery savers can kill background BLE links.
   */
  public isApplicable(): boolean {
    return Platform.OS === 'android';
  }

  /**
   * Opens OS battery optimization settings or application settings.
   */
  public async openBatterySettings(): Promise<void> {
    if (Platform.OS !== 'android') return;
    logger.info('BATTERY_OPT', 'Opening Android battery optimization settings');
    try {
      await Linking.sendIntent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
    } catch (e) {
      try {
        await Linking.openSettings();
      } catch (err) {
        logger.error('BATTERY_OPT', 'Could not open settings', err);
      }
    }
  }
}

export const BatteryOptimizationService = new BatteryOptimizationServiceClass();

