import { WifiStepStateMachine, WifiNetworkItem } from '../wifiStepLogic';

describe('WifiStepStateMachine', () => {
  let stateMachine: WifiStepStateMachine;
  let sentCommands: any[];
  let nextStepCalledWith: any[];

  beforeEach(() => {
    jest.useFakeTimers();
    sentCommands = [];
    nextStepCalledWith = [];

    stateMachine = new WifiStepStateMachine({
      sendCommand: async (cmd) => {
        sentCommands.push(cmd);
      },
      onAdvanceToNextStep: (ssid, ip, rssi) => {
        nextStepCalledWith.push({ ssid, ip, rssi });
      },
    });
  });

  afterEach(() => {
    stateMachine.dispose();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Scenario 1: CONNECTED on entry', () => {
    it('sends GET_STATUS, handles CONNECTED reply, skips form, and auto-advances', () => {
      stateMachine.start();

      expect(sentCommands).toEqual([{ cmd: 'GET_STATUS' }]);
      expect(stateMachine.getState().subState).toBe('CHECKING_STATUS');

      // Device notifies CONNECTED
      stateMachine.handleNotification({
        type: 'WIFI_STATUS',
        status: 'CONNECTED',
        ssid: 'Home_WiFi_5G',
        ip: '192.168.1.55',
        rssi: -48,
      });

      const state = stateMachine.getState();
      expect(state.subState).toBe('ALREADY_CONNECTED');
      expect(state.connectedSsid).toBe('Home_WiFi_5G');
      expect(state.assignedIp).toBe('192.168.1.55');
      expect(state.rssi).toBe(-48);

      // Auto-advance has not fired yet (2.5s timer)
      expect(nextStepCalledWith.length).toBe(0);

      // Fast-forward 2.5s
      jest.advanceTimersByTime(2500);

      expect(nextStepCalledWith).toEqual([
        { ssid: 'Home_WiFi_5G', ip: '192.168.1.55', rssi: -48 },
      ]);
    });
  });

  describe('Scenario 2: DISCONNECTED with saved network (saved-but-unreachable)', () => {
    it('enters RECONNECTING, polls every 3s, and on 20s timeout falls back to FORM with error and scan', () => {
      stateMachine.start();
      expect(sentCommands).toEqual([{ cmd: 'GET_STATUS' }]);

      // Device notifies DISCONNECTED with saved network
      stateMachine.handleNotification({
        type: 'WIFI_STATUS',
        status: 'DISCONNECTED',
        saved: 'Guest_Office_2.4G',
      });

      expect(stateMachine.getState().subState).toBe('RECONNECTING');
      expect(stateMachine.getState().savedSsid).toBe('Guest_Office_2.4G');

      // Polls GET_STATUS at 3s intervals
      jest.advanceTimersByTime(3000);
      expect(sentCommands.length).toBe(2);
      expect(sentCommands[1]).toEqual({ cmd: 'GET_STATUS' });
      expect(stateMachine.getState().reconnectElapsed).toBe(3);

      jest.advanceTimersByTime(3000);
      expect(sentCommands.length).toBe(3);
      expect(stateMachine.getState().reconnectElapsed).toBe(6);

      // Advance to 20s timeout
      jest.advanceTimersByTime(14000);

      const state = stateMachine.getState();
      expect(state.subState).toBe('FORM');
      expect(state.wifiSsid).toBe('Guest_Office_2.4G');
      expect(state.errorMessage).toContain('Saved network "Guest_Office_2.4G" could not be reached.');
      // Initiates SCAN_WIFI
      expect(sentCommands).toContainEqual({ cmd: 'SCAN_WIFI' });
      expect(state.isScanning).toBe(true);
    });

    it('successfully connects during the reconnect polling window', () => {
      stateMachine.start();

      stateMachine.handleNotification({
        type: 'WIFI_STATUS',
        status: 'DISCONNECTED',
        saved: 'Workplace_WiFi',
      });

      expect(stateMachine.getState().subState).toBe('RECONNECTING');

      // Device connects at 6 seconds
      jest.advanceTimersByTime(6000);
      stateMachine.handleNotification({
        type: 'WIFI_STATUS',
        status: 'CONNECTED',
        ssid: 'Workplace_WiFi',
        ip: '10.0.0.12',
        rssi: -62,
      });

      expect(stateMachine.getState().subState).toBe('ALREADY_CONNECTED');
      expect(stateMachine.getState().connectedSsid).toBe('Workplace_WiFi');

      jest.advanceTimersByTime(2500);
      expect(nextStepCalledWith).toEqual([
        { ssid: 'Workplace_WiFi', ip: '10.0.0.12', rssi: -62 },
      ]);
    });
  });

  describe('Scenario 3: DISCONNECTED with no saved network', () => {
    it('immediately transitions to FORM and starts SCAN_WIFI', () => {
      stateMachine.start();
      expect(stateMachine.getState().subState).toBe('CHECKING_STATUS');

      stateMachine.handleNotification({
        type: 'WIFI_STATUS',
        status: 'DISCONNECTED',
        saved: '',
      });

      const state = stateMachine.getState();
      expect(state.subState).toBe('FORM');
      expect(state.isScanning).toBe(true);
      expect(sentCommands).toEqual([
        { cmd: 'GET_STATUS' },
        { cmd: 'SCAN_WIFI' },
      ]);
    });

    it('handles DISCONNECTED with missing saved field identically', () => {
      stateMachine.start();

      stateMachine.handleNotification({
        type: 'WIFI_STATUS',
        status: 'DISCONNECTED',
      });

      expect(stateMachine.getState().subState).toBe('FORM');
      expect(sentCommands).toEqual([
        { cmd: 'GET_STATUS' },
        { cmd: 'SCAN_WIFI' },
      ]);
    });
  });

  describe('Scenario 4: 3-second GET_STATUS timeout with no reply', () => {
    it('falls back to FORM and starts scan after 3s', () => {
      stateMachine.start();
      expect(stateMachine.getState().subState).toBe('CHECKING_STATUS');

      // No response received for 3 seconds
      jest.advanceTimersByTime(3000);

      const state = stateMachine.getState();
      expect(state.subState).toBe('FORM');
      expect(state.isScanning).toBe(true);
      expect(sentCommands).toContainEqual({ cmd: 'SCAN_WIFI' });
    });
  });

  describe('Scenario 5: User taps Forget network / Use different network', () => {
    it('issues FORGET_WIFI, clears state, and starts scan', async () => {
      stateMachine.start();
      stateMachine.handleNotification({
        type: 'WIFI_STATUS',
        status: 'DISCONNECTED',
        saved: 'Old_Router',
      });

      expect(stateMachine.getState().subState).toBe('RECONNECTING');

      await stateMachine.useDifferentNetwork();

      expect(sentCommands).toContainEqual({ cmd: 'FORGET_WIFI' });
      expect(sentCommands).toContainEqual({ cmd: 'SCAN_WIFI' });

      const state = stateMachine.getState();
      expect(state.subState).toBe('FORM');
      expect(state.savedSsid).toBe('');
      expect(state.wifiSsid).toBe('');
      expect(state.wifiPass).toBe('');
    });
  });

  describe('Scenario 6: Wi-Fi network scanning and deduplication', () => {
    it('accumulates, updates and sorts scanned networks by RSSI', () => {
      stateMachine.start();
      stateMachine.handleNotification({ type: 'WIFI_STATUS', status: 'DISCONNECTED' });

      stateMachine.handleNotification({ type: 'WIFI_SCAN', status: 'SCANNING' });
      expect(stateMachine.getState().isScanning).toBe(true);

      stateMachine.handleNotification({ type: 'WIFI_NET', ssid: 'NetA', rssi: -75, sec: 1 });
      stateMachine.handleNotification({ type: 'WIFI_NET', ssid: 'NetB', rssi: -50, sec: 1 });
      // Duplicate update for NetA with stronger signal
      stateMachine.handleNotification({ type: 'WIFI_NET', ssid: 'NetA', rssi: -45, sec: 1 });

      const networks = stateMachine.getState().networks;
      expect(networks.length).toBe(2);
      expect(networks[0]).toEqual({ ssid: 'NetA', rssi: -45, sec: 1 });
      expect(networks[1]).toEqual({ ssid: 'NetB', rssi: -50, sec: 1 });

      stateMachine.handleNotification({ type: 'WIFI_SCAN', status: 'DONE', count: 2 });
      expect(stateMachine.getState().isScanning).toBe(false);
    });
  });

  describe('Scenario 7: Outdated firmware protocol', () => {
    it('transitions to WIFI_FAILED with update needed message', () => {
      stateMachine.start();

      stateMachine.handleNotification({
        type: 'WIFI_STATUS',
        protocol: 0,
        fw: '0.9.0',
      });

      const state = stateMachine.getState();
      expect(state.subState).toBe('WIFI_FAILED');
      expect(state.errorMessage).toBe('Device firmware update needed');
    });
  });
});

