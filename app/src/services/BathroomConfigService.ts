import { storage } from '../utils/storage';
import { supabase } from './supabaseClient';
import { logger } from '../utils/logger';
import { Bathroom3DConfig, DEFAULT_BATHROOM_CONFIG } from '../types/bathroom';

const STORAGE_KEY_BATHROOM = 'wsg_bathroom_design_v1';

export class BathroomConfigService {
  /**
   * Loads saved bathroom 3D configuration from local storage or Supabase
   */
  public static async loadConfig(deviceId?: string): Promise<Bathroom3DConfig> {
    try {
      // 1. Try local storage first (instant offline response)
      const cached = await storage.getJSON<Bathroom3DConfig>(STORAGE_KEY_BATHROOM, DEFAULT_BATHROOM_CONFIG);
      if (cached && cached.dimensions && cached.door && cached.device) {
        return cached;
      }

      // 2. Try Supabase cloud sync if deviceId is provided
      if (deviceId && deviceId !== 'WSG-000001') {
        const { data, error } = await supabase
          .from('devices')
          .select('metadata')
          .eq('device_id', deviceId)
          .single();

        if (!error && data?.metadata?.bathroomConfig) {
          const cloudConfig = data.metadata.bathroomConfig as Bathroom3DConfig;
          await storage.setJSON(STORAGE_KEY_BATHROOM, cloudConfig);
          return cloudConfig;
        }
      }
    } catch (err) {
      logger.warn('BATHROOM', 'Error loading bathroom configuration, using defaults', logger.serializeError(err));
    }

    return DEFAULT_BATHROOM_CONFIG;
  }

  /**
   * Saves bathroom 3D configuration locally and optionally to Supabase
   */
  public static async saveConfig(
    config: Bathroom3DConfig,
    deviceId?: string
  ): Promise<{ success: boolean; cloudSynced: boolean; error?: string }> {
    try {
      const updatedConfig: Bathroom3DConfig = {
        ...config,
        updatedAt: new Date().toISOString(),
      };

      // 1. Persist locally to storage
      await storage.setJSON(STORAGE_KEY_BATHROOM, updatedConfig);
      logger.info('BATHROOM', `Saved 3D bathroom config: ${updatedConfig.dimensions.length}m x ${updatedConfig.dimensions.width}m on ${updatedConfig.device.wall} wall`);

      let cloudSynced = false;

      // 2. Sync to Supabase device metadata if connected & authenticated
      if (deviceId && deviceId !== 'WSG-000001') {
        try {
          const { error } = await supabase
            .from('devices')
            .update({
              metadata: {
                bathroomConfig: updatedConfig,
                lastConfiguredAt: updatedConfig.updatedAt,
              },
            })
            .eq('device_id', deviceId);

          if (!error) {
            cloudSynced = true;
          }
        } catch (cloudErr) {
          logger.warn('BATHROOM', 'Cloud sync failed, preserved locally', logger.serializeError(cloudErr));
        }
      }

      return { success: true, cloudSynced };
    } catch (err: any) {
      logger.error('BATHROOM', 'Failed to save bathroom configuration', logger.serializeError(err));
      return { success: false, cloudSynced: false, error: err?.message || 'Failed to save configuration' };
    }
  }

  /**
   * Resets configuration to default baseline
   */
  public static async resetConfig(): Promise<Bathroom3DConfig> {
    await storage.setJSON(STORAGE_KEY_BATHROOM, DEFAULT_BATHROOM_CONFIG);
    return DEFAULT_BATHROOM_CONFIG;
  }
}
