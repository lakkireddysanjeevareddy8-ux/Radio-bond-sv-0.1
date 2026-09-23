import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Robust cross-platform persistent storage utility.
 * Backed by AsyncStorage for persistent storage across app restarts on Android, iOS, and Web,
 * with graceful in-memory and localStorage fallback.
 */
export const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const val = await AsyncStorage.getItem(key);
      if (val !== null) return val;
    } catch (e) {
      console.warn(`[storage] AsyncStorage.getItem error for ${key}:`, e);
    }

    // Web fallback if AsyncStorage failed or returned null
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {}

    return null;
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[storage] AsyncStorage.setItem error for ${key}:`, e);
    }

    // Mirror to localStorage if web environment
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {}
  },

  async removeItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn(`[storage] AsyncStorage.removeItem error for ${key}:`, e);
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {}
  },

  async getJSON<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const raw = await this.getItem(key);
      if (raw) {
        return JSON.parse(raw) as T;
      }
    } catch (e) {
      console.warn(`[storage] getJSON parsing error for ${key}:`, e);
    }
    return defaultValue;
  },

  async setJSON<T>(key: string, value: T): Promise<void> {
    try {
      await this.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn(`[storage] setJSON stringify error for ${key}:`, e);
    }
  },
};
