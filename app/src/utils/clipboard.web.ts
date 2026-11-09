/**
 * Web clipboard implementation for WSG-01.
 * Uses native Web Clipboard API (navigator.clipboard) with execCommand fallback.
 * Completely eliminates importing expo-clipboard into web bundles.
 */
export const Clipboard = {
  setStringAsync: async (text: string): Promise<boolean> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      if (typeof document !== 'undefined') {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      }
    } catch (err) {
      console.warn('Web clipboard write failed:', err);
    }
    return false;
  },

  getStringAsync: async (): Promise<string> => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        return await navigator.clipboard.readText();
      }
    } catch (err) {
      console.warn('Web clipboard read failed:', err);
    }
    return '';
  },
};
