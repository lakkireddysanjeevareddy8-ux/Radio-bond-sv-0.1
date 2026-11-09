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
  },
  Alert: {
    alert: jest.fn(),
  },
};

