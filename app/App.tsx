import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { EmergencyScreen } from './src/screens/EmergencyScreen';
import { deviceService } from './src/services/DeviceCommunicationService';
import { useAppStore } from './src/store/useAppStore';
import { EmergencySoundService } from './src/services/EmergencySoundService';
import { EmergencyPushService } from './src/services/EmergencyPushService';

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
