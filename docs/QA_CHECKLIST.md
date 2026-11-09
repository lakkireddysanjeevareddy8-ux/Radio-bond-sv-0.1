# QA Release Verification Checklist

This manual checklist must be executed and signed off prior to tagging any release or distributing an APK/AAB build for the **Washroom Safety Guardian (WSG-01)**.

---

## 1. Build Verification & Metadata
- [ ] Run clean compilation: `node --stack-size=8192 app/node_modules/typescript/bin/tsc --noEmit -p app/tsconfig.json`
- [ ] Run complete test suite: `npm --prefix app test` (All tests passing)
- [ ] Verify `app/app.json` version string and `versionCode` match release target.
- [ ] Confirm `CHANGELOG.md` reflects all merged PRs/commits since previous tag.
- [ ] Check `Settings` screen $\rightarrow$ *Developer & about* section displays the exact version and build number.

---

## 2. Fresh Installation & Clean State
- [ ] Completely uninstall previous versions of the app from test device.
- [ ] Install newly built release APK (`preview` build).
- [ ] Launch app: Ensure clean onboarding splash, login/signup screen, or welcome flow loads without crashes.
- [ ] Confirm local storage, SecureStore tokens, and cached credentials start in a completely clean initial state.

---

## 3. Runtime Permissions Handling
- [ ] **Android 12+ (API 31+)**:
  - [ ] App displays pre-permission explanatory primer.
  - [ ] Grant `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` prompts.
  - [ ] App prompts for `POST_NOTIFICATIONS` (Android 13+).
  - [ ] App does NOT needlessly request background location if `neverForLocation` flag is respected.
- [ ] **Permanent Denial Recovery**:
  - [ ] Deny Bluetooth permissions twice.
  - [ ] Verify app transitions to friendly error state explaining why permission is required and presents "Open App Settings" button.
  - [ ] Tapping "Open App Settings" navigates directly to OS App Details screen.

---

## 4. Hardware Pairing & Security Hardening
- [ ] Power on physical WSG-01 ESP32 hardware.
- [ ] Trigger first-pairing window (press physical hardware pairing button or within 5 min of factory reset).
- [ ] Tap **Add Device** $\rightarrow$ Scan nearby BLE devices.
- [ ] Verify device appears as `WSG-01 [XXXX]` with RSSI indicator.
- [ ] Connect and complete initial handshake.
- [ ] Verify per-device cryptographic token is negotiated and stored into hardware-backed `expo-secure-store` (never logged in plain text).
- [ ] Verify non-pairing window attempts: try pairing a second phone without pressing hardware button $\rightarrow$ confirm access is rejected with `ERR_PAIRING_CLOSED`.

---

## 5. Wi-Fi Provisioning & Error Recovery
- [ ] **Wrong Wi-Fi Password**:
  - [ ] Input correct SSID and deliberately invalid Wi-Fi password.
  - [ ] Verify app does not hang indefinitely.
  - [ ] Verify app displays `FriendlyErrorCard` with `WIFI_AUTH_FAILED` title, description, and "What to do: Check password capitalization and symbols" with re-entry button.
- [ ] **5 GHz Network Handling**:
  - [ ] Connect phone to a 5 GHz-only network.
  - [ ] Attempt provisioning $\rightarrow$ verify prompt alerts user that WSG-01 requires a 2.4 GHz Wi-Fi band (`_2.4G`).
- [ ] **WPA3 / Enterprise Hotspot**:
  - [ ] Attempt connecting to WPA3-Enterprise / captive portal network.
  - [ ] Verify error highlights WPA2-Personal compatibility.
- [ ] **Successful Wi-Fi Provisioning**:
  - [ ] Provide valid 2.4 GHz credentials.
  - [ ] Verify ESP32 joins Wi-Fi, receives IP address, and updates status to `CONNECTED`.
  - [ ] Verify Wi-Fi network name and IP address reflect on the *About Device* screen.

---

## 6. Network & Radio Disruption Tests
- [ ] **Router Powered Off**:
  - [ ] Turn off home Wi-Fi router.
  - [ ] Verify ESP32 maintains local safety monitoring and local audio buzzer.
  - [ ] Verify BLE link to phone remains active; app continues receiving local telemetry.
  - [ ] Turn router back on $\rightarrow$ verify ESP32 auto-reconnects to Wi-Fi within 30 seconds.
- [ ] **Bluetooth Toggled in Phone Settings**:
  - [ ] While connected, swipe down quick settings and turn Bluetooth OFF.
  - [ ] Verify app transitions to `BLUETOOTH_OFF` state without crashing.
  - [ ] Turn Bluetooth back ON in quick settings.
  - [ ] Verify `ConnectionManager` automatically detects Bluetooth restoration and re-establishes GATT connection.

---

## 7. App Lifecycle & Background Survival
- [ ] **App Killed and Reopened**:
  - [ ] While connected to WSG-01, swipe away/force stop the app from the Recent Apps list.
  - [ ] Reopen the app:
    - [ ] `ConnectionManager.init()` loads last device from SecureStore.
    - [ ] Background reconnect restores active session without requiring re-pairing.
- [ ] **Phone Locked for 30 Minutes**:
  - [ ] Ensure foreground service is running with persistent notification (`Washroom Guardian is monitoring`).
  - [ ] Lock the phone screen and leave untouched on battery power for 30 minutes.
  - [ ] Unlock phone: Verify BLE GATT connection is still alive, heartbeats are received, and no silent OS kill occurred.
- [ ] **Battery Optimization Prompt**:
  - [ ] Verify app displays a one-time prompt requesting exemption from Android Doze / battery optimization.
  - [ ] Tapping opens battery optimization settings.

---

## 8. Device Faults & Power-Cycle Recovery
- [ ] **Device Power-Cycled (Unplug & Re-plug)**:
  - [ ] Unplug power from WSG-01 device.
  - [ ] Verify app detects link drop and enters `RECONNECTING` state with backoff delays (1s, 2s, 4s, 8s, 16s, 30s...).
  - [ ] Plug device power back in.
  - [ ] Verify app automatically locks onto device advertisements, reconnects, and returns to `CONNECTED` status.
- [ ] **Heartbeat Watchdog & Device Offline**:
  - [ ] Disconnect device from both BLE and Wi-Fi.
  - [ ] Wait for 3 missed heartbeats (~135 seconds).
  - [ ] Verify app displays "Device not responding / offline" status.
  - [ ] Verify app does NOT misidentify device offline as an emergency event.
  - [ ] If enabled, verify push notification is dispatched to trusted contacts.

---

## 9. Emergency Verification across App States
- [ ] **Trigger Emergency in Foreground**:
  - [ ] Press physical emergency button or trigger voice keyword on hardware.
  - [ ] Verify immediate full-screen Emergency screen displays.
  - [ ] Verify high-priority looping siren sound plays.
  - [ ] Verify phone vibrates continuously.
  - [ ] Tap **Acknowledge**:
    - [ ] Siren stops.
    - [ ] Acknowledgment command is sent back to ESP32 (hardware stops beeping).
    - [ ] Event status updates to `ACKNOWLEDGED` in Supabase history.
- [ ] **Trigger Emergency in Background**:
  - [ ] Minimize app to home screen.
  - [ ] Trigger emergency from device.
  - [ ] Verify high-priority heads-up notification pops up with critical siren audio.
  - [ ] Tap notification: app immediately launches full-screen emergency UI.
- [ ] **Trigger Emergency while Phone is Locked**:
  - [ ] Lock phone screen (black display).
  - [ ] Trigger emergency from device.
  - [ ] Verify screen automatically wakes up via full-screen intent.
  - [ ] Verify alarm sound rings over lockscreen.
- [ ] **Secondary Cloud Path (Bluetooth OFF)**:
  - [ ] Disconnect Bluetooth on phone. Ensure ESP32 is connected to Wi-Fi.
  - [ ] Trigger emergency on hardware.
  - [ ] Hardware posts event to Supabase over Wi-Fi.
  - [ ] Verify Supabase Edge Function triggers push notification to phone and SMS/call/push to trusted contacts.
  - [ ] Verify emergency deduplication (`eventId`) prevents repeated alert sounds if BLE reconnects.

---

## 10. 24-Hour Continuous Soak Test
- [ ] Run continuous monitoring session for 24 hours on physical test phone and ESP32.
- [ ] Check memory usage graph: No memory leaks or runaway garbage collection.
- [ ] Check ESP32 serial logs / uptime: Uptime increments smoothly; free heap remains steady ($\ge 120$ KB).
- [ ] Review in-app `Debug Logs`: No unhandled promise rejections, crash loops, or uncaught exceptions.
- [ ] Verify zero false emergency triggers throughout 24-hour stillness period.

---

### Sign-off
- **Release Version**: `v1.0.1 (Build 2)`
- **Date Executed**: _______________
- **Tested By**: _______________
- **Device Model / OS**: _______________
- **Status**: [ ] PASSED  [ ] FAILED

