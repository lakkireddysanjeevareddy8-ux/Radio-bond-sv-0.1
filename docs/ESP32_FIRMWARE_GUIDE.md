# ESP32 Hardware Integration & Flashing Guide

This guide walks you through connecting physical hardware (ESP32, mmWave Radar, Button, Buzzer) to your **Washroom Safety Monitor** application via Supabase.

---

## 1. Hardware Bill of Materials (BOM)

| Component | Model / Type | Purpose | Recommended GPIO |
| :--- | :--- | :--- | :--- |
| **Microcontroller** | ESP32-WROOM-32 / NodeMCU ESP32 | Main CPU + Wi-Fi controller | — |
| **Presence Sensor** | HLK-LD2410 or PIR Sensor | Detects human presence & stillness | GPIO 4 (OUT) |
| **Emergency Button** | Momentary Push Button | Manual panic trigger | GPIO 14 |
| **Alarm Buzzer** | 5V / 3.3V Active Buzzer | Local wellbeing prompt & emergency alarm | GPIO 18 |
| **Indicator LED** | Onboard or External LED | Visual connection & alarm indicator | GPIO 2 |

---

## 2. Pin Wiring Diagram

```
      ESP32 Dev Board
   ┌───────────────────┐
   │                   │
   │  GPIO 4 (IN)   ◄──┼──── LD2410 Radar Sensor (OUT pin)
   │  GPIO 14 (IN)  ◄──┼──── Emergency Button ─── GND (Internal Pull-Up)
   │  GPIO 18 (OUT) ───┼──── Active Buzzer (+) ─── Buzzer (-) ─── GND
   │  GPIO 2 (OUT)  ───┼──── LED (+) [with 220Ω resistor] ─── GND
   │                   │
   │  3V3 / VIN     ───┼──── LD2410 VCC
   │  GND           ───┼──── Common Ground (Radar, Button, Buzzer)
   └───────────────────┘
```

> **Note on Radar (HLK-LD2410):**
> The LD2410 has an **OUT** pin that goes **HIGH** whenever a human is inside the washroom (even if they are breathing stationary). Connect this to **GPIO 4**.

---

## 3. Arduino IDE Setup

1. **Install ESP32 Board Package:**
   - In Arduino IDE, go to **File ➔ Preferences**.
   - In *Additional Board Manager URLs*, paste:
     ```text
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to **Tools ➔ Board ➔ Boards Manager**, search for `esp32` by Espressif Systems, and click **Install**.

2. **Install ArduinoJson Library:**
   - Go to **Sketch ➔ Include Library ➔ Manage Libraries...**
   - Search for **`ArduinoJson`** (by Benoit Blanchon).
   - Install the latest version (v6 or v7).

---

## 4. Configuring the Firmware

Open [`firmware/WashroomSafety_ESP32/WashroomSafety_ESP32.ino`](file:///c:/Users/Sanjeeva%20Reddy/Downloads/Radio-bond-sv-0.1/firmware/WashroomSafety_ESP32/WashroomSafety_ESP32.ino):

1. **Wi-Fi Credentials:**
   ```cpp
   const char* WIFI_SSID     = "Your_Home_WiFi";
   const char* WIFI_PASSWORD = "Your_WiFi_Password";
   ```

2. **Device Identifier:**
   ```cpp
   const char* DEVICE_UUID   = "demo-device-uuid"; // Matches EXPO_PUBLIC_DEVICE_UUID in the app
   ```

---

## 5. Compiling and Flashing

1. Connect your ESP32 board to your computer using a micro-USB / USB-C data cable.
2. In Arduino IDE:
   - Select **Tools ➔ Board ➔ ESP32 Arduino ➔ ESP32 Dev Module**.
   - Select **Tools ➔ Port ➔ COM...** (your ESP32 serial port).
   - Set **Upload Speed** to `921600` or `115200`.
3. Click the **Upload** arrow button (➔).
4. Open the **Serial Monitor** at **115200 baud**:
   - You will see:
     ```text
     ==========================================
       Washroom Safety Monitor - ESP32 Starting
     ==========================================
     Connecting to Wi-Fi: Your_WiFi ......
     [WiFi] Connected! IP: 192.168.1.50
     [Cloud Telemetry] State: IDLE | Stillness: 0s | HTTP: 201
     ```

---

## 6. Testing in the App

1. Open your live app: **https://radio-bond-sv-0-1-ten.vercel.app**
2. In **Settings ➔ Hardware & Data Source**:
   - Toggle **Demo Simulator Mode** to **OFF** (to switch to Live ESP32 Mode).
3. The dashboard will now reflect real-time radar presence, movements, and button alerts directly from your physical ESP32!
