# Google Play Store Listing & Asset Specification

This document provides the complete copy, metadata, specifications, and layout guidelines for listing **Washroom Safety Guardian** on the Google Play Store.

---

## 1. App Metadata & Copy

### App Title (Max 30 characters)
`Washroom Safety Guardian`

### Short Description (Max 80 characters)
`Non-invasive washroom safety monitor with fall detection & emergency alerts.`

### Full Description (Max 4,000 characters)

```markdown
Washroom Safety Guardian (WSG-01) is a privacy-first, non-invasive safety monitoring system designed for seniors, independent individuals, and assisted living environments. 

By combining 24 GHz millimeter-wave radar presence sensing with local acoustic emergency detection, Washroom Safety Guardian detects prolonged stillness, potential falls, and verbal distress calls—without ever using cameras or invasive optical surveillance.

KEY FEATURES:

🛡️ 100% CAMERA-FREE & PRIVACY-FIRST
No cameras, no video feeds, and no visual recordings. Monitoring relies entirely on millimeter-wave micro-motion radar (LD2410C) that detects presence and breathing while preserving total dignity and personal privacy.

🚨 DEPENDABLE EMERGENCY ESCALATION
In the event of sudden immobility, an unacknowledged stillness timer, or an emergency distress call:
- Immediate local hardware siren and visual buzzer.
- Full-screen high-priority alert on your mobile device (bypassing silent mode).
- Automated cloud escalation to designated trusted caregivers and emergency contacts via push notification and SMS.

📶 DUAL BLE & WI-FI CONNECTIVITY
- Local Bluetooth Low Energy (BLE): Real-time direct communication with low power and instant responsiveness.
- Redundant Cloud Wi-Fi: If your phone is out of Bluetooth range, emergency events and heartbeats automatically route through Wi-Fi to ensure caregivers are notified anywhere in the world.

⚡ SEAMLESS ONBOARDING & SETUP
- Step-by-step 5-stage setup guide with visual progress indicators.
- One-tap Bluetooth discovery and automatic connection recovery.
- Intuitive Wi-Fi network configuration with automatic 2.4 GHz validation.
- Built-in diagnostic tools, including signal RSSI ratings, hardware ping benchmark, and troubleshooting guides.

❤️ TRUSTED CAREGIVER NETWORK
- Configure multi-tier escalation lists.
- Designate primary and secondary contacts.
- Real-time bi-directional emergency acknowledgments so caregivers know when help is on the way.

📊 WELLNESS & ROUTINE INSIGHTS
- Track daily washroom duration and frequency trends.
- Automated anomaly detection for irregular routine lengths.
- Full emergency incident history with resolution timestamps.

🔒 SECURE & ENCRYPTED
- Hardware pairing tokens stored in your phone’s secure hardware enclave (Android Keystore).
- End-to-end encrypted database synchronization.
- Zero tracking or selling of personal information.

Protect the independence and dignity of your loved ones. Install Washroom Safety Guardian today.
```

---

## 2. Release Notes ("What's New in This Version")

```text
Version 1.0.1 (Build 2):
• New 5-step guided onboarding indicator for effortless setup.
• Added About Device screen with live signal strength (RSSI), firmware specs, and hardware ping tool.
• Integrated Troubleshooting & Diagnostics guide with actionable recovery fixes.
• Enhanced emergency deduplication and bi-directional acknowledgment.
• Added pull-to-refresh on all primary screens.
• Performance, background service stability, and connection resilience improvements.
```

---

## 3. Store Categorization & Policies

- **Application Category**: Medical / Health & Fitness / Lifestyle
- **Tags**: Safety, Senior Care, Fall Detection, Smart Home, Elderly Care, Caregiver
- **Content Rating**: Everyone (PEGI 3 / ESRB Everyone)
- **Target Audience**: Adults, Family Caregivers, Assisted Living Staff
- **Contains Ads**: No
- **In-App Purchases**: No
- **Privacy Policy URL**: `https://your-domain.com/privacy-policy` (See `docs/PRIVACY_POLICY.md`)

---

## 4. Visual Asset Specifications

### App Icon
- **Dimensions**: `512 x 512 px`
- **Format**: 32-bit PNG with alpha
- **Max File Size**: 1024 KB
- **Design Guidelines**: High-contrast safety shield with a radar pulse or gentle wave motif. Background color `#E6F4FE` matching Android adaptive icon foreground.

### Feature Graphic
- **Dimensions**: `1024 x 500 px`
- **Format**: JPEG or 24-bit PNG (no alpha)
- **Max File Size**: 15 MB
- **Composition**:
  - Background: Modern, calming clean gradient (`#0284C7` to `#0F172A`).
  - Left / Center: Render of the WSG-01 device or clean 3D radar illustration with the tagline: *"Dignity & Safety in Every Home"*.
  - Right: Smartphone mockup displaying the live safe dashboard.

### Phone Screenshots (Minimum 4, Recommended 6)
- **Aspect Ratio**: `16:9` (Landscape) or `9:16` (Portrait) — Recommended: `1080 x 2400 px` (Portrait).
- **Format**: 24-bit PNG or JPEG.

| Screenshot # | View Name | Caption / Overlay Headline | Visual Content |
|---|---|---|---|
| **1** | Dashboard | **Non-Invasive Washroom Safety** | Safe state card, presence radar indicator, routine timer, and battery status. |
| **2** | Emergency Alert | **Instant Multi-Channel Alerts** | Full-screen critical emergency UI with siren indicator, trigger reason, and Acknowledge button. |
| **3** | Setup & Pairing | **Simple 5-Step Guided Setup** | `OnboardingStepIndicator` showing Bluetooth search and automatic hardware pairing. |
| **4** | About Device | **Live Hardware Diagnostics** | RSSI signal meter, Wi-Fi IP, firmware version, and GATT latency ping tool. |
| **5** | Trusted Caregivers | **Automatic Family Escalation** | Multi-tier caregiver contact cards and notification channels. |
| **6** | Routine Trends | **Peace of Mind Routine Insights** | Daily duration charts and wellness monitoring logs. |

