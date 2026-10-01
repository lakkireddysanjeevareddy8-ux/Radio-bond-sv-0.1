import { Platform, Linking } from 'react-native';
import { QuietHoursConfig } from '../types';
import { supabase } from './supabaseClient';

export interface BypassPermissionStatus {
  granted: boolean;
  canBypassDnd: boolean;
  platform: 'android' | 'ios' | 'web';
  warningMessage?: string;
}

export const defaultQuietHours: QuietHoursConfig = {
  enabled: false,
  startTime: '22:00',
  endTime: '07:00',
  emergencyBypass: true,
};

class QuietHoursServiceClass {
  /**
   * Determine if the current local time falls within configured quiet hours.
   * Accurately supports overnight time spans (e.g., 22:00 to 07:00).
   */
  public isInQuietHours(config?: QuietHoursConfig | null): boolean {
    if (!config || !config.enabled) return false;

    const startMinutes = this.parseTimeToMinutes(config.startTime || '22:00');
    const endMinutes = this.parseTimeToMinutes(config.endTime || '07:00');

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    if (startMinutes < endMinutes) {
      // Daytime quiet hours (e.g. 13:00 to 15:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight quiet hours (e.g. 22:00 to 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  /**
   * Evaluates if a notification should be suppressed during quiet hours.
   * STRICT LIFE-SAFETY REQUIREMENT:
   * Emergency alerts ('EMERGENCY', 'WSG01_EMERGENCY') ALWAYS return false (BYPASS).
   * Routine maintenance, low-battery, and offline notices are suppressed.
   */
  public shouldSuppressNotification(
    notificationType: string,
    config?: QuietHoursConfig | null
  ): boolean {
    // 1. Life-safety emergency alerts ALWAYS bypass quiet hours & DND
    if (
      notificationType === 'EMERGENCY' ||
      notificationType === 'WSG01_EMERGENCY' ||
      notificationType.includes('EMERGENCY')
    ) {
      console.log('[QuietHours] Emergency notification bypasses quiet hours and DND.');
      return false;
    }

    // 2. Non-emergency notifications suppressed if currently in quiet hours
    if (this.isInQuietHours(config)) {
      console.log(`[QuietHours] Suppressed non-emergency notification (${notificationType}) during quiet hours.`);
      return true;
    }

    return false;
  }

  /**
   * Audits whether system permissions allow emergency alerts to bypass Do Not Disturb.
   * On Android: checks notification channel bypassDnd settings and notification permission.
   * On iOS: checks Critical Alerts permission.
   */
  public async checkBypassPermissions(): Promise<BypassPermissionStatus> {
    const platform = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';

    if (Platform.OS === 'android') {
      try {
        const Notifications = require('expo-notifications');
        const settings = await Notifications.getPermissionsAsync();
        const granted = settings.granted || settings.status === 'granted';

        // Check if emergency channel exists with bypassDnd
        const channel = await Notifications.getNotificationChannelAsync('emergency_alerts');
        const canBypassDnd = Boolean(channel?.bypassDnd);

        return {
          granted,
          canBypassDnd: granted && canBypassDnd,
          platform: 'android',
          warningMessage: !canBypassDnd
            ? 'Android "Override Do Not Disturb" is recommended so washroom fall alerts ring during silent hours.'
            : undefined,
        };
      } catch (e) {
        return {
          granted: true,
          canBypassDnd: true,
          platform: 'android',
        };
      }
    }

    if (Platform.OS === 'ios') {
      try {
        const Notifications = require('expo-notifications');
        const settings = await Notifications.getPermissionsAsync();
        const granted = settings.granted || settings.status === 'granted';
        const canBypass = Boolean((settings as any).ios?.allowsCriticalAlerts);

        return {
          granted,
          canBypassDnd: canBypass,
          platform: 'ios',
          warningMessage: !canBypass
            ? 'iOS Critical Alerts not provisioned. Enable in iOS Settings to allow emergency sirens when phone is silenced.'
            : undefined,
        };
      } catch (e) {
        return {
          granted: true,
          canBypassDnd: true,
          platform: 'ios',
        };
      }
    }

    return {
      granted: true,
      canBypassDnd: true,
      platform: 'web',
    };
  }

  /**
   * Deep-link user to native operating system app settings so they can grant DND bypass.
   */
  public async openSystemNotificationSettings(): Promise<void> {
    try {
      if (Platform.OS !== 'web') {
        await Linking.openSettings();
      }
    } catch (e) {
      console.warn('[QuietHours] Could not open system settings:', e);
    }
  }

  /**
   * Persist quiet hours preferences to Supabase device_quiet_hours table
   */
  public async saveQuietHours(deviceId: string, config: QuietHoursConfig): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('device_quiet_hours')
        .upsert(
          {
            device_id: deviceId,
            enabled: config.enabled,
            start_time: config.startTime,
            end_time: config.endTime,
            emergency_bypass: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'device_id' }
        );

      if (error) {
        console.warn('[QuietHours] Database save error:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[QuietHours] Save exception:', e);
      return false;
    }
  }

  /**
   * Load quiet hours preferences from Supabase device_quiet_hours table
   */
  public async loadQuietHours(deviceId: string): Promise<QuietHoursConfig | null> {
    try {
      const { data, error } = await supabase
        .from('device_quiet_hours')
        .select('*')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (error || !data) return null;

      return {
        enabled: Boolean(data.enabled),
        startTime: data.start_time || '22:00',
        endTime: data.end_time || '07:00',
        emergencyBypass: true,
      };
    } catch (e) {
      console.warn('[QuietHours] Load exception:', e);
      return null;
    }
  }

  private parseTimeToMinutes(timeStr: string): number {
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const mins = parseInt(parts[1], 10) || 0;
    return hours * 60 + mins;
  }
}

export const QuietHoursService = new QuietHoursServiceClass();
