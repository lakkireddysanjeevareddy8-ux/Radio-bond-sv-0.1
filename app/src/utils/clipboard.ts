import * as ExpoClipboard from 'expo-clipboard';

/**
 * Native mobile clipboard implementation for WSG-01 (Android / iOS).
 */
export const Clipboard = {
  setStringAsync: async (text: string): Promise<boolean> => {
    try {
      await ExpoClipboard.setStringAsync(text);
      return true;
    } catch (err) {
      console.warn('Native clipboard write failed:', err);
      return false;
    }
  },

  getStringAsync: async (): Promise<string> => {
    try {
      return await ExpoClipboard.getStringAsync();
    } catch (err) {
      console.warn('Native clipboard read failed:', err);
      return '';
    }
  },
};
