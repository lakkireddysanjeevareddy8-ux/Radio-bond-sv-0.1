import { AppState, Platform } from 'react-native';
import { BluetoothService, ConnectedBleSession, DiscoveredBleDevice } from './bluetoothService';
import { NativeBluetoothService } from './nativeBluetoothService';
import {
  useConnectionStore,
  ConnectedDeviceInfo,
  ConnectionManagerState,
} from '../store/useConnectionStore';
import { useAppStore } from '../store/useAppStore';
import { useDeviceStore, SavedDevice } from '../store/useDeviceStore';
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
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private isManualDisconnect: boolean = false;

  // Guard against double connects
  private inFlightConnectPromise: Promise<ConnectedBleSession> | null = null;

  // Listeners
  private listeners: Set<ConnectionManagerListener> = new Set();
  private isInitialized: boolean = false;

  /**
   * Initializes ConnectionManager once on application startup.
   * Wires Bluetooth adapter state transitions and AppState background/foreground resume.
   */
  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    logger.info('CONN_MGR', 'Initializing ConnectionManager singleton');
    console.log('[ConnectionManager] Initializing...');

    // 1. Load last connected device metadata from persistent storage
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

    // 2. Wire Bluetooth adapter state listener
    BluetoothService.addBluetoothStateListener((adapterState) => {
      console.log('[ConnectionManager] Bluetooth adapter state changed to:', adapterState);
      if (adapterState === 'off') {
        this.cancelReconnectTimer();
        this.transitionTo('BLUETOOTH_OFF', 'Bluetooth adapter turned off');
      } else if (adapterState === 'on') {
        if (this.state === 'BLUETOOTH_OFF') {
          const target = this.connectedDevice || this.lastConnectedDevice;
          if (target && target.id) {
            logger.info('CONN_MGR', `Bluetooth turned back on. Auto-reconnecting to ${target.id}`);
            this.reconnectAttempt = 0;
            this.startAutoReconnect('Bluetooth adapter turned back on');
          } else {
            this.transitionTo('IDLE', 'Bluetooth turned on, no target device');
          }
        }
      }
    });

    // 3. Wire AppState resume listener
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
        } else if (this.state === 'RECONNECTING' || this.state === 'FAILED') {
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
    // Notify immediately with current state
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

    this.isManualDisconnect = false;
    this.cancelReconnectTimer();
    this.reconnectAttempt = 0;

    // 3. Verify Bluetooth is turned on
    const btAvailable = await BluetoothService.isBluetoothAvailable();
    if (!btAvailable) {
      this.transitionTo('BLUETOOTH_OFF', 'Cannot connect: Bluetooth is turned off');
      throw new Error('BLUETOOTH_DISABLED');
    }

    this.inFlightConnectPromise = (async () => {
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

    // Connect via BluetoothService
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

    this.activeSession = session;

    // Attach disconnect listener guarded against duplicate registration
    this.attachDisconnectListener(session);

    // Build connected device model
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

    // Persist last connected device ID and metadata
    storage.setItem('wsg_last_connected_device_id', devId).catch(() => {});
    storage.setJSON('wsg_last_connected_device_meta', connInfo).catch(() => {});

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
   * Cancels any pending auto-reconnect and marks disconnect as intentional.
   */
  public async disconnect(reason: string = 'User initiated disconnect'): Promise<void> {
    logger.info('CONN_MGR', `disconnect requested: ${reason}`);
    console.log(`[ConnectionManager] disconnect requested: ${reason}`);

    this.isManualDisconnect = true;
    this.cancelReconnectTimer();
    this.reconnectAttempt = 0;

    const targetId = this.connectedDevice?.id || this.activeSession?.device?.id;
    if (targetId) {
      await this.cancelDeviceConnection(targetId);
    }

    if (this.activeSession) {
      BluetoothService.disconnect(this.activeSession);
      this.activeSession = null;
    }

    this.connectedDevice = null;
    this.transitionTo('IDLE', reason);
  }

  /**
   * Retries connection to the last connected device.
   * Resets attempt count and triggers clean connect handshake.
   */
  public async retry(): Promise<void> {
    logger.info('CONN_MGR', 'User triggered retry()');
    console.log('[ConnectionManager] User triggered retry()');

    this.cancelReconnectTimer();
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

    this.transitionTo('CONNECTING', 'User manual retry initiated');
    try {
      await this.cancelDeviceConnection(target.id);
      await new Promise((r) => setTimeout(r, 300));
      await this.connect(target, { isReconnect: true });
      this.reconnectAttempt = 0;
    } catch (err: any) {
      logger.error('CONN_MGR', 'Manual retry failed', logger.serializeError(err));
      this.transitionTo('FAILED', err.message || 'Retry failed');
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
      this.isManualDisconnect = false;
      this.cancelReconnectTimer();
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
      return;
    }

    // Exponential backoff delay calculation
    const delayMs = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempt - 1));
    this.transitionTo(
      'RECONNECTING',
      `Auto-reconnect attempt ${this.reconnectAttempt}/${this.MAX_RECONNECT_ATTEMPTS} in ${delayMs / 1000}s (trigger: ${triggerReason})`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

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
        await this.cancelDeviceConnection(target.id);
        await new Promise((r) => setTimeout(r, 300));

        await this.executeConnect(target, { isReconnect: true });
        logger.info('CONN_MGR', `Auto-reconnect succeeded on attempt ${this.reconnectAttempt}`);
        this.reconnectAttempt = 0;
      } catch (err: any) {
        logger.warn(
          'CONN_MGR',
          `Auto-reconnect attempt ${this.reconnectAttempt} failed`,
          logger.serializeError(err)
        );
        if (this.state === 'RECONNECTING') {
          this.startAutoReconnect(err.message || 'GATT connect rejected');
        }
      }
    }, delayMs);
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
    }
  }

  /**
   * Sets scanning state (called by BleScanManager).
   */
  public setScanning(isScanning: boolean): void {
    if (isScanning && this.state !== 'CONNECTED' && this.state !== 'CONNECTING') {
      this.transitionTo('SCANNING', 'BleScanManager started scan');
    } else if (!isScanning && this.state === 'SCANNING') {
      this.transitionTo('IDLE', 'BleScanManager stopped scan');
    }
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
