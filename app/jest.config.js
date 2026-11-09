module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^expo-constants$': '<rootDir>/src/services/__tests__/__mocks__/expoConstantsMock.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/services/__tests__/__mocks__/asyncStorageMock.js',
    '^expo-clipboard$': '<rootDir>/src/services/__tests__/__mocks__/expoClipboardMock.js',
    '^expo-secure-store$': '<rootDir>/src/services/__tests__/__mocks__/expoSecureStoreMock.js',
    '^react-native$': '<rootDir>/src/services/__tests__/__mocks__/reactNativeMock.js',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/src/services/__tests__/__mocks__/fileMock.js',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          types: ['jest'],
        },
      },
    ],
  },
};
