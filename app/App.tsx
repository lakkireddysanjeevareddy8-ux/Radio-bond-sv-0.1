import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { EmergencyScreen } from './src/screens/EmergencyScreen';
import { deviceService } from './src/services/DeviceCommunicationService';
import { useAppStore } from './src/store/useAppStore';
import { EmergencySoundService } from './src/services/EmergencySoundService';
import { EmergencyPushService } from './src/services/EmergencyPushService';

// Configure foreground notification behavior on native platforms
if (Platform.OS !== 'web') {
  try {
    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async (notif: any) => {
        const isEmergency =
          notif?.request?.content?.data?.type === 'WSG01_EMERGENCY' ||
          notif?.request?.content?.categoryIdentifier === 'emergency';
        return {
          shouldShowAlert: true,
          shouldPlaySound: isEmergency,
          shouldSetBadge: true,
          priority: Notifications.AndroidNotificationPriority.MAX,
        };
      },
    });
  } catch (e) {
    console.warn('[App] Notification handler init note:', e);
  }
}

export default function App() {
  const {
    initializeSupabase,
    deviceConfig,
    isSimulatorMode,
    setTelemetry,
    setActiveEmergency,
    setIsOnline,
    setVoicePrompt,
  } = useAppStore();

  useEffect(() => {
    initializeSupabase();
    // Initialize high-importance Android emergency channel and permissions
    EmergencySoundService.initEmergencyChannel();
    EmergencyPushService.setOnEmergencyReceived((event) => {
      setActiveEmergency(event);
    });

    // Native notification listeners for foreground delivery, background taps, and cold starts
    let notifSub: any;
    let responseSub: any;

    if (Platform.OS !== 'web') {
      try {
        const Notifications = require('expo-notifications');

        // 1. Foreground notification delivery listener
        notifSub = Notifications.addNotificationReceivedListener((notification: any) => {
          const data = notification?.request?.content?.data;
          if (data && (data.type === 'WSG01_EMERGENCY' || data.type === 'EMERGENCY')) {
            EmergencyPushService.handleIncomingPush(data);
          }
        });

        // 2. Notification response / tap listener (background or foreground)
        responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
          const data = response?.notification?.request?.content?.data;
          if (data && (data.type === 'WSG01_EMERGENCY' || data.type === 'EMERGENCY')) {
            EmergencyPushService.handleIncomingPush(data);
          }
        });

        // 3. Cold start from notification tap (app opened from killed state)
        Notifications.getLastNotificationResponseAsync()
          .then((lastResponse: any) => {
            const data = lastResponse?.notification?.request?.content?.data;
            if (data && (data.type === 'WSG01_EMERGENCY' || data.type === 'EMERGENCY')) {
              EmergencyPushService.handleIncomingPush(data);
            }
          })
          .catch(() => {});
      } catch (nativeErr) {
        console.warn('[App] Native notification listener setup note:', nativeErr);
      }
    }

    return () => {
      if (notifSub && typeof notifSub.remove === 'function') notifSub.remove();
      if (responseSub && typeof responseSub.remove === 'function') responseSub.remove();
    };
  }, []);

  useEffect(() => {
    if (deviceConfig) {
      deviceService.setCallbacks(
        (telemetry) => {
          setTelemetry(telemetry);
        },
        (event) => {
          setActiveEmergency(event);
        },
        (status) => {
          setIsOnline(status === 'CONNECTED');
        },
        (message) => {
          setVoicePrompt(message);
          // Auto clear voice prompt after 5 seconds
          setTimeout(() => setVoicePrompt(null), 5000);
        },
        () => {
          // Emergency resolved / person left
          setActiveEmergency(null);
        }
      );

      if (isSimulatorMode) {
        deviceService.connectToDemoDevice(deviceConfig);
      } else {
        deviceService.connectToSupabaseDevice(deviceConfig.deviceId);
      }
    }

    return () => {
      deviceService.disconnect();
    };
  }, [deviceConfig?.deviceId, isSimulatorMode]);

  return (
    <>
      <StatusBar style="auto" />
      <AppNavigator />
      <EmergencyScreen />
    </>
  );
}
