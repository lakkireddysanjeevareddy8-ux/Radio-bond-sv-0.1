module.exports = {
  BleManager: jest.fn().mockImplementation(() => ({
    startDeviceScan: jest.fn(),
    stopDeviceScan: jest.fn(),
    connectToDevice: jest.fn(),
    cancelDeviceConnection: jest.fn(),
    isDeviceConnected: jest.fn().mockResolvedValue(true),
    state: jest.fn().mockResolvedValue('PoweredOn'),
    onStateChange: jest.fn(),
    destroy: jest.fn(),
  })),
  State: {
    Unknown: 'Unknown',
    Resetting: 'Resetting',
    Unsupported: 'Unsupported',
    Unauthorized: 'Unauthorized',
    PoweredOff: 'PoweredOff',
    PoweredOn: 'PoweredOn',
  },
  BleError: class BleError extends Error {
    constructor(message) {
      super(message);
      this.name = 'BleError';
      this.errorCode = 201;
    }
  },
};

