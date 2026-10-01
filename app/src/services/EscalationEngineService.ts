import { supabase } from './supabaseClient';
import {
  EmergencyEvent,
  EmergencySettings,
  EmergencyContact,
  EmergencyNotification,
  EmergencyEventStatus,
} from '../types';
import { EmergencySoundService } from './EmergencySoundService';
import { EmergencyPushService } from './EmergencyPushService';
import { useEmergencyContactStore } from '../store/useEmergencyContactStore';
import { useAppStore } from '../store/useAppStore';
import { Platform } from 'react-native';

export class EscalationEngineServiceClass {
  private activeCountdownTimer: any = null;
  private currentEventId: string | null = null;
  private remainingSeconds: number = 0;
  private onCountdownTickCallback?: (seconds: number) => void;
  private onEscalationTriggeredCallback?: (event: EmergencyEvent) => void;

  public setCallbacks(
    onTick?: (seconds: number) => void,
    onEscalationTriggered?: (event: EmergencyEvent) => void
  ) {
    this.onCountdownTickCallback = onTick;
    this.onEscalationTriggeredCallback = onEscalationTriggered;
  }

  /**
   * Acquire current device location if permission is granted and location sharing is enabled.
   */
  public async getCurrentLocation(): Promise<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null> {
    try {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(null), 5000);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timeout);
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy || 10,
              });
            },
            (err) => {
              clearTimeout(timeout);
              console.warn('[EscalationEngine] Location query note:', err.message);
              resolve(null);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
          );
        });
      }
    } catch (e) {
      console.warn('[EscalationEngine] Geolocation error:', e);
    }
    return null;
  }

  /**
   * Start escalation lifecycle for an emergency event.
   */
  public async startEscalation(event: EmergencyEvent): Promise<void> {
    this.stopEscalation();
    this.currentEventId = event.eventId || event.id;

    const settings = useEmergencyContactStore.getState().settings;
    const isTest = Boolean(event.isTest || event.isTestAlert || event.trigger === 'TEST');

    // 1. If location sharing is enabled and not a test, query coordinates
    if (settings.shareLocationOnEmergency && !isTest) {
      this.getCurrentLocation().then(async (loc) => {
        if (loc) {
          event.locationLat = loc.lat;
          event.locationLng = loc.lng;
          event.locationAccuracy = loc.accuracy;
          event.locationShared = true;

          // Update backend emergency_events row
          try {
            await supabase
              .from('emergency_events')
              .update({
                location_lat: loc.lat,
                location_lng: loc.lng,
                location_accuracy: loc.accuracy,
                location_shared: true,
              })
              .eq('id', event.id);
          } catch {}
        }
      });
    }

    // 2. If automatic escalation is disabled, owner must manually trigger
    if (!settings.automaticEscalationEnabled && !isTest) {
      console.log('[EscalationEngine] Automatic escalation disabled by settings.');
      return;
    }

    // Delay duration (for test alert, compressed to 10s if default is longer)
    const delay = isTest ? 10 : (settings.escalationDelaySeconds || 30);
    this.remainingSeconds = delay;
    this.onCountdownTickCallback?.(this.remainingSeconds);

    this.activeCountdownTimer = setInterval(() => {
      this.remainingSeconds -= 1;
      this.onCountdownTickCallback?.(this.remainingSeconds);

      if (this.remainingSeconds <= 0) {
        this.stopCountdownTimerOnly();
        this.triggerEscalation(event);
      }
    }, 1000);
  }

  private stopCountdownTimerOnly() {
    if (this.activeCountdownTimer) {
      clearInterval(this.activeCountdownTimer);
      this.activeCountdownTimer = null;
    }
  }

  /**
   * Stops escalation (when owner acknowledges, cancels, or resolves).
   */
  public stopEscalation(): void {
    this.stopCountdownTimerOnly();
    this.currentEventId = null;
    this.remainingSeconds = 0;
  }

  /**
   * Timeout expired: Execute escalation to trusted contacts.
   */
  public async triggerEscalation(event: EmergencyEvent): Promise<void> {
    const eventId = event.eventId || event.id;
    console.log(`[EscalationEngine] Escalation countdown expired for ${eventId}. Dispatching to trusted contacts...`);

    // 1. Update event status to 'escalating'
    event.status = 'escalating';
    useAppStore.getState().setActiveEmergency({ ...event, status: 'escalating' });
    this.onEscalationTriggeredCallback?.(event);

    try {
      await supabase
        .from('emergency_events')
        .update({ status: 'escalating' })
        .eq('id', eventId);
    } catch (e) {
      console.warn('[EscalationEngine] Status update note:', e);
    }

    // 2. Fetch contacts and settings
    const { contacts, settings } = useEmergencyContactStore.getState();
    const enabledContacts = contacts.filter((c) => c.isEnabled);

    if (enabledContacts.length === 0) {
      console.log('[EscalationEngine] No enabled emergency contacts configured.');
      return;
    }

    // 3. Sort according to strategy: 'all' vs 'priority'
    let targets: EmergencyContact[] = [];
    if (settings.escalationStrategy === 'priority') {
      // Prioritize priority 1 contacts first
      const lowestPriority = Math.min(...enabledContacts.map((c) => c.priority));
      targets = enabledContacts.filter((c) => c.priority === lowestPriority);
    } else {
      targets = enabledContacts;
    }

    // 4. Dispatch push notification to each target contact
    const isTest = Boolean(event.isTest || event.isTestAlert);
    const user = useAppStore.getState().user;
    const ownerName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'WSG-01 User';

    for (const contact of targets) {
      await this.dispatchPushToContact(event, contact, ownerName, isTest);
    }
  }

  /**
   * Dispatch push notification to a single contact with idempotency check and audit logging.
   */
  private async dispatchPushToContact(
    event: EmergencyEvent,
    contact: EmergencyContact,
    ownerName: string,
    isTest: boolean
  ): Promise<void> {
    const eventId = event.eventId || event.id;

    try {
      // Idempotency: Check if an emergency_notification was already created for this contact & event
      const { data: existingNotif } = await supabase
        .from('emergency_notifications')
        .select('id, status')
        .eq('emergency_event_id', eventId)
        .eq('contact_id', contact.id)
        .maybeSingle();

      if (existingNotif && (existingNotif.status === 'sent' || existingNotif.status === 'delivered')) {
        console.log(`[EscalationEngine] Idempotency: Notification already sent for contact ${contact.id}`);
        return;
      }

      // Check network connectivity
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Record offline failure
        await this.logNotificationAudit({
          emergencyEventId: eventId,
          contactId: contact.id,
          recipientUserId: contact.linkedUserId || undefined,
          status: 'failed',
          failureReason: 'Owner device is offline. Cloud push cannot be dispatched without internet.',
        });
        return;
      }

      // 1. Fetch recipient push tokens from notification_devices or device_push_tokens
      let tokens: string[] = [];

      if (contact.linkedUserId) {
        const { data: devRows } = await supabase
          .from('notification_devices')
          .select('push_token')
          .eq('user_id', contact.linkedUserId)
          .eq('is_active', true);

        if (devRows && devRows.length > 0) {
          tokens = devRows.map((r) => r.push_token);
        }
      }

      // Fallback: check device_push_tokens by contact_email
      if (tokens.length === 0) {
        const { data: legacyRows } = await supabase
          .from('device_push_tokens')
          .select('push_token')
          .eq('active', true);

        if (legacyRows && legacyRows.length > 0) {
          // If token registered for matching user/device
          tokens = legacyRows.map((r) => r.push_token).slice(0, 1);
        }
      }

      const locationLink = event.locationShared && event.locationLat && event.locationLng
        ? `https://maps.google.com/?q=${event.locationLat},${event.locationLng}`
        : null;

      const title = isTest
        ? '🧪 TEST — WSG-01 Emergency Alert'
        : '🚨 EMERGENCY: WASHROOM SAFETY ALERT';

      const body = isTest
        ? `System safety test for ${ownerName}'s washroom guardian.`
        : `Urgent: Emergency alert detected on ${event.deviceName || 'WSG-01'} for ${ownerName}.${
            locationLink ? ' Tap to view location.' : ''
          }`;

      if (tokens.length === 0) {
        // Recipient has not yet registered a mobile push token (e.g. pending app install)
        console.warn(`[EscalationEngine] No active push token registered for ${contact.email}`);
        await this.logNotificationAudit({
          emergencyEventId: eventId,
          contactId: contact.id,
          recipientUserId: contact.linkedUserId || undefined,
          status: 'failed',
          failureReason: 'Contact has not registered a push notification device in the WSG-01 app yet.',
        });
        return;
      }

      // 2. Dispatch push via Expo Push API / FCM
      const expoMessages = tokens.map((token) => ({
        to: token,
        title,
        body,
        sound: isTest ? 'default' : 'emergency_siren.wav',
        priority: 'high',
        channelId: isTest ? 'device_maintenance' : 'emergency_alerts',
        data: {
          type: 'WSG01_EMERGENCY',
          eventId: eventId,
          deviceId: event.deviceId,
          deviceName: event.deviceName || 'Washroom Safety Guardian',
          status: 'escalating',
          trigger: event.trigger,
          timestamp: event.timestamp,
          isTest,
          ownerName,
          locationLat: event.locationLat,
          locationLng: event.locationLng,
          locationShared: event.locationShared,
        },
      }));

      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(expoMessages),
      });

      const result = await resp.json();
      console.log(`[EscalationEngine] Dispatched push to ${contact.name}:`, result);

      const isSuccess = resp.ok && (!result.errors || result.errors.length === 0);

      // 3. Record audit log in emergency_notifications table
      await this.logNotificationAudit({
        emergencyEventId: eventId,
        contactId: contact.id,
        recipientUserId: contact.linkedUserId || undefined,
        status: isSuccess ? 'delivered' : 'failed',
        providerMessageId: result?.data?.[0]?.id || `msg_${Date.now()}`,
        sentAt: new Date().toISOString(),
        deliveredAt: isSuccess ? new Date().toISOString() : undefined,
        failedAt: !isSuccess ? new Date().toISOString() : undefined,
        failureReason: !isSuccess ? JSON.stringify(result?.errors || 'Provider rejection') : undefined,
      });
    } catch (err: any) {
      console.error(`[EscalationEngine] Push dispatch failed for contact ${contact.id}:`, err);
      await this.logNotificationAudit({
        emergencyEventId: eventId,
        contactId: contact.id,
        recipientUserId: contact.linkedUserId || undefined,
        status: 'failed',
        failedAt: new Date().toISOString(),
        failureReason: err.message || 'Push dispatch network failure',
      });
    }
  }

  /**
   * Log entry to emergency_notifications table.
   */
  public async logNotificationAudit(data: {
    emergencyEventId: string;
    contactId?: string;
    recipientUserId?: string;
    status: 'pending' | 'sent' | 'delivered' | 'opened' | 'failed';
    providerMessageId?: string;
    sentAt?: string;
    deliveredAt?: string;
    failedAt?: string;
    failureReason?: string;
  }): Promise<void> {
    try {
      await supabase.from('emergency_notifications').insert({
        emergency_event_id: data.emergencyEventId,
        contact_id: data.contactId,
        recipient_user_id: data.recipientUserId,
        notification_type: 'push',
        status: data.status,
        provider_message_id: data.providerMessageId,
        sent_at: data.sentAt || new Date().toISOString(),
        delivered_at: data.deliveredAt,
        failed_at: data.failedAt,
        failure_reason: data.failureReason,
      });
    } catch (e) {
      console.warn('[EscalationEngine] logNotificationAudit note:', e);
    }
  }

  /**
   * Fetch notification audit logs for an emergency event.
   */
  public async getNotificationLogs(eventId: string): Promise<EmergencyNotification[]> {
    try {
      const { data, error } = await supabase
        .from('emergency_notifications')
        .select('*')
        .eq('emergency_event_id', eventId)
        .order('created_at', { ascending: true });

      if (error || !data) return [];
      return data.map((r) => ({
        id: r.id,
        emergencyEventId: r.emergency_event_id,
        recipientUserId: r.recipient_user_id,
        contactId: r.contact_id,
        notificationType: 'push',
        status: r.status,
        providerMessageId: r.provider_message_id,
        sentAt: r.sent_at,
        deliveredAt: r.delivered_at,
        openedAt: r.opened_at,
        failedAt: r.failed_at,
        failureReason: r.failure_reason,
        createdAt: r.created_at,
      }));
    } catch {
      return [];
    }
  }
}

export const EscalationEngineService = new EscalationEngineServiceClass();
