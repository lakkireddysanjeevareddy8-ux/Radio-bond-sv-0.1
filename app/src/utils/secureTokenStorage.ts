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
   * Optionally stores under multiple aliases (e.g. MAC address, hardware ID, advertisement name).
   */
  async saveDeviceToken(deviceId: string, token: string, aliases?: string[]): Promise<void> {
    if (!deviceId || !token) return;
    const ids = Array.from(new Set([deviceId, ...(aliases || [])].filter(Boolean)));
    
    for (const id of ids) {
      const key = sanitizeKey(id);
      try {
        const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
        if (isAvailable) {
          await SecureStore.setItemAsync(key, token, {
            keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
          });
        } else {
          memoryFallback.set(key, token);
        }
        logger.info('SECURE_STORE', `Saved pairing token for device: ${id} (key: ${key})`);
      } catch (err: any) {
        logger.error('SECURE_STORE', `Failed to write token to SecureStore for ${id}, falling back to memory`, logger.serializeError(err));
        memoryFallback.set(key, token);
      }
    }
  },

  /**
   * Retrieves the pairing token for a device from secure storage.
   * Supports fallback identifiers (e.g. device ID, MAC address, device name).
   * Returns null if not found.
   */
  async getDeviceToken(deviceId: string, fallbackIds?: (string | undefined | null)[]): Promise<string | null> {
    if (!deviceId && (!fallbackIds || fallbackIds.length === 0)) return null;
    const candidateIds = Array.from(new Set([deviceId, ...(fallbackIds || [])].filter((id): id is string => Boolean(id))));

    for (const id of candidateIds) {
      const key = sanitizeKey(id);
      try {
        const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
        if (isAvailable) {
          const token = await SecureStore.getItemAsync(key);
          if (token && token.trim().length > 0) return token.trim();
        }
        const memToken = memoryFallback.get(key);
        if (memToken && memToken.trim().length > 0) return memToken.trim();
      } catch (err: any) {
        logger.error('SECURE_STORE', `Failed to read token from SecureStore for ${id}`, logger.serializeError(err));
        const memToken = memoryFallback.get(key);
        if (memToken && memToken.trim().length > 0) return memToken.trim();
      }
    }
    return null;
  },

  /**
   * Deletes the stored pairing token for a device and any optional aliases.
   */
  async removeDeviceToken(deviceId: string, aliases?: (string | undefined | null)[]): Promise<void> {
    if (!deviceId && (!aliases || aliases.length === 0)) return;
    const candidateIds = Array.from(new Set([deviceId, ...(aliases || [])].filter((id): id is string => Boolean(id))));

    for (const id of candidateIds) {
      const key = sanitizeKey(id);
      try {
        const isAvailable = await SecureStore.isAvailableAsync().catch(() => false);
        if (isAvailable) {
          await SecureStore.deleteItemAsync(key);
        }
        memoryFallback.delete(key);
        logger.info('SECURE_STORE', `Removed pairing token for device: ${id}`);
      } catch (err: any) {
        logger.error('SECURE_STORE', `Failed to delete token from SecureStore for ${id}`, logger.serializeError(err));
        memoryFallback.delete(key);
      }
    }
  },

  /**
   * Checks whether a pairing token exists for the given device.
   */
  async hasDeviceToken(deviceId: string, fallbackIds?: (string | undefined | null)[]): Promise<boolean> {
    const token = await this.getDeviceToken(deviceId, fallbackIds);
    return Boolean(token && token.length > 0);
  },
};

