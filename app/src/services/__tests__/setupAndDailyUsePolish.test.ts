import React from 'react';
import { strings } from '../../constants/strings';

describe('Setup and Daily-Use Polish', () => {
  describe('Centralized Strings Dictionary (strings.ts)', () => {
    it('defines all required onboarding step labels', () => {
      expect(strings.onboarding.steps.bluetooth).toBe('Bluetooth');
      expect(strings.onboarding.steps.findDevice).toBe('Find Device');
      expect(strings.onboarding.steps.wifi).toBe('Wi-Fi');
      expect(strings.onboarding.steps.verify).toBe('Verify');
      expect(strings.onboarding.steps.done).toBe('Done');
    });

    it('contains specific friendly error messages with "what to do" guidance for all required failure types', () => {
      const requiredErrors = [
        'wrongPassword',
        'fiveGhzNetwork',
        'deviceNotFound',
        'bluetoothOff',
        'permissionDenied',
        'deviceOutOfRange',
        'hotspotWpa3',
        'wifiTimeout',
        'authRateLimited',
        'deviceNotResponding',
        'generalError',
      ] as const;

      for (const errKey of requiredErrors) {
        const err = strings.errors[errKey];
        expect(err).toBeDefined();
        expect(err.title).toBeTruthy();
        expect(err.description).toBeTruthy();
        expect(err.whatToDo).toBeTruthy();
        expect(err.action).toBeTruthy();
      }
    });

    it('provides clear guidance for 5 GHz network failure', () => {
      const err = strings.errors.fiveGhzNetwork;
      expect(err.title).toContain('5 GHz');
      expect(err.description).toContain('2.4 GHz');
      expect(err.whatToDo).toContain('2.4 GHz');
    });

    it('provides clear guidance for wrong password failure', () => {
      const err = strings.errors.wrongPassword;
      expect(err.title).toContain('Password');
      expect(err.whatToDo).toContain('password');
    });

    it('provides clear guidance for WPA3 hotspot failure', () => {
      const err = strings.errors.hotspotWpa3;
      expect(err.title).toContain('WPA3');
      expect(err.whatToDo).toContain('WPA2-Personal');
    });

    it('defines comprehensive troubleshooting guide items', () => {
      expect(strings.troubleshooting.items.length).toBeGreaterThanOrEqual(5);
      const ids = strings.troubleshooting.items.map((i) => i.id);
      expect(ids).toContain('device_not_found');
      expect(ids).toContain('wifi_wont_connect');
      expect(ids).toContain('background_disconnects');
      expect(ids).toContain('radar_fault');
      expect(ids).toContain('emergency_button');
    });

    it('defines about device metadata labels', () => {
      expect(strings.aboutDevice.deviceModel).toBeTruthy();
      expect(strings.aboutDevice.connectionState).toBeTruthy();
      expect(strings.aboutDevice.wifiNetwork).toBeTruthy();
      expect(strings.aboutDevice.signalStrength).toBeTruthy();
      expect(strings.aboutDevice.firmwareVersion).toBeTruthy();
      expect(strings.aboutDevice.protocolVersion).toBeTruthy();
      expect(strings.aboutDevice.uptime).toBeTruthy();
    });
  });
});

