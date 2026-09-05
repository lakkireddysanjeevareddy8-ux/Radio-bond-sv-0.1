import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { deviceService } from './src/services/DeviceCommunicationService';
import { useAppStore } from './src/store/useAppStore';

export default function App() {
  const { initializeSupabase, deviceConfig, setTelemetry, setActiveEmergency, setIsOnline, setVoicePrompt } = useAppStore();
  useEffect(() => {
    initializeSupabase();
  }, []);

  useEffect(() => {
    // Initialize the device simulator connection on app startup for Demo Mode
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
          // Auto clear voice prompt after 5 seconds in demo
          setTimeout(() => setVoicePrompt(null), 5000);
        }
      );

      deviceService.connectToDemoDevice(deviceConfig);
    }

    return () => {
      deviceService.disconnect();
    };
  }, [deviceConfig]);

  return (
    <>
      <StatusBar style="auto" />
      <AppNavigator />
    </>
  );
}
