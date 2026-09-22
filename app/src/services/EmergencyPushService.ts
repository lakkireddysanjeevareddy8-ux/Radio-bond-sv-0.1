import { Platform } from 'react-native';
import { EmergencyEvent, EmergencyPushPayload } from '../types';
import { EmergencySoundService } from './EmergencySoundService';

/**
 * EmergencyPushService
 * 
 * Handles incoming push messages, validates emergency type,
 * deduplicates retries by eventId, and triggers native Android
 * high-importance emergency alarm notifications.
 */
class EmergencyPushServiceClass {
  private processedEventIds: Set<string> = new Set<string>();
  private onEmergencyReceivedCallback?: (event: EmergencyEvent) => void;

  public setOnEmergencyReceived(callback: (event: EmergencyEvent) => void) {
    this.onEmergencyReceivedCallback = callback;
  }

  /**
   * Process incoming push payload (from FCM, Supabase Webhook, or local device bridge).
   * Validates type = EMERGENCY, deduplicates by eventId, and triggers urgent notification flow.
   */
  /**
   * Check if an emergency event has already been handled by either Realtime or Push.
   */
  public isEventAlreadyProcessed(eventId: string): boolean {
    return this.processedEventIds.has(eventId);
  }

  /**
   * Explicitly record an event as processed to prevent duplicate alerts.
   */
  public markEventProcessed(eventId: string): void {
    this.processedEventIds.add(eventId);
    if (this.processedEventIds.size > 100) {
      const oldest = Array.from(this.processedEventIds)[0];
      this.processedEventIds.delete(oldest);
    }
  }

  /**
   * Process incoming push payload (from FCM, Expo Push, Supabase Webhook, or local device bridge).
   * Validates type = EMERGENCY / WSG01_EMERGENCY, deduplicates by eventId, and triggers urgent notification flow.
   */
  public handleIncomingPush(rawPayload: any): boolean {
    if (!rawPayload) return false;

    // Normalize payload properties
    const type = rawPayload.type || (rawPayload.data && rawPayload.data.type);
    if (type !== 'EMERGENCY' && type !== 'WSG01_EMERGENCY') {
      return false; // Route only WSG-01 emergency events
    }

    const eventId = String(
      rawPayload.eventId ||
      (rawPayload.data && rawPayload.data.eventId) ||
      rawPayload.id ||
      `emg_${Date.now()}`
    );

    // Deduplicate: If this event was already processed, avoid duplicate ringing/notifications
    if (this.processedEventIds.has(eventId)) {
      console.log(`[EmergencyPushService] Ignoring duplicate emergency event: ${eventId}`);
      return false; // Deduplicated
    }
    this.markEventProcessed(eventId);

    const deviceId =
      rawPayload.deviceId ||
      (rawPayload.data && rawPayload.data.deviceId) ||
      'WSG-000001';

    const deviceName =
      rawPayload.deviceName ||
      (rawPayload.data && rawPayload.data.deviceName) ||
      'Washroom Safety Guardian';

    const severity =
      rawPayload.severity ||
      (rawPayload.data && rawPayload.data.severity) ||
      'CRITICAL';

    const presenceDuration = Number(
      rawPayload.presenceDuration ||
      (rawPayload.data && rawPayload.data.presenceDuration) ||
      0
    );

    const timestamp =
      rawPayload.timestamp ||
      (rawPayload.data && rawPayload.data.timestamp) ||
      new Date().toISOString();

    const isTest = Boolean(
      rawPayload.isTest ||
      rawPayload.isTestAlert ||
      (rawPayload.data && (rawPayload.data.isTest || rawPayload.data.isTestAlert))
    );

    const emergencyEvent: EmergencyEvent = {
      id: eventId,
      eventId: eventId,
      deviceId: deviceId,
      deviceName: deviceName,
      type: 'EMERGENCY',
      eventType: 'EMERGENCY',
      trigger: rawPayload.trigger || (rawPayload.data && rawPayload.data.trigger) || (isTest ? 'OTHER' : 'BUTTON'),
      severity: severity,
      presenceDuration: presenceDuration,
      timestamp: timestamp,
      status: 'ACTIVE',
      isTestAlert: isTest,
    };

    // 1. Dispatch through Android Native / Web Notification channel with sound & vibration
    EmergencySoundService.dispatchEmergencyNotification(emergencyEvent);

    // 2. Notify in-app subscriber / zustand store
    if (this.onEmergencyReceivedCallback) {
      this.onEmergencyReceivedCallback(emergencyEvent);
    }

    return true;
  }

  /**
   * Register physical hardware device with Expo Push Service and store
   * token securely in Supabase device_push_tokens table.
   */
  public async registerForPushNotifications(deviceId: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return null;
    }

    try {
      const { PermissionService } = require('./PermissionService');
      const permStatus = await PermissionService.requestNotificationPermission();
      if (permStatus !== 'granted') {
        console.log('[EmergencyPushService] Push registration skipped: Notification permission not granted');
        return null;
      }

      const Notifications = require('expo-notifications');
      let tokenData: any;
      try {
        tokenData = await Notifications.getExpoPushTokenAsync();
      } catch (tokenErr) {
        console.warn('[EmergencyPushService] Error getting Expo push token:', tokenErr);
        return null;
      }

      const token = tokenData?.data;
      if (!token || typeof token !== 'string') {
        return null;
      }

      // Upsert into Supabase device_push_tokens table
      try {
        const { supabase } = require('./supabaseClient');
        const user = require('../store/useAppStore').useAppStore.getState().user;
        let userId = user?.id;
        if (!userId) {
          try {
            const authRes = await supabase.auth.getUser();
            userId = authRes?.data?.user?.id;
          } catch {}
        }

        const { error } = await supabase
          .from('device_push_tokens')
          .upsert(
            {
              device_id: deviceId,
              push_token: token,
              platform: Platform.OS,
              provider: 'expo',
              user_id: userId,
              active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'device_id,push_token' }
          );

        if (error) {
          console.warn('[EmergencyPushService] Error saving push token to Supabase:', error);
        } else {
          console.log(`[EmergencyPushService] Push token registered for ${deviceId}: ${token.slice(0, 20)}...`);
        }
      } catch (dbErr) {
        console.warn('[EmergencyPushService] Database error saving push token:', dbErr);
      }

      return token;
    } catch (err) {
      console.warn('[EmergencyPushService] Registration error:', err);
      return null;
    }
  }

  /**
   * Helper to construct a standardized push payload for backend / ESP32 dispatch.
   */
  public createPayload(params: {
    deviceId: string;
    deviceName: string;
    severity?: 'CRITICAL' | 'WARNING' | 'INFO';
    presenceDuration?: number;
    eventId?: string;
    isTest?: boolean;
  }): EmergencyPushPayload {
    const eventId = params.eventId || `emg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      type: 'EMERGENCY',
      eventId: eventId,
      deviceId: params.deviceId,
      deviceName: params.deviceName,
      severity: params.severity || 'CRITICAL',
      timestamp: new Date().toISOString(),
      presenceDuration: params.presenceDuration ?? 0,
      isTest: params.isTest,
    };
  }

  /**
   * Request Notification permission for emergency alerts across Android (13+ POST_NOTIFICATIONS),
   * iOS, and Web.
   */
  public async requestNotificationPermission(): Promise<boolean> {
    try {
      const { PermissionService } = require('./PermissionService');
      const status = await PermissionService.requestNotificationPermission();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Check if notification permission is currently granted
   */
  public async checkNotificationPermission(): Promise<boolean> {
    try {
      const { PermissionService } = require('./PermissionService');
      const status = await PermissionService.checkNotificationPermission();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Reset deduplication cache (useful for testing)
   */
  public clearDeduplicationCache() {
    this.processedEventIds.clear();
  }
}

export const EmergencyPushService = new EmergencyPushServiceClass();

