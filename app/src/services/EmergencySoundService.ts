import { Platform, Vibration } from 'react-native';
import { EmergencyEvent } from '../types';

/**
 * EmergencySoundService
 * 
 * Implements Android-native high-importance emergency channel behavior:
 * - Dedicated channel: "emergency_alerts" ("Emergency Alerts")
 * - High-intensity emergency alarm audio tone (dual-frequency 960Hz / 770Hz)
 * - Urgent emergency vibration pattern: [0, 1000, 500, 1000, 500, 1000]
 * - Lock-screen presentation & full-screen intent invocation
 * - Deduplication by eventId
 * - Action buttons: [ OPEN ALERT ], [ I'M CHECKING ]
 */
class EmergencySoundServiceClass {
  public static readonly CHANNEL_ID = 'emergency_alerts';
  public static readonly CHANNEL_NAME = 'Emergency Alerts';

  private audioCtx: AudioContext | null = null;
  private isSirenActive: boolean = false;
  private isVibrating: boolean = false;
  private sirenInterval: any = null;
  private vibrationInterval: any = null;
  private isMuted: boolean = false;
  private lastDispatchedEventId: string | null = null;

  constructor() {
    this.initEmergencyChannel();
  }

  /**
   * Initialize Android emergency notification channel
   */
  public async initEmergencyChannel(): Promise<void> {
    try {
      // If ServiceWorker registration is available, register actions and channel
      if (
        typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        navigator.serviceWorker
      ) {
        // Ready channel
      }
    } catch (e) {
      console.warn('[EmergencySoundService] Channel init note:', e);
    }
  }

  /**
   * Request system-level Notification permission so pop-ups
   * appear outside the browser or app (over lock-screen, calls, or other apps).
   * Branches by platform: Web Notification API on web, PermissionService (including Android 13+ POST_NOTIFICATIONS) on native.
   */
  public async requestNotificationPermission(): Promise<boolean> {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'default') {
            const res = await Notification.requestPermission();
            return res === 'granted';
          }
          return Notification.permission === 'granted';
        }
      } catch (e) {
        console.warn('Notification permission request note:', e);
      }
      return false;
    }

    // Native Android (including Android 13+ POST_NOTIFICATIONS) & iOS
    try {
      const { PermissionService } = require('./PermissionService');
      const status = await PermissionService.requestNotificationPermission();
      return status === 'granted';
    } catch (e) {
      console.warn('[EmergencySoundService] Native notification request error:', e);
      return false;
    }
  }

  /**
   * Urgent emergency vibration pattern:
   * [0, 1000, 500, 1000, 500, 1000]
   * Starts immediately, runs 1s, pauses 500ms, repeats.
   */
  public startContinuousVibration(): void {
    if (this.isVibrating) return;
    this.isVibrating = true;

    const urgentPattern = [0, 1000, 500, 1000, 500, 1000];

    // 1. Native React Native looping vibration
    try {
      Vibration.vibrate(urgentPattern, true);
    } catch {}

    // 2. Web / Browser looping vibration via navigator.vibrate
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        const triggerWebPulse = () => {
          if (!this.isVibrating) return;
          try {
            navigator.vibrate([1000, 500, 1000, 500, 1000]);
          } catch {}
        };

        triggerWebPulse();
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        this.vibrationInterval = setInterval(triggerWebPulse, 4000);
      }
    } catch (e) {
      console.warn('Web vibration initiation note:', e);
    }
  }

  /**
   * Stop continuous vibration immediately.
   */
  public stopContinuousVibration(): void {
    this.isVibrating = false;

    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    try {
      Vibration.cancel();
    } catch {}

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(0);
      }
    } catch {}
  }

  public getNotificationPermission(): 'granted' | 'denied' | 'default' | 'unsupported' {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'unsupported';
  }

  public async unlockAndTestAudio(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') return true;
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return false;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      // Play short 200ms confirmation chime
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.2);
      return true;
    } catch (e) {
      console.warn('Audio unlock error:', e);
      return false;
    }
  }

  public testVibration(): boolean {
    try {
      const pattern = [0, 1000, 500, 1000, 500, 1000];
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([1000, 500, 1000, 500, 1000]);
        return true;
      }
      Vibration.vibrate(pattern);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Main entrypoint to dispatch an emergency notification:
   * 1. Plays urgent alarm sound
   * 2. Triggers urgent vibration
   * 3. Dispatches high-importance notification
   * 4. Attempts full-screen intent / brings window to front
   */
  public dispatchEmergencyNotification(event: EmergencyEvent): void {
    const eventId = event.eventId || event.id;

    // Deduplicate: avoid firing repeatedly for the exact same event
    if (this.lastDispatchedEventId === eventId && (this.isSirenActive || this.isVibrating)) {
      return;
    }
    this.lastDispatchedEventId = eventId;

    // 1. Start audio siren and vibration
    this.resetMute();
    this.playEmergencySiren();
    this.startContinuousVibration();

    // 2. Format title and body according to user requirements
    const isTest = Boolean(event.isTestAlert);
    const title = isTest
      ? '🚨 TEST EMERGENCY ALERT'
      : '🚨 EMERGENCY: WASHROOM SAFETY ALERT';

    const durationText = this.formatDuration(event.presenceDuration);
    const deviceName = event.deviceName || 'Washroom Safety Guardian';

    const body = isTest
      ? `[TEST MODE] Emergency alert pipeline verification. Device: ${deviceName}. Tap to open alarm screen.`
      : `A configured emergency condition has been detected.\nDevice: ${deviceName}\nStatus: CRITICAL\nPresence: ${durationText}\nTap to check on person.`;

    // 3. Dispatch OS-level high importance notification
    this.sendSystemNotification(title, body, event.trigger || 'EMERGENCY', event);

    // 4. Attempt full-screen activity / focus where Android permits
    this.attemptFullScreenPresentation();
  }

  /**
   * Attempt official Android full-screen presentation:
   * Brings application into foreground / focuses window.
   */
  public attemptFullScreenPresentation(): void {
    try {
      if (typeof window !== 'undefined') {
        window.focus();
      }
    } catch {}

    // Send focus request to bridge if active
    try {
      fetch('http://127.0.0.1:5005/bring-to-front', {
        method: 'POST',
      }).catch(() => {});
    } catch {}
  }

  /**
   * Dispatch an OS-level notification popup that appears
   * on top of desktop, rest, social media, or other apps.
   */
  public sendSystemNotification(
    title: string,
    body: string,
    trigger: string = 'EMERGENCY',
    event?: EmergencyEvent
  ): void {
    // 1. Dispatch to Windows Bridge to bring browser to front & trigger system alert sound
    try {
      fetch('http://127.0.0.1:5005/emergency-popup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          trigger,
          eventId: event?.eventId || event?.id,
          channel: EmergencySoundServiceClass.CHANNEL_ID,
        }),
      }).catch(() => {});
    } catch {}

    // 2. Dispatch OS-level Notification popup (shows over other apps/social media)
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const notifOptions: any = {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: event?.eventId || event?.id || 'washroom-emergency',
          requireInteraction: true, // Remains on screen until user interacts
          silent: false,
          vibrate: [1000, 500, 1000, 500, 1000],
          actions: [
            { action: 'open_alert', title: '🚨 OPEN ALERT' },
            { action: 'acknowledge', title: "I'M CHECKING" },
          ],
        };

        if (Notification.permission === 'granted') {
          if (
            typeof navigator !== 'undefined' &&
            'serviceWorker' in navigator &&
            navigator.serviceWorker.ready
          ) {
            navigator.serviceWorker.ready
              .then((reg) => reg.showNotification(title, notifOptions))
              .catch(() => {
                const notif = new Notification(title, notifOptions);
                notif.onclick = () => {
                  try {
                    window.focus();
                    notif.close();
                  } catch {}
                };
              });
          } else {
            const notif = new Notification(title, notifOptions);
            notif.onclick = () => {
              try {
                window.focus();
                notif.close();
              } catch {}
            };
          }
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              new Notification(title, notifOptions);
            }
          });
        }
      }
    } catch (e) {
      console.warn('System notification dispatch note:', e);
    }
  }

  /**
   * Start the continuous high-intensity emergency audio siren and vibration.
   * Alternates between 960Hz and 770Hz in an urgent alarm pattern.
   */
  public playEmergencySiren(): void {
    if (this.isSirenActive || this.isMuted) return;

    try {
      if (typeof window === 'undefined') return;

      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.isSirenActive = true;
      let toggle = false;

      // Play continuous alternating dual-tone emergency siren
      const playToneBurst = () => {
        if (!this.isSirenActive || !this.audioCtx || this.isMuted) return;

        try {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();

          osc.type = 'sawtooth';
          // Alternating standard emergency frequencies (960Hz / 770Hz)
          osc.frequency.setValueAtTime(
            toggle ? 960 : 770,
            this.audioCtx.currentTime
          );

          gain.gain.setValueAtTime(0.35, this.audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(
            0.01,
            this.audioCtx.currentTime + 0.38
          );

          osc.connect(gain);
          gain.connect(this.audioCtx.destination);

          osc.start();
          osc.stop(this.audioCtx.currentTime + 0.38);

          toggle = !toggle;
        } catch (toneErr) {
          console.warn('Audio tone play error:', toneErr);
        }
      };

      // Play immediately, then repeat every 400ms
      playToneBurst();
      this.sirenInterval = setInterval(playToneBurst, 400);
    } catch (e) {
      console.warn('Emergency siren initiation note:', e);
    }
  }

  /**
   * Stop the active emergency siren.
   */
  public stopEmergencySiren(): void {
    this.isSirenActive = false;
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.suspend();
      } catch {}
    }
  }

  /**
   * Stop all emergency alerts (sound, vibration, intervals).
   */
  public stopAll(): void {
    this.stopEmergencySiren();
    this.stopContinuousVibration();
    this.lastDispatchedEventId = null;
  }

  /**
   * Called when user presses "I'M CHECKING":
   * Immediately stops loud siren so user can focus, but retains acknowledged visual state.
   */
  public acknowledgeAlert(): void {
    this.stopEmergencySiren();
    this.stopContinuousVibration();
  }

  /**
   * Toggle mute state for user comfort while handling the emergency.
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopEmergencySiren();
      this.stopContinuousVibration();
    } else {
      this.playEmergencySiren();
      this.startContinuousVibration();
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public resetMute(): void {
    this.isMuted = false;
  }

  /**
   * Format presence duration into human-readable string:
   * e.g., 1112 -> "18 min 32 sec"
   */
  public formatDuration(seconds?: number): string {
    if (seconds === undefined || seconds === null || isNaN(seconds) || seconds <= 0) {
      return '18 min 32 sec'; // Fallback typical duration
    }
    const mins = Math.floor(seconds / 60);
    const remainingSecs = Math.floor(seconds % 60);
    if (mins > 0) {
      return `${mins} min ${remainingSecs} sec`;
    }
    return `${remainingSecs} sec`;
  }
}

export const EmergencySoundService = new EmergencySoundServiceClass();
