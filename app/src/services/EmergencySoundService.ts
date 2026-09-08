import { Platform, Vibration } from 'react-native';

class EmergencySoundServiceClass {
  private audioCtx: AudioContext | null = null;
  private isSirenActive: boolean = false;
  private isVibrating: boolean = false;
  private sirenInterval: any = null;
  private vibrationInterval: any = null;
  private isMuted: boolean = false;

  constructor() {
    this.requestNotificationPermission();
  }

  /**
   * Request browser system-level Notification permission so pop-ups
   * appear outside the browser (over social media, home screen, or calls).
   */
  public async requestNotificationPermission(): Promise<boolean> {
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

  /**
   * Start continuous looping vibration until explicitly stopped.
   * Works on mobile browsers (navigator.vibrate) and native (Vibration.vibrate with repeat).
   */
  public startContinuousVibration(): void {
    if (this.isVibrating) return;
    this.isVibrating = true;

    // 1. Native React Native looping vibration
    try {
      // Pass repeat=true on native platforms
      Vibration.vibrate([0, 1000, 400, 1000, 400], true);
    } catch {}

    // 2. Web / Browser looping vibration via navigator.vibrate
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        const triggerWebPulse = () => {
          if (!this.isVibrating) return;
          try {
            navigator.vibrate([1000, 400, 1000, 400]);
          } catch {}
        };

        triggerWebPulse();
        if (this.vibrationInterval) clearInterval(this.vibrationInterval);
        this.vibrationInterval = setInterval(triggerWebPulse, 2800);
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

    // Clear interval on web
    if (this.vibrationInterval) {
      clearInterval(this.vibrationInterval);
      this.vibrationInterval = null;
    }

    // Cancel native vibration
    try {
      Vibration.cancel();
    } catch {}

    // Cancel web vibration
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
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([200, 100, 200]);
        return true;
      }
      Vibration.vibrate([0, 200, 100, 200]);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Dispatch an OS-level notification popup that appears
   * on top of desktop, rest, social media, or other apps.
   */
  public sendSystemNotification(
    title: string,
    body: string,
    trigger: string = 'EMERGENCY'
  ): void {
    // 1. Dispatch to Windows Bridge to bring browser to front & trigger system alert sound
    try {
      fetch('http://127.0.0.1:5005/emergency-popup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, trigger }),
      }).catch(() => {});
    } catch {}

    // 2. Dispatch OS-level Notification popup (shows over other apps/social media)
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const notifOptions = {
          body,
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          tag: 'washroom-emergency',
          requireInteraction: true, // Remains on screen until user interacts!
          silent: false,
        };

        if (Notification.permission === 'granted') {
          if (
            typeof navigator !== 'undefined' &&
            'serviceWorker' in navigator &&
            navigator.serviceWorker.ready
          ) {
            navigator.serviceWorker.ready
              .then((reg) => reg.showNotification(title, notifOptions as any))
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

    // 3. Ensure continuous vibration starts along with the system alert
    this.startContinuousVibration();
  }

  /**
   * Start the continuous high-intensity emergency audio siren and vibration.
   * Alternates between 960Hz and 770Hz in an urgent alarm pattern.
   */
  public playEmergencySiren(): void {
    // Start continuous vibration alongside audio siren
    this.startContinuousVibration();

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

          gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
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
   * Stop the active emergency siren and vibration.
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
    this.stopContinuousVibration();
  }

  /**
   * Stop all emergency alerts (sound, vibration, intervals).
   */
  public stopAll(): void {
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
      // Keep or toggle vibration as well
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
}

export const EmergencySoundService = new EmergencySoundServiceClass();
