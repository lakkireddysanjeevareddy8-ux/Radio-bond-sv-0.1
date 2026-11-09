# Privacy Policy Outline

**Washroom Safety Guardian**
*Last updated: November 9, 2026*

---

## 1. Introduction & Our Commitment to Privacy

Washroom Safety Guardian ("we", "our", or "the App") is dedicated to protecting the life safety, dignity, and privacy of its users. 

**Our Core Privacy Principle: Zero Optical Surveillance**
The WSG-01 hardware and mobile application **do not contain cameras, optical sensors, or video lenses of any kind**. Room presence and stillness detection rely solely on 24 GHz millimeter-wave radar micro-motion technology.

This Privacy Policy explains what information we collect, how it is used, how it is secured, and your rights regarding your personal data.

---

## 2. Information We Collect and How We Use It

### A. Bluetooth Low Energy (BLE) Permissions
- **Purpose**: Used exclusively to discover, pair with, configure, and receive real-time safety telemetry and emergency broadcasts from your local WSG-01 safety device.
- **Location Exemption**: Under Android 12+ (API 31+), the app explicitly declares the `neverForLocation` flag on `BLUETOOTH_SCAN`. We **never** determine, record, or track your physical GPS coordinates or geographic location.

### B. Notifications & Full-Screen Alerts
- **Purpose**: Used to provide life-critical emergency alarms, system alerts (e.g., device offline warnings), and to maintain the Android foreground service persistent notification (`Washroom Guardian is monitoring`).
- **Emergency Priority**: Notifications designated as emergency alerts trigger high-priority sound and full-screen intent to ensure alarms wake the screen and notify you even if your phone is locked or set to Do Not Disturb.

### C. Account & Trusted Contact Information (Supabase)
- **User Account**: When you create an account, we collect your email address and authentication credentials securely managed through Supabase Auth.
- **Trusted Caregiver Contacts**: If you configure emergency escalation, we store the names, phone numbers, and email addresses of your designated trusted contacts in our encrypted database so automated push/SMS emergency alerts can reach them.
- **Emergency Event History**: Timestamps, device identifiers, trigger reasons (e.g., STILLNESS_TIMEOUT, EMERGENCY_BUTTON), and acknowledgment status are stored in an audit trail to assist family members and caregivers in reviewing safety events.

### D. Device Pairing Security & Secure Storage
- **Cryptographic Tokens**: Each WSG-01 device generates a unique cryptographic pairing token on initial boot.
- **Keystore Isolation**: This token is stored exclusively on your device inside hardware-backed storage (`expo-secure-store` utilizing Android Keystore / iOS Keychain).
- **Zero Cloud Exposure**: Pairing tokens and Wi-Fi network passwords are **never uploaded to Supabase, never transmitted to external servers, and never written to diagnostic log files**.

### E. Diagnostic Logs & Optional Crash Analytics (Sentry)
- **Local Debug Logs**: The app maintains an in-memory 500-entry ring buffer on your local device to assist in troubleshooting Bluetooth connection issues. Wi-Fi passwords, authentication tokens, and user credentials are automatically stripped and redacted by our logging pipeline.
- **Optional Sentry Crash Reporting**: Crash telemetry via `@sentry/react-native` is **disabled by default** and operates strictly on an opt-in basis (managed via *Settings $\rightarrow$ Anonymous Crash Diagnostics*). When enabled, Sentry receives only anonymized stack traces and device model information to help fix software bugs—no personal names, phone numbers, or credentials are ever captured.

---

## 3. Data Sharing & Third-Party Services

We do not sell, rent, or monetize your personal data. Data is shared only with vetted infrastructure providers necessary for app operation:
- **Supabase Inc.**: Secure authentication, PostgreSQL database, and edge function push escalation (hosted in certified, secure cloud data centers).
- **Expo / EAS (Expo Application Services)**: Remote build services and push notification dispatching (`expo-notifications`).
- **Functional Telephony/SMS Gateways**: If SMS alerts are enabled, emergency notification messages are passed to telephony gateways solely for immediate delivery to your designated contacts.

---

## 4. Data Retention & User Control

- **Right to Access & Export**: You can view all saved devices, active contacts, and past safety events directly within the app.
- **Right to Erasure**: You can delete trusted contacts, unpair devices, or delete your account at any time. Account deletion completely purges your user record, contact entries, and device links from our primary database.
- **Local Data Reset**: Uninstalling the application or clearing app storage immediately deletes all locally cached SecureStore tokens, ring buffer logs, and preferences.

---

## 5. Children's Privacy
The App is not marketed to children under 13 years of age. We do not knowingly collect personal information from children.

---

## 6. Contact Us
For questions regarding this Privacy Policy or data security practices, please contact our privacy compliance team:
- **Email**: `privacy@washroomsafety.com`
- **Support**: `https://washroomsafety.com/support`

