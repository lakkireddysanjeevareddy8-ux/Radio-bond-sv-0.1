import { Platform, Vibration } from 'react-native';

class EmergencySoundServiceClass {
  private audioCtx: AudioContext | null = null;
  private isSirenActive: boolean = false;
  private sirenInterval: any = null;
  private isMuted: boolean = false;

  constructor() {
    // Attempt permission request on startup if supported
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
   * Dispatch an OS-level notification popup that appears
   * on top of desktop, rest, social media, or other apps.
   */
  public sendSystemNotification(
    title: string,
    body: string,
    trigger: string = 'EMERGENCY'
  ): void {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          const notif = new Notification(title, {
            body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: 'washroom-emergency',
            requireInteraction: true, // Remains on screen until user interacts!
            silent: false,
          });

          notif.onclick = () => {
            try {
              window.focus();
              notif.close();
            } catch {}
          };
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().then((perm) => {
            if (perm === 'granted') {
              new Notification(title, {
                body,
                tag: 'washroom-emergency',
                requireInteraction: true,
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn('System notification dispatch note:', e);
    }

    // Also trigger mobile device vibration
    try {
      Vibration.vibrate([0, 1000, 400, 1000, 400, 1000]);
    } catch {}
  }

  /**
   * Start the continuous high-intensity emergency audio siren.
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
          // Alternating American/European standard emergency frequencies (960Hz / 770Hz)
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
   * Toggle mute state for user comfort while handling the emergency.
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopEmergencySiren();
    } else {
      this.playEmergencySiren();
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
