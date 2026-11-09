# Changelog

All notable changes to the Washroom Safety Guardian project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-11-09

### Added
- **Onboarding Step Indicator**: 5-step visual progress bar (`Bluetooth` $\rightarrow$ `Find Device` $\rightarrow$ `Wi-Fi` $\rightarrow$ `Verify` $\rightarrow$ `Done`) with accessible step tracking in `DeviceOnboardingScreen`.
- **Actionable Error Recovery ("What to do")**: Specialized error cards (`FriendlyErrorCard` and `DeviceErrorBanner`) offering failure-specific remedies for wrong Wi-Fi passwords, 5 GHz frequency band mismatches, Bluetooth disabled, missing Android 12+ permissions, out-of-range signals, and WPA3 hotspot incompatibility.
- **Troubleshooting Guide**: Dedicated, searchable accordion screen (`TroubleshootingScreen`) categorizing common Bluetooth, Wi-Fi, background monitoring, and sensor diagnostics.
- **Hardware Telemetry & About Device Screen**: Real-time inspection screen (`AboutDeviceScreen`) displaying BLE RSSI, Wi-Fi SSID/IP, hardware firmware version, wire protocol version, LD2410C radar health, microphone status, uptime, free heap, and a live GATT ping benchmark tool.
- **Pull-to-Refresh Support**: Standard `RefreshControl` across Dashboard, Devices, Events, Contacts, and About Device screens.
- **Centralized String Dictionary**: Extracted all user-facing copy into `app/src/constants/strings.ts` for internationalization readiness.
- **End-to-End Emergency Pipeline**:
  - Tri-channel emergency deduplication (`eventId`) across BLE, Supabase Realtime, and Push notifications.
  - Bi-directional emergency acknowledgment back to ESP32 hardware and Supabase backend.
  - 45-second heartbeat watchdog flagging device offline after 3 missed cycles.
  - Emergency Alarm screen with full-screen intent, wake locks, looping siren, and device resolution tracking.
- **Security & Pairing Hardening**:
  - Per-device random cryptographic pairing token generated on first boot and stored in ESP32 NVS.
  - Replaced plaintext AsyncStorage token storage with hardware-backed `expo-secure-store` (Android Keystore / iOS Keychain).
  - Rate limiting on failed GATT authentication attempts in firmware.
  - Supabase Row-Level Security (RLS) policies reviewed and hardened.
- **Firmware Robustness (ESP32)**:
  - Task Watchdog Timer (TWDT) enabled with clean panic resets.
  - Non-blocking FreeRTOS background task queue for HTTP telemetry and Wi-Fi provisioning.
  - Bounded JSON parser protecting against memory overflow.
  - Periodic telemetry status notification broadcast over BLE.
- **Diagnostic Logging & Telemetry**:
  - 500-entry persistent ring buffer with automatic redaction of Wi-Fi passwords, tokens, and credentials.
  - Diagnostic "Debug Logs" screen with filtering, clipboard copy, and native share sheets.
  - Opt-in crash reporting via `@sentry/react-native`.
- **EAS Build & Release Pipeline**:
  - Configured `development`, `preview` (standalone APK), and `production` (Play Store AAB) profiles in `eas.json` with remote `versionCode` auto-increment.
  - GitHub Actions tagged release workflow (`.github/workflows/release-preview.yml`).

### Fixed
- Fixed BLE `ConnectionManager` state transitions to prevent overwriting `RECONNECTING` or `CONNECTED` states during active scans.
- Stripped non-serializable objects (`rawDevice`, GATT server references) from persisted connection metadata.
- Resolved race conditions in auto-reconnect backoff timers and double-connect guards.
- Ensured device local buzzer continues sounding during emergencies even when BLE or Wi-Fi links are disconnected.

---

## [1.0.0] - 2026-10-30

### Added
- Initial production release of Washroom Safety Guardian (WSG-01).
- BLE GATT discovery, connection, and characteristic monitoring with `react-native-ble-plx`.
- Integration with LD2410C 24 GHz millimeter-wave presence radar and audio emergency keywords.
- Supabase authentication, database synchronization, and edge function push escalation.
- Trusted caregiver contact management and multi-tier notification escalation.
- Interactive Simulator and Demo modes for offline testing and verification.

