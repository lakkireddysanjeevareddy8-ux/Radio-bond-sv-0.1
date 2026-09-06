import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { deviceService } from './src/services/DeviceCommunicationService';
import { useAppStore } from './src/store/useAppStore';

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
    </>
  );
}
