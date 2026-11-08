import { AppState, Platform } from 'react-native';
import { BluetoothService, ConnectedBleSession, DiscoveredBleDevice } from './bluetoothService';
import { NativeBluetoothService } from './nativeBluetoothService';
import {
  useConnectionStore,
  ConnectedDeviceInfo,
  ConnectionManagerState,
} from '../store/useConnectionStore';
import { useAppStore } from '../store/useAppStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { storage } from '../utils/storage';
import { logger } from '../utils/logger';
import { PRODUCT_CATALOG } from './productCatalog';

export type { ConnectionManagerState };

export type ConnectionManagerListener = (
  state: ConnectionManagerState,
  reason: string
) => void;

class ConnectionManagerClass {
  private state: ConnectionManagerState = 'IDLE';
  private connectedDevice: ConnectedDeviceInfo | null = null;
  private lastConnectedDevice: ConnectedDeviceInfo | null = null;
  private activeSession: ConnectedBleSession | null = null;

  // Auto-reconnect state
  private reconnectAttempt: number = 0;
  private reconnectTimer: any = null;
  private slowRetryTimer: any = null;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private isManualDisconnect: boolean = false;

  // Guard against double connects
  private inFlightConnectPromise: Promise<ConnectedBleSession> | null = null;

  // Listeners
  private listeners: Set<ConnectionManagerListener> = new Set();
  private isInitialized: boolean = false;

  /**
   * Calculates the exponential backoff delay in seconds:
   * 1, 2, 4, 8, 16, 30, 30... (capped at 30s)
   */
  public getBackoffDelay(attempt: number): number {
    return Math.min(30, Math.pow(2, Math.max(0, attempt - 1)));
  }

  /**
   * Initializes ConnectionManager once on application startup.
   * Wires Bluetooth adapter state transitions and AppState background/foreground resume.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    logger.info('CONN_MGR', 'Initializing ConnectionManager singleton');
    console.log('[ConnectionManager] Initializing...');

    // 1. Load manual disconnect flag from persistent storage
    try {
      const manual = await storage.getJSON<boolean>('wsg_manual_disconnect', false);
      this.isManualDisconnect = Boolean(manual);
    } catch (e) {
      console.warn('[ConnectionManager] Could not read manual disconnect flag:', e);
    }

    // 2. Load last connected device metadata from persistent storage
    try {
      const lastMeta = await storage.getJSON<ConnectedDeviceInfo>(
        'wsg_last_connected_device_meta',
        null as any
      );
      if (lastMeta) {
        this.lastConnectedDevice = lastMeta;
        useConnectionStore.setState({ lastConnectedDeviceId: lastMeta.id });
      }
    } catch (e) {
      console.warn('[ConnectionManager] Could not read last connected device:', e);
    }

    // 3. Make ONE background reconnect attempt on startup if Bluetooth is ON and not manually disconnected
    if (!this.isManualDisconnect && this.lastConnectedDevice?.id) {
      const target = this.lastConnectedDevice;
      BluetoothService.isBluetoothAvailable()
        .then((btOn) => {
          if (btOn && this.state === 'IDLE') {
            logger.info('CONN_MGR', `Background startup reconnect to ${target.id}`);
            this.connect(target, { isReconnect: true }).catch((err) => {
              logger.info('CONN_MGR', `Startup background reconnect quiet exit: ${err.message}`);
              if (this.state === 'RECONNECTING' || this.state === 'CONNECTING') {
                this.transitionTo('IDLE', 'Startup background reconnect completed without connection');
              }
            });
          }
        })
        .catch(() => {});
    }

    // 4. Wire Bluetooth adapter state listener
    BluetoothService.addBluetoothStateListener((adapterState) => {
      console.log('[ConnectionManager] Bluetooth adapter state changed to:', adapterState);
      if (adapterState === 'off') {
        this.cancelReconnectTimer();
        this.cancelSlowRetryTimer();
        this.transitionTo('BLUETOOTH_OFF', 'Bluetooth adapter turned off');
      } else if (adapterState === 'on') {
        if (this.state === 'BLUETOOTH_OFF') {
          const target = this.connectedDevice || this.lastConnectedDevice;
          if (target && target.id && !this.isManualDisconnect) {
            logger.info('CONN_MGR', `Bluetooth turned back on. Auto-reconnecting to ${target.id}`);
            this.reconnectAttempt = 0;
            this.startAutoReconnect('Bluetooth adapter turned back on');
          } else {
            this.transitionTo('IDLE', 'Bluetooth turned on, no target device');
          }
        }
      }
    });

    // 5. Wire AppState resume listener
    AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        logger.info('CONN_MGR', 'App resumed to foreground: checking BLE connection health');
        console.log('[ConnectionManager] App resumed to foreground');

        const activeDev = this.connectedDevice || this.lastConnectedDevice;
        if (!activeDev || !activeDev.id) return;

        if (this.state === 'CONNECTED') {
          const isAlive = await this.isDeviceConnected(activeDev.id);
          if (isAlive) {
            logger.info('CONN_MGR', `Connection confirmed alive for ${activeDev.id}, refreshing monitors`);
            console.log('[ConnectionManager] App active: connection verified alive, re-attaching monitors');
            const session = this.activeSession || BluetoothService.getActiveSession();
            if (session) {
              this.activeSession = session;
              BluetoothService.startDeviceEventMonitoring(session);
            }
          } else {
            logger.warn('CONN_MGR', `Connection dropped while in background for ${activeDev.id}`);
            console.log('[ConnectionManager] Connection dropped while backgrounded: starting auto-reconnect');
            this.handleBleDisconnect(activeDev.id, 'Connection lost while backgrounded');
          }
        } else if (this.state === 'FAILED') {
          // Trigger one immediate retry on AppState 'active' when state is FAILED
          if (!this.isManualDisconnect) {
            logger.info('CONN_MGR', 'AppState active: triggering immediate retry from FAILED state');
            this.cancelSlowRetryTimer();
            this.executeForegroundRetry('AppState active immediate retry');
          }
        } else if (this.state === 'RECONNECTING') {
          const isAlive = await this.isDeviceConnected(activeDev.id);
          if (isAlive) {
            logger.info('CONN_MGR', 'Device reconnected in background, marking CONNECTED');
            const session = this.activeSession || BluetoothService.getActiveSession();
            if (session) {
              this.activeSession = session;
              BluetoothService.startDeviceEventMonitoring(session);
            }
            this.transitionTo('CONNECTED', 'Verified connection on foreground resume');
          }
        }
      } else {
        // App backgrounded: pause slow retries
        this.cancelSlowRetryTimer();
      }
    });
  }

  /**
   * Returns current connection state machine state.
   */
  public getState(): ConnectionManagerState {
    return this.state;
  }

  /**
   * Returns currently active connected device info.
   */
  public getConnectedDevice(): ConnectedDeviceInfo | null {
    return this.connectedDevice;
  }

  /**
   * Returns currently active BLE session.
   */
  public getActiveSession(): ConnectedBleSession | null {
    return this.activeSession;
  }

  /**
   * Subscribes to connection state machine transitions.
   */
  public subscribe(listener: ConnectionManagerListener): () => void {
    this.listeners.add(listener);
    try {
      listener(this.state, 'Initial subscription');
    } catch {}
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Primary entry point for establishing a BLE connection.
   * Guarded against double connects and concurrent connection attempts.
   */
  public async connect(
    device: DiscoveredBleDevice | ConnectedDeviceInfo,
    options?: { isReconnect?: boolean }
  ): Promise<ConnectedBleSession> {
    const devId = device.id;
    const devName = device.name || 'WSG-01 Device';

    // 1. Guard against double connect if already connected to this exact device
    if (this.state === 'CONNECTED' && this.connectedDevice?.id === devId) {
      const isAlive = await this.isDeviceConnected(devId);
      if (isAlive && this.activeSession) {
        logger.info('CONN_MGR', `Already connected to "${devName}" (${devId}), returning active session`);
        console.log(`[ConnectionManager] Already connected to "${devName}" (${devId})`);
        return this.activeSession;
      }
    }

    // 2. Guard against concurrent in-flight connection operations
    if (this.inFlightConnectPromise) {
      logger.info('CONN_MGR', `Connection handshake already in-flight, awaiting completion for ${devId}`);
      console.log(`[ConnectionManager] Awaiting existing in-flight connection promise for ${devId}`);
      return await this.inFlightConnectPromise;
    }

    if (!options?.isReconnect) {
      this.isManualDisconnect = false;
      storage.setJSON('wsg_manual_disconnect', false).catch(() => {});
      this.cancelReconnectTimer();
      this.cancelSlowRetryTimer();
      this.reconnectAttempt = 0;
    }

    this.inFlightConnectPromise = (async () => {
      // 3. Verify Bluetooth is turned on
      const btAvailable = await BluetoothService.isBluetoothAvailable();
      if (!btAvailable) {
        this.transitionTo('BLUETOOTH_OFF', 'Cannot connect: Bluetooth is turned off');
        throw new Error('BLUETOOTH_DISABLED');
      }

      const nextState: ConnectionManagerState = options?.isReconnect ? 'RECONNECTING' : 'CONNECTING';
      this.transitionTo(nextState, `Connecting to "${devName}" (${devId})`);

      try {
        const session = await this.executeConnect(device, options);
        return session;
      } catch (err: any) {
        logger.error('CONN_MGR', `Connection failed for ${devId}`, logger.serializeError(err));
        if (!options?.isReconnect) {
          this.transitionTo('FAILED', err.message || 'Connection failed');
        }
        throw err;
      } finally {
        this.inFlightConnectPromise = null;
      }
    })();

    return await this.inFlightConnectPromise;
  }

  /**
   * Internal connection execution logic.
   */
  private async executeConnect(
    device: DiscoveredBleDevice | ConnectedDeviceInfo,
    options?: { isReconnect?: boolean }
  ): Promise<ConnectedBleSession> {
    const devId = device.id;
    const devName = device.name || 'WSG-01 Device';

    // Clean up any other open session if switching to another device
    if (this.activeSession && this.activeSession.device?.id !== devId) {
      try {
        await this.cancelDeviceConnection(this.activeSession.device.id);
      } catch {}
    }

    let session: ConnectedBleSession;

    // Check whether device has a usable rawDevice instance (e.g. not loaded from storage)
    const hasUsableRawDevice = Boolean(
      device.rawDevice &&
      (Platform.OS === 'web' ? Boolean(device.rawDevice.gatt) : true)
    );

    if (!hasUsableRawDevice) {
      // Connect by ID using NativeBluetoothService.reconnectOrScan
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        const nativeSession = await NativeBluetoothService.reconnectOrScan(devId);
        session = nativeSession as unknown as ConnectedBleSession;
      } else {
        session = await BluetoothService.connectGatt({
          id: devId,
          name: devName,
          rssi: device.rssi ?? -60,
          rawDevice: device.rawDevice,
          product: PRODUCT_CATALOG[0],
          isNative: false,
        });
      }
    } else {
      if ('product' in device && (device as any).product) {
        session = await BluetoothService.connectGatt(device as DiscoveredBleDevice);
      } else {
        const defaultProduct = PRODUCT_CATALOG.find((p) => p.id === 'wsg-01') || PRODUCT_CATALOG[0];
        const discovered: DiscoveredBleDevice = {
          id: devId,
          name: devName,
          rssi: device.rssi ?? -60,
          rawDevice: device.rawDevice,
          product: defaultProduct,
          isNative: Platform.OS === 'android' || Platform.OS === 'ios',
        };
        session = await BluetoothService.connectGatt(discovered);
      }
    }

    this.activeSession = session;

    // Attach disconnect listener guarded against duplicate registration
    this.attachDisconnectListener(session);

    // Build connected device model keeping live rawDevice ONLY in memory
    const connInfo: ConnectedDeviceInfo = {
      id: devId,
      name: devName,
      connectionType: 'BLE',
      model: ('model' in device && device.model) ? device.model : 'WSG-01',
      room: ('room' in device && device.room) ? device.room : 'Master Washroom',
      rssi: device.rssi,
      rawDevice: session.server,
      ssid: ('ssid' in device && device.ssid) ? device.ssid : undefined,
      ipAddress: ('ipAddress' in device && device.ipAddress) ? device.ipAddress : undefined,
    };

    this.connectedDevice = connInfo;
    this.lastConnectedDevice = connInfo;

    // Strip rawDevice/server and persist ONLY serializable plain fields
    const metaToPersist = {
      id: devId,
      name: devName,
      connectionType: connInfo.connectionType || 'BLE',
      model: connInfo.model || 'WSG-01',
      room: connInfo.room || 'Master Washroom',
      rssi: typeof connInfo.rssi === 'number' ? connInfo.rssi : 0,
      ssid: connInfo.ssid || undefined,
      ipAddress: connInfo.ipAddress || undefined,
    };

    storage.setItem('wsg_last_connected_device_id', devId).catch(() => {});
    storage.setJSON('wsg_last_connected_device_meta', metaToPersist).catch(() => {});

    // Transition to CONNECTED
    this.transitionTo('CONNECTED', `GATT connection verified for "${devName}" (${devId})`);

    // Ensure characteristic discovery & monitoring is started
    BluetoothService.ensureSessionAndMonitoring(connInfo).catch((err) => {
      logger.warn('CONN_MGR', `ensureSessionAndMonitoring note for ${devId}`, logger.serializeError(err));
    });

    return session;
  }

  /**
   * User or UI initiated disconnect.
   * Idempotent: cancels auto-reconnect, marks manual disconnect, and cleanly tears down link.
   */
  public async disconnect(reason: string = 'User initiated disconnect'): Promise<void> {
    logger.info('CONN_MGR', `disconnect requested: ${reason}`);
    console.log(`[ConnectionManager] disconnect requested: ${reason}`);

    this.isManualDisconnect = true;
    storage.setJSON('wsg_manual_disconnect', true).catch(() => {});
    this.cancelReconnectTimer();
    this.cancelSlowRetryTimer();
    this.reconnectAttempt = 0;

    const dev = this.connectedDevice;
    const session = this.activeSession;

    // Idempotent guard: already clean
    if (this.state === 'IDLE' && !dev && !session) {
      return;
    }

    this.connectedDevice = null;
    this.activeSession = null;
    this.transitionTo('IDLE', reason);

    if (session) {
      try {
        BluetoothService.disconnect(session);
      } catch (e) {
        console.warn('[ConnectionManager] disconnect error:', e);
      }
    } else if (dev?.id) {
      await this.cancelDeviceConnection(dev.id);
    }
  }

  /**
   * Retries connection to the last connected device.
   * Resets attempt count and triggers clean connect handshake.
   */
  public async retry(): Promise<void> {
    logger.info('CONN_MGR', 'User triggered retry()');
    console.log('[ConnectionManager] User triggered retry()');

    this.isManualDisconnect = false;
    storage.setJSON('wsg_manual_disconnect', false).catch(() => {});
    this.cancelReconnectTimer();
    this.cancelSlowRetryTimer();
    this.reconnectAttempt = 0;

    const target = this.connectedDevice || this.lastConnectedDevice;
    if (!target || !target.id) {
      logger.warn('CONN_MGR', 'Retry failed: No known target device');
      this.transitionTo('FAILED', 'No known device to retry');
      return;
    }

    const btAvailable = await BluetoothService.isBluetoothAvailable();
    if (!btAvailable) {
      this.transitionTo('BLUETOOTH_OFF', 'Bluetooth is turned off');
      return;
    }

    try {
      await this.cancelDeviceConnection(target.id);
      await new Promise((r) => setTimeout(r, 200));
      await this.connect(target, { isReconnect: false });
    } catch (err: any) {
      logger.error('CONN_MGR', 'Manual retry failed', logger.serializeError(err));
      throw err;
    }
  }

  /**
   * Low-level BLE disconnect handler.
   * ONLY called when the BLE onDisconnected callback fires or isDeviceConnected returns false.
   * Never called from missed heartbeats or Wi-Fi errors.
   */
  public handleBleDisconnect(deviceId: string, reason: string): void {
    logger.warn('CONN_MGR', `handleBleDisconnect for ${deviceId}: ${reason} (manual=${this.isManualDisconnect})`);
    console.log(`[ConnectionManager] handleBleDisconnect: ${deviceId} (${reason}) [manual=${this.isManualDisconnect}]`);

    if (this.isManualDisconnect) {
      this.cancelReconnectTimer();
      this.cancelSlowRetryTimer();
      this.reconnectAttempt = 0;
      this.transitionTo('IDLE', `Manual disconnect: ${reason}`);
      return;
    }

    // Unexpected disconnect: trigger auto-reconnect with exponential backoff
    BluetoothService.stopDeviceEventMonitoring();
    this.activeSession = null;
    this.startAutoReconnect(reason);
  }

  /**
   * Auto-reconnect with exponential backoff:
   * 1s, 2s, 4s, 8s, 16s, up to 30s max interval.
   * Maximum 10 attempts.
   */
  private startAutoReconnect(triggerReason: string): void {
    this.cancelReconnectTimer();

    const target = this.connectedDevice || this.lastConnectedDevice;
    if (!target || !target.id) {
      logger.warn('CONN_MGR', 'Auto-reconnect aborted: No target device known');
      this.transitionTo('FAILED', 'No target device known');
      return;
    }

    this.reconnectAttempt++;
    if (this.reconnectAttempt > this.MAX_RECONNECT_ATTEMPTS) {
      logger.warn('CONN_MGR', `Auto-reconnect stopped: Exceeded max ${this.MAX_RECONNECT_ATTEMPTS} attempts`);
      this.transitionTo('FAILED', `Auto-reconnect failed after ${this.MAX_RECONNECT_ATTEMPTS} attempts`);
      this.startSlowRetryTimer();
      return;
    }

    // Exponential backoff delay calculation
    const delaySec = this.getBackoffDelay(this.reconnectAttempt);
    const delayMs = delaySec * 1000;

    this.transitionTo(
      'RECONNECTING',
      `Auto-reconnect attempt ${this.reconnectAttempt}/${this.MAX_RECONNECT_ATTEMPTS} in ${delaySec}s (trigger: ${triggerReason})`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      if (this.isManualDisconnect) return;

      // Ensure Bluetooth adapter is still turned on
      const btAvailable = await BluetoothService.isBluetoothAvailable();
      if (!btAvailable) {
        logger.warn('CONN_MGR', 'Auto-reconnect paused: Bluetooth is OFF');
        this.transitionTo('BLUETOOTH_OFF', 'Bluetooth is turned off');
        return;
      }

      logger.info(
        'CONN_MGR',
        `Executing auto-reconnect attempt ${this.reconnectAttempt}/${this.MAX_RECONNECT_ATTEMPTS} for ${target.name} (${target.id})`
      );

      try {
        await this.connect(target, { isReconnect: true });
        logger.info('CONN_MGR', `Auto-reconnect succeeded on attempt ${this.reconnectAttempt}`);
        this.reconnectAttempt = 0;
      } catch (err: any) {
        logger.warn(
          'CONN_MGR',
          `Auto-reconnect attempt ${this.reconnectAttempt} failed`,
          logger.serializeError(err)
        );
        if (this.state === 'RECONNECTING') {
          if (this.reconnectAttempt >= this.MAX_RECONNECT_ATTEMPTS) {
            this.transitionTo('FAILED', `Auto-reconnect failed after ${this.MAX_RECONNECT_ATTEMPTS} attempts`);
            this.startSlowRetryTimer();
          } else {
            this.startAutoReconnect(err.message || 'GATT connect rejected');
          }
        }
      }
    }, delayMs);
  }

  /**
   * Starts a slow 60-second retry loop while the app remains in the foreground.
   */
  private startSlowRetryTimer(): void {
    this.cancelSlowRetryTimer();
    if (this.isManualDisconnect) return;
    if (AppState.currentState !== 'active') return;

    this.slowRetryTimer = setTimeout(async () => {
      this.slowRetryTimer = null;
      if (this.state !== 'FAILED') return;
      if (this.isManualDisconnect) return;
      if (AppState.currentState !== 'active') return;

      const btAvail = await BluetoothService.isBluetoothAvailable();
      if (!btAvail) {
        this.transitionTo('BLUETOOTH_OFF', 'Bluetooth is turned off');
        return;
      }

      logger.info('CONN_MGR', 'Executing foreground slow retry (every 60s)');
      await this.executeForegroundRetry('Slow retry (every 60s)');
    }, 60000);
  }

  /**
   * Cancels slow retry timer.
   */
  private cancelSlowRetryTimer(): void {
    if (this.slowRetryTimer) {
      clearTimeout(this.slowRetryTimer);
      this.slowRetryTimer = null;
    }
  }

  /**
   * Executes one foreground retry attempt when in FAILED state.
   */
  private async executeForegroundRetry(reason: string): Promise<void> {
    const target = this.connectedDevice || this.lastConnectedDevice;
    if (!target || !target.id) return;

    try {
      await this.connect(target, { isReconnect: true });
    } catch (err: any) {
      logger.info('CONN_MGR', `Foreground retry failed: ${err.message}`);
      if (this.state === 'RECONNECTING') {
        this.transitionTo('FAILED', err.message || 'Foreground retry failed');
      }
      if (this.state === 'FAILED' && AppState.currentState === 'active' && !this.isManualDisconnect) {
        this.startSlowRetryTimer();
      }
    }
  }

  /**
   * Cancels any pending auto-reconnect timer.
   */
  private cancelReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Release device link cleanly at the native BLE manager level.
   */
  public async cancelDeviceConnection(deviceId: string): Promise<void> {
    if (!deviceId) return;
    try {
      if (Platform.OS === 'android' || Platform.OS === 'ios') {
        await NativeBluetoothService.cancelDeviceConnection(deviceId);
      } else if (this.activeSession?.server) {
        if (this.activeSession.server.connected) {
          this.activeSession.server.disconnect();
        }
      }
    } catch (e) {
      console.warn('[ConnectionManager] cancelDeviceConnection note:', e);
    }
  }

  /**
   * Verifies if physical BLE device is currently connected.
   */
  public async isDeviceConnected(deviceId?: string): Promise<boolean> {
    const id = deviceId || this.connectedDevice?.id || this.activeSession?.device?.id;
    if (!id) return false;

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      try {
        return await NativeBluetoothService.isDeviceConnected(id);
      } catch {
        return false;
      }
    }

    if (this.activeSession?.server) {
      return Boolean(this.activeSession.server.connected);
    }
    if (this.connectedDevice?.rawDevice?.gatt) {
      return Boolean(this.connectedDevice.rawDevice.gatt.connected);
    }
    return false;
  }

  /**
   * Updates metadata for the connected device (e.g. Wi-Fi IP address or SSID)
   * while keeping connectionType: 'BLE'.
   */
  public updateConnectedMeta(meta: Partial<ConnectedDeviceInfo>): void {
    if (this.connectedDevice) {
      this.connectedDevice = {
        ...this.connectedDevice,
        ...meta,
      };
      useConnectionStore.setState({
        connectedDevice: this.connectedDevice,
      });

      const devStore = useDeviceStore.getState();
      const current = devStore.devices.find((d) => d.deviceId === this.connectedDevice?.id);
      if (current) {
        devStore.addOrUpdateDevice({
          ...current,
          ...meta,
        });
      }

      // Persist stripped plain fields
      const metaToPersist = {
        id: this.connectedDevice.id,
        name: this.connectedDevice.name,
        connectionType: this.connectedDevice.connectionType || 'BLE',
        model: this.connectedDevice.model || 'WSG-01',
        room: this.connectedDevice.room || 'Master Washroom',
        rssi: typeof this.connectedDevice.rssi === 'number' ? this.connectedDevice.rssi : 0,
        ssid: this.connectedDevice.ssid || undefined,
        ipAddress: this.connectedDevice.ipAddress || undefined,
      };
      storage.setJSON('wsg_last_connected_device_meta', metaToPersist).catch(() => {});
    }
  }

  /**
   * Sets scanning state (called by BleScanManager).
   * Never transitions to SCANNING from RECONNECTING, FAILED, CONNECTED, or CONNECTING.
   * If a scan runs during RECONNECTING, the reconnect loop keeps going.
   * When scan stops, does not change state unless state is currently SCANNING.
   */
  public setScanning(isScanning: boolean): void {
    if (isScanning) {
      if (
        this.state !== 'CONNECTED' &&
        this.state !== 'CONNECTING' &&
        this.state !== 'RECONNECTING' &&
        this.state !== 'FAILED' &&
        this.state !== 'BLUETOOTH_OFF'
      ) {
        this.transitionTo('SCANNING', 'BleScanManager started scan');
      }
    } else {
      if (this.state === 'SCANNING') {
        this.transitionTo('IDLE', 'BleScanManager stopped scan');
      }
    }
  }

  /**
   * Resets internal state for unit testing purposes.
   */
  public resetForTesting(): void {
    this.cancelReconnectTimer();
    this.cancelSlowRetryTimer();
    this.state = 'IDLE';
    this.connectedDevice = null;
    this.lastConnectedDevice = null;
    this.activeSession = null;
    this.reconnectAttempt = 0;
    this.isManualDisconnect = false;
    this.inFlightConnectPromise = null;
    this.listeners.clear();
  }

  /**
   * Attaches disconnect listeners to the peripheral instance, guarded against duplicates.
   */
  private attachDisconnectListener(session: ConnectedBleSession): void {
    const raw = session.server || session.device?.rawDevice;
    if (!raw) return;

    // Native BLE onDisconnected
    if (typeof raw.onDisconnected === 'function' && !raw._onDisconnectedAttached) {
      raw._onDisconnectedAttached = true;
      try {
        raw.onDisconnected((error: any, dev: any) => {
          const id = dev?.id || session.device.id;
          this.handleBleDisconnect(id, error?.message || 'Native BLE onDisconnected');
        });
      } catch (e) {
        console.warn('[ConnectionManager] Could not attach native onDisconnected listener:', e);
      }
    }

    // Web Bluetooth gattserverdisconnected
    if (typeof raw.addEventListener === 'function' && !raw._gattDisconnectedAttached) {
      raw._gattDisconnectedAttached = true;
      try {
        raw.addEventListener(
          'gattserverdisconnected',
          () => {
            const id = session.device.id;
            this.handleBleDisconnect(id, 'Web GATT gattserverdisconnected');
          },
          { once: true }
        );
      } catch (e) {
        console.warn('[ConnectionManager] Could not attach gattserverdisconnected listener:', e);
      }
    }
  }

  /**
   * Single writer transition function.
   * Logs every transition with reason and synchronizes with useConnectionStore and useAppStore.
   */
  private transitionTo(nextState: ConnectionManagerState, reason: string): void {
    const prevState = this.state;
    this.state = nextState;

    logger.info('CONN_MGR', `State transition: ${prevState} -> ${nextState} (reason: ${reason})`);
    console.log(`[ConnectionManager] State transition: ${prevState} -> ${nextState} (reason: ${reason})`);

    // Map to useConnectionStore.status
    let storeStatus: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting' = 'disconnected';
    if (nextState === 'CONNECTED') {
      storeStatus = 'connected';
    } else if (nextState === 'CONNECTING' || nextState === 'SCANNING') {
      storeStatus = 'connecting';
    } else if (nextState === 'RECONNECTING') {
      storeStatus = 'reconnecting';
    } else if (nextState === 'FAILED') {
      storeStatus = 'error';
    } else {
      storeStatus = 'disconnected';
    }

    // Map to useAppStore.bluetoothStatus
    let btStatus:
      | 'CONNECTED'
      | 'DISCONNECTED'
      | 'CONNECTING'
      | 'RECONNECTING'
      | 'FAILED'
      | 'BLUETOOTH_OFF' = 'DISCONNECTED';

    if (nextState === 'CONNECTED') {
      btStatus = 'CONNECTED';
    } else if (nextState === 'CONNECTING') {
      btStatus = 'CONNECTING';
    } else if (nextState === 'RECONNECTING') {
      btStatus = 'RECONNECTING';
    } else if (nextState === 'FAILED') {
      btStatus = 'FAILED';
    } else if (nextState === 'BLUETOOTH_OFF') {
      btStatus = 'BLUETOOTH_OFF';
    } else {
      btStatus = 'DISCONNECTED';
    }

    // Update stores as the SINGLE WRITER
    useAppStore.getState().setBluetoothStatus(btStatus);

    if (nextState === 'CONNECTED') {
      useAppStore.getState().setIsOnline(true);
    } else if (nextState === 'FAILED' || nextState === 'IDLE' || nextState === 'BLUETOOTH_OFF') {
      if (useAppStore.getState().wifiStatus !== 'CONNECTED') {
        useAppStore.getState().setIsOnline(false);
      }
    }

    useConnectionStore.setState({
      status: storeStatus as any,
      connectionManagerState: nextState,
      connectedDevice: nextState === 'IDLE' ? null : this.connectedDevice,
      lastError: nextState === 'FAILED' ? reason : null,
      lastConnectedDeviceId:
        this.lastConnectedDevice?.id || useConnectionStore.getState().lastConnectedDeviceId,
    });

    // Notify registered listeners
    this.listeners.forEach((listener) => {
      try {
        listener(nextState, reason);
      } catch (err) {
        console.warn('[ConnectionManager] listener error:', err);
      }
    });
  }
}

export const ConnectionManager = new ConnectionManagerClass();
