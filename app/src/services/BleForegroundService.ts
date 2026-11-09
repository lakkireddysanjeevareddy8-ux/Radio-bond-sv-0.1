import { Platform } from 'react-native';
import { logger } from '../utils/logger';

class BleForegroundServiceClass {
  public static readonly CHANNEL_ID = 'ble_background_monitoring';
  public static readonly CHANNEL_NAME = 'Safety Guardian Background Service';
  public static readonly NOTIFICATION_ID = 'wsg_ble_foreground_service';

  private isChannelInitialized: boolean = false;
  private currentDeviceName: string = '';
  private isForegroundActive: boolean = false;

  /**
   * Initializes the dedicated Android low-importance notification channel
   * used exclusively for the silent, non-intrusive ongoing foreground service notification.
   */
  public async initChannel(): Promise<void> {
    if (this.isChannelInitialized || Platform.OS !== 'android') return;

    try {
      const Notifications = require('expo-notifications');
      await Notifications.setNotificationChannelAsync(BleForegroundServiceClass.CHANNEL_ID, {
        name: BleForegroundServiceClass.CHANNEL_NAME,
        importance: Notifications.AndroidImportance.LOW,
        sound: null,
        enableVibrate: false,
        enableLights: false,
        showBadge: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      this.isChannelInitialized = true;
      logger.info('BLE_FG', 'Foreground notification channel initialized');
    } catch (e: any) {
      logger.warn('BLE_FG', `Could not initialize foreground channel: ${e?.message}`);
    }
  }

  /**
   * Starts or updates the persistent ongoing foreground service notification.
   */
  public async startForegroundNotification(deviceName: string): Promise<void> {
    if (Platform.OS !== 'android') return;

    this.currentDeviceName = deviceName || 'Washroom Safety Guardian';
    this.isForegroundActive = true;

    try {
      await this.initChannel();
      const Notifications = require('expo-notifications');

      await Notifications.scheduleNotificationAsync({
        identifier: BleForegroundServiceClass.NOTIFICATION_ID,
        content: {
          title: 'Washroom Safety Active',
          body: `Connected to ${this.currentDeviceName} — 24/7 safety monitoring active`,
          sticky: true,
          autoDismiss: false,
          priority: Notifications.AndroidNotificationPriority.LOW,
          color: '#0EA5E9',
        },
        trigger: null,
      });

      logger.info('BLE_FG', `Active persistent notification posted for ${this.currentDeviceName}`);
    } catch (e: any) {
      logger.warn('BLE_FG', `Could not schedule foreground notification: ${e?.message}`);
    }
  }

  /**
   * Updates notification content during reconnect loop.
   */
  public async updateForegroundNotification(deviceName: string, isReconnecting: boolean): Promise<void> {
    if (Platform.OS !== 'android' || !this.isForegroundActive) return;

    this.currentDeviceName = deviceName || this.currentDeviceName || 'Washroom Safety Guardian';

    try {
      await this.initChannel();
      const Notifications = require('expo-notifications');

      await Notifications.scheduleNotificationAsync({
        identifier: BleForegroundServiceClass.NOTIFICATION_ID,
        content: {
          title: 'Washroom Safety Guardian',
          body: isReconnecting
            ? `Reconnecting to ${this.currentDeviceName}...`
            : `Connected to ${this.currentDeviceName} — 24/7 safety monitoring active`,
          sticky: true,
          autoDismiss: false,
          priority: Notifications.AndroidNotificationPriority.LOW,
          color: '#0EA5E9',
        },
        trigger: null,
      });
    } catch (e: any) {
      logger.warn('BLE_FG', `Could not update foreground notification: ${e?.message}`);
    }
  }

  /**
   * Dismisses the persistent ongoing notification when disconnected or idle.
   */
  public async stopForegroundNotification(): Promise<void> {
    if (Platform.OS !== 'android') return;

    this.isForegroundActive = false;

    try {
      const Notifications = require('expo-notifications');
      await Notifications.dismissNotificationAsync(BleForegroundServiceClass.NOTIFICATION_ID);
      logger.info('BLE_FG', 'Foreground persistent notification dismissed');
    } catch (e: any) {
      logger.warn('BLE_FG', `Could not dismiss foreground notification: ${e?.message}`);
    }
  }
}

export const BleForegroundService = new BleForegroundServiceClass();

