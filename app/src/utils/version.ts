import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const APP_VERSION =
  Constants.expoConfig?.version ||
  (Constants as any)?.manifest2?.extra?.expoClient?.version ||
  '1.0.1';

export const APP_BUILD_NUMBER =
  Constants.expoConfig?.android?.versionCode ||
  (Constants as any)?.expoConfig?.ios?.buildNumber ||
  2;

export const APP_VERSION_STRING = `v${APP_VERSION} (Build ${APP_BUILD_NUMBER})`;

export const APP_DETAILS = {
  name: 'Washroom Safety Guardian',
  shortName: 'WSG-01',
  version: APP_VERSION,
  build: APP_BUILD_NUMBER,
  versionString: APP_VERSION_STRING,
  platform: Platform.OS,
  releaseType: 'Standalone APK',
};
