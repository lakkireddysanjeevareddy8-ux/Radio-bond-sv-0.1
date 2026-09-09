import { Platform, PermissionsAndroid, Linking } from 'react-native';
import { EmergencySoundService } from './EmergencySoundService';

export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'unsupported';

export interface SafetyPermissionsReport {
  bluetooth: PermissionStatus;
  notifications: PermissionStatus;
  emergencyAudio: PermissionStatus;
  backgroundAlerts: PermissionStatus;
  allEssentialGranted: boolean;
}

class PermissionServiceClass {
  /**
   * Check Bluetooth permissions (Scan & Connect on Android 12+, Location on older Android, Web Bluetooth on Web)
   */
  public async checkBluetoothPermission(): Promise<PermissionStatus> {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
        return 'granted';
      }
      return 'unsupported';
    }

    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      if (typeof apiLevel === 'number' && apiLevel >= 31) {
        try {
          const scanGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
          );
          const connectGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          );
          return scanGranted && connectGranted ? 'granted' : 'denied';
        } catch {
          return 'denied';
        }
      } else {
        try {
          const locGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          return locGranted ? 'granted' : 'denied';
        } catch {
          return 'denied';
        }
      }
    }

    if (Platform.OS === 'ios') {
      return 'granted';
    }

    return 'unsupported';
  }

  /**
   * Request Bluetooth permissions and re-evaluate real state
   */
  public async requestBluetoothPermission(): Promise<PermissionStatus> {
    if (Platform.OS === 'web') {
      return this.checkBluetoothPermission();
    }

    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      try {
        if (typeof apiLevel === 'number' && apiLevel >= 31) {
          const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]);

          const scanResult = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN];
          const connectResult = results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];

          if (
            scanResult === PermissionsAndroid.RESULTS.GRANTED &&
            connectResult === PermissionsAndroid.RESULTS.GRANTED
          ) {
            return 'granted';
          }
          if (
            scanResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
            connectResult === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          ) {
            return 'blocked';
          }
          return 'denied';
        } else {
          const res = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (res === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
          if (res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
          return 'denied';
        }
      } catch (err) {
        console.warn('Bluetooth permission request note:', err);
        return 'denied';
      }
    }

    return this.checkBluetoothPermission();
  }

  /**
   * Check OS Notification permissions
   */
  public async checkNotificationPermission(): Promise<PermissionStatus> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted') return 'granted';
        if (Notification.permission === 'denied') return 'blocked';
        return 'denied';
      }
      return 'unsupported';
    }

    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      // Android 13+ (API 33+) requires runtime POST_NOTIFICATIONS
      if (typeof apiLevel === 'number' && apiLevel >= 33) {
        try {
          const postNotif = 'android.permission.POST_NOTIFICATIONS' as any;
          const granted = await PermissionsAndroid.check(postNotif);
          return granted ? 'granted' : 'denied';
        } catch {
          return 'denied';
        }
      }
      // On older Android, notification permission is granted on install
      return 'granted';
    }

    return 'granted';
  }

  /**
   * Request Notification permission and re-evaluate real state
   */
  public async requestNotificationPermission(): Promise<PermissionStatus> {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        try {
          const res = await Notification.requestPermission();
          if (res === 'granted') return 'granted';
          if (res === 'denied') return 'blocked';
          return 'denied';
        } catch {
          return 'denied';
        }
      }
      return 'unsupported';
    }

    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version;
      if (typeof apiLevel === 'number' && apiLevel >= 33) {
        try {
          const postNotif = 'android.permission.POST_NOTIFICATIONS' as any;
          const res = await PermissionsAndroid.request(postNotif);
          if (res === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
          if (res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
          return 'denied';
        } catch {
          return 'denied';
        }
      }
      return 'granted';
    }

    return this.checkNotificationPermission();
  }

  /**
   * Check Emergency Audio & Siren Capability
   */
  public async checkEmergencyAudio(): Promise<PermissionStatus> {
    if (Platform.OS === 'web') {
      // In browsers, AudioContext might need user activation
      if (typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        return AudioCtx ? 'granted' : 'unsupported';
      }
      return 'unsupported';
    }
    return 'granted';
  }

  /**
   * Request and unlock Emergency Audio (plays 200ms confirmation chime and unlocks AudioContext)
   */
  public async unlockEmergencyAudio(): Promise<PermissionStatus> {
    try {
      const unlocked = await EmergencySoundService.unlockAndTestAudio();
      EmergencySoundService.testVibration();
      return unlocked ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  /**
   * Check Background Alerts & Full-screen Intent Capability
   */
  public async checkBackgroundAlerts(): Promise<PermissionStatus> {
    // Android declared WAKE_LOCK, VIBRATE, USE_FULL_SCREEN_INTENT in app.json
    if (Platform.OS === 'android') {
      return 'granted';
    }
    if (Platform.OS === 'web') {
      return 'granted';
    }
    return 'granted';
  }

  /**
   * Open OS System Settings for WSG-01 app
   */
  public async openSettings(): Promise<void> {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else if (Platform.OS === 'android') {
        await Linking.openSettings();
      } else {
        // Web: instructions
        alert('Please allow permissions in your browser address bar (lock/settings icon).');
      }
    } catch (e) {
      console.warn('Open settings error:', e);
    }
  }

  /**
   * Comprehensive Audit of all Permissions
   */
  public async checkAllPermissions(): Promise<SafetyPermissionsReport> {
    const [bt, notif, audio, bg] = await Promise.all([
      this.checkBluetoothPermission(),
      this.checkNotificationPermission(),
      this.checkEmergencyAudio(),
      this.checkBackgroundAlerts(),
    ]);

    const allEssentialGranted =
      bt !== 'denied' &&
      bt !== 'blocked' &&
      notif !== 'denied' &&
      notif !== 'blocked';

    return {
      bluetooth: bt,
      notifications: notif,
      emergencyAudio: audio,
      backgroundAlerts: bg,
      allEssentialGranted,
    };
  }
}

export const PermissionService = new PermissionServiceClass();
