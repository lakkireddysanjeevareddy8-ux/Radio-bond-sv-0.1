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
  public handleIncomingPush(rawPayload: any): boolean {
    if (!rawPayload) return false;

    // Normalize payload properties
    const type = rawPayload.type || (rawPayload.data && rawPayload.data.type);
    if (type !== 'EMERGENCY') {
      return false; // Route only EMERGENCY events
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
    this.processedEventIds.add(eventId);

    // Keep set bounded (last 100 events)
    if (this.processedEventIds.size > 100) {
      const oldest = Array.from(this.processedEventIds)[0];
      this.processedEventIds.delete(oldest);
    }

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
      trigger: rawPayload.trigger || (isTest ? 'OTHER' : 'BUTTON'),
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
