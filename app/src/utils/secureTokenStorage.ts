/**
 * Secure Token Storage for WSG-01 Device Pairing Tokens.
 * Uses `expo-secure-store` to ensure pairing credentials are encrypted in
 * iOS Keychain and Android Keystore, and never placed into plain AsyncStorage.
 */

import * as SecureStore from 'expo-secure-store';
import { logger } from './logger';

const TOKEN_KEY_PREFIX = 'wsg_pair_token_';

// In-memory fallback if SecureStore is not supported in runtime
const memoryFallback = new Map<string, string>();

function sanitizeKey(deviceId: string): string {
  const safeId = deviceId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return `${TOKEN_KEY_PREFIX}${safeId}`;
}

export const SecureTokenStorage = {
  /**
   * Saves the pairing token for a device in hardware-backed secure storage.
   */
  async saveDeviceToken(deviceId: string, token: string): Promise<void> {
    if (!deviceId || !token) return;
    const key = sanitizeKey(deviceId);
    try {
      const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
      if (isAvailable) {
        await SecureStore.setItemAsync(key, token, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        });
      } else {
        memoryFallback.set(key, token);
      }
      logger.info('SECURE_STORE', `Saved pairing token for device ${deviceId}`);
    } catch (err: any) {
      logger.error('SECURE_STORE', `Failed to write token to SecureStore for ${deviceId}, falling back to memory`, logger.serializeError(err));
      memoryFallback.set(key, token);
    }
  },

  /**
   * Retrieves the pairing token for a device from secure storage.
   * Returns null if not found.
   */
  async getDeviceToken(deviceId: string): Promise<string | null> {
    if (!deviceId) return null;
    const key = sanitizeKey(deviceId);
    try {
      const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
      if (isAvailable) {
        const token = await SecureStore.getItemAsync(key);
        if (token) return token;
      }
      return memoryFallback.get(key) || null;
    } catch (err: any) {
      logger.error('SECURE_STORE', `Failed to read token from SecureStore for ${deviceId}`, logger.serializeError(err));
      return memoryFallback.get(key) || null;
    }
  },

  /**
   * Deletes the stored pairing token for a device.
   */
  async removeDeviceToken(deviceId: string): Promise<void> {
    if (!deviceId) return;
    const key = sanitizeKey(deviceId);
    try {
      const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
      if (isAvailable) {
        await SecureStore.deleteItemAsync(key);
      }
      memoryFallback.delete(key);
      logger.info('SECURE_STORE', `Removed pairing token for device ${deviceId}`);
    } catch (err: any) {
      logger.error('SECURE_STORE', `Failed to delete token from SecureStore for ${deviceId}`, logger.serializeError(err));
      memoryFallback.delete(key);
    }
  },

  /**
   * Checks whether a pairing token exists for the given device.
   */
  async hasDeviceToken(deviceId: string): Promise<boolean> {
    const token = await this.getDeviceToken(deviceId);
    return Boolean(token && token.length > 0);
  },
};

