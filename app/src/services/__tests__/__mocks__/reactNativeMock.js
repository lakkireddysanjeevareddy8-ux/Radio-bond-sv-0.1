module.exports = {
  Platform: {
    OS: 'android',
    Version: '14',
    constants: { Model: 'Pixel 8', Brand: 'Google' },
    select: (obj) => obj.android || obj.default,
  },
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Linking: {
    openURL: jest.fn(async () => true),
    canOpenURL: jest.fn(async () => true),
    openSettings: jest.fn(async () => true),
    sendIntent: jest.fn(async () => true),
  },
  Alert: {
    alert: jest.fn(),
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
      BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
      ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
      POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again',
    },
    check: jest.fn(async () => true),
    request: jest.fn(async () => 'granted'),
    requestMultiple: jest.fn(async () => ({})),
  },
};

