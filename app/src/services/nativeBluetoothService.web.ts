import { ProductDefinition } from './productCatalog';

/**
 * Web stub for NativeBluetoothService.
 * When running in a browser / web environment, native mobile BLE
 * is not available and Web Bluetooth is used instead.
 */
export class NativeBluetoothServiceClass {
  public async isAvailable(): Promise<boolean> {
    return false;
  }

  public async getState(): Promise<'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown'> {
    return 'unsupported';
  }

  public onStateChange(
    _listener: (state: 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown') => void
  ): () => void {
    return () => {};
  }

  public async requestPermissions(): Promise<boolean> {
    return true;
  }

  public openSettings(): void {}

  public async startScan(
    _onDeviceFound: (device: any) => void,
    _onError: (err: any) => void,
    _options?: { serviceUuids?: string[]; timeoutMs?: number }
  ): Promise<void> {}

  public stopScan(): void {}

  public async connectGatt(
    _device: any,
    _product: ProductDefinition
  ): Promise<any> {
    throw new Error('Native BLE is only available on Android and iOS devices.');
  }

  public disconnect(_session: any): void {}
}

export const NativeBluetoothService = new NativeBluetoothServiceClass();
