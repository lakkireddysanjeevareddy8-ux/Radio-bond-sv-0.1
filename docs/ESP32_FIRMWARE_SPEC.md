# ESP32 Firmware Specification — Washroom Safety Gadget (WSG-01)

## Overview
The Washroom Safety Gadget (WSG-01) runs on an **Espressif ESP32-WROOM-32** paired with an **HLK-LD2410C 24GHz Millimeter-Wave Human Presence Radar Sensor**. It supports commercial BLE GATT fast provisioning, Wi-Fi auto-connection, a local HTTP REST health API, and cloud telemetry.

---

## 1. Hardware Pinout

| ESP32 GPIO | Connected Component | Description |
| :--- | :--- | :--- |
| **GPIO 4** | **HLK-LD2410C OUT** | Digital human presence detection (`HIGH` = Occupied, `LOW` = Clear) |
| **GPIO 14** | **Emergency Button** | Physical momentary push button (`Active LOW` with internal pull-up) |
| **GPIO 18** | **Active Piezo Buzzer** | Wellbeing chimes & high-decibel audible emergency alarms |
| **GPIO 2** | **Onboard Blue LED** | Power & pairing status indicator |
| **UART0 (TX0/RX0)** | **USB-C Interface** | Serial logging & Arduino flashing (115200 baud) |

---

## 2. Bluetooth Low Energy (BLE) Provisioning Protocol

- **Advertising Name**: `WSG-01-XXXX` (where `XXXX` are the last 4 characters of the unique MAC device ID)
- **BLE Service UUID**: `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
- **Provisioning Characteristic UUID**: `beb5483e-36e1-4688-b7f5-ea07361b26a8` (`PROPERTY_WRITE`)
- **Status Characteristic UUID**: `beb5483e-36e1-4688-b7f5-ea07361b26a9` (`PROPERTY_READ | PROPERTY_NOTIFY`)

### Provisioning Payload (JSON)
Transmitted from mobile / web client to the Provisioning Characteristic:
```json
{
  "cmd": "PROV_WIFI",
  "ssid": "MyHome_2.4G",
  "pass": "NetworkSecret123",
  "name": "Washroom Safety Gadget",
  "room": "Master Bathroom"
}
```

### Status Notification (JSON)
Notified by the ESP32 upon router connection:
```json
{
  "status": "CONNECTED",
  "ip": "192.168.1.150",
  "model": "WSG-01"
}
```

---

## 3. Local REST API Endpoints (Port 80)

### 1. Device Info Verification
- **Endpoint**: `GET /api/device/info`
- **Response**:
```json
{
  "deviceType": "Washroom Safety Gadget",
  "deviceId": "wsg01-381FF315",
  "model": "WSG-01",
  "firmware": "v1.1.0-provisioned",
  "sensor": "LD2410C",
  "status": "ONLINE",
  "ipAddress": "192.168.1.150",
  "uptime": 1240
}
```

### 2. Live Telemetry
- **Endpoint**: `GET /api/device/telemetry`
- **Response**:
```json
{
  "device_id": "wsg01-381FF315",
  "presence": true,
  "movement": true,
  "stillness_seconds": 4,
  "state": "PERSON_PRESENT",
  "wifi_rssi": -48,
  "uptime": 1240,
  "firmware_version": "v1.1.0-provisioned"
}
```

---

## 4. How to Flash the ESP32

1. Open Arduino IDE or PlatformIO.
2. Install the **ESP32 by Espressif Systems** board package (`v2.0.11` or later).
3. Install required library:
   - **ArduinoJson** (v6.x or v7.x by Benoit Blanchon)
4. Select Board: **ESP32 Dev Module**
5. Open file: [`firmware/WashroomSafety_ESP32/WashroomSafety_ESP32_Provisioned.ino`](file:///c:/Users/Sanjeeva%20Reddy/Downloads/Radio-bond-sv-0.1/firmware/WashroomSafety_ESP32/WashroomSafety_ESP32_Provisioned.ino)
6. Connect your ESP32 via USB-C, choose the COM port, and click **Upload**.
