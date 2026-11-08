# WSG-01 Bluetooth Low Energy (BLE) Communication Protocol

**Document Version:** 1.0.0  
**Target Hardware:** ESP32-WROOM-32 (Arduino Framework)  
**Target Client:** React Native / Expo Application (`react-native-ble-plx`)  
**Firmware Version:** `v1.2.0-esp32`  
**Protocol Version:** `1`

---

## 1. Overview & Architecture

The Washroom Safety Guardian (WSG-01) communicates locally over Bluetooth Low Energy (BLE) using a custom GATT service. All communication is structured as UTF-8 encoded JSON payloads.

```
+-------------------------------------------------------+
|                 React Native Client                   |
|   (Single Source of Truth: app/src/services/protocol) |
+-------------------------------------------------------+
                           |
             BLE GATT (MTU 247 bytes)
                           |
+-------------------------------------------------------+
|               ESP32 Peripheral Server                 |
|   Service: 4fafc201-1fb5-459e-8fcc-c5c9c331914b       |
+-------------------------------------------------------+
```

### Protocol Versioning
- **`protocol`** (Integer): Defines the wire protocol schema version. Currently `1`.
- **`fw`** (String): Firmware semantic version string (e.g. `"v1.2.0-esp32"`).
- **Minimum App Requirement:** The mobile application requires `protocol >= 1`. If the device returns a protocol version lower than expected, the application surfaces:
  > *"Device firmware update needed"*

---

## 2. MTU & Payload Size Specification

- **Negotiated MTU:** Up to **247 bytes** (standard BLE 4.2 / 5.0 MTU limit).
- **Effective ATT Data Payload:** $247 - 3\text{ (ATT Header)} = \mathbf{244\text{ bytes}}$ per packet.
- **Fragmentation / Chunking:**
  - Payloads exceeding 244 bytes (e.g., Wi-Fi scan result batches or circular escalation history buffers) are chunked across multiple notification packets.
  - The client buffers incoming fragments until valid matching terminating JSON tokens (`}` or `]`) are received before parsing.
  - Payloads must never exceed 4096 bytes total.

---

## 3. GATT Service & Characteristics

**Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b`

| Characteristic | UUID | Properties | Purpose |
| :--- | :--- | :--- | :--- |
| **COMMAND** *(PROVISION)* | `beb5483e-36e1-4688-b7f5-ea07361b26a8` | `WRITE` | Client-to-Device commands (Wi-Fi setup, status queries, tests, config) |
| **STATUS** | `beb5483e-36e1-4688-b7f5-ea07361b26a9` | `READ`, `NOTIFY` | Device-to-Client command replies, Wi-Fi status transitions, scan lists |
| **EVENT** | `beb5483e-36e1-4688-b7f5-ea07361b26aa` | `READ`, `NOTIFY` | Real-time emergency events, test alerts, cancellation notices, escalation history |
| **CONFIG** | `beb5483e-36e1-4688-b7f5-ea07361b26ab` | `READ`, `WRITE`, `NOTIFY` | Escalation timer thresholds, alarm volume, and heartbeat intervals |

---

## 4. Command & Response Specifications

Commands are written as JSON strings to the **COMMAND** characteristic (`...26a8`). Replies and state changes arrive as notifications on the **STATUS** characteristic (`...26a9`) or **EVENT** characteristic (`...26aa`).

### 4.1. `GET_STATUS` (or `GET_WIFI_STATUS`)
Queries the device's current Wi-Fi connection, IP, saved credentials, firmware, and protocol version.

- **Request Payload (COMMAND):**
  ```json
  { "cmd": "GET_STATUS" }
  ```

- **Reply: Wi-Fi Connected (STATUS notification):**
  ```json
  {
    "type": "status",
    "status": "CONNECTED",
    "state": "WIFI_CONNECTED",
    "trigger": "wifi",
    "source": "device",
    "is_test": false,
    "ssid": "Home-Network-2.4G",
    "ip": "192.168.1.145",
    "model": "WSG-01",
    "protocol": 1,
    "fw": "v1.2.0-esp32"
  }
  ```

- **Reply: Wi-Fi Disconnected / Awaiting Setup (STATUS notification):**
  ```json
  {
    "type": "status",
    "status": "DISCONNECTED",
    "state": "WIFI_DISCONNECTED",
    "trigger": "wifi",
    "source": "device",
    "is_test": false,
    "model": "WSG-01",
    "saved": "Home-Network-2.4G",
    "protocol": 1,
    "fw": "v1.2.0-esp32"
  }
  ```

---

### 4.2. `PROV_WIFI`
Provisions the device with 2.4 GHz Wi-Fi credentials and optional device naming metadata.

- **Request Payload (COMMAND):**
  ```json
  {
    "cmd": "PROV_WIFI",
    "ssid": "Home-Network-2.4G",
    "pass": "WPA2Password123",
    "name": "Master Washroom Guardian",
    "room": "Master Washroom"
  }
  ```

- **Replies (STATUS notifications in sequence):**
  1. *Connecting initiation:*
     ```json
     { "type": "status", "status": "CONNECTING" }
     ```
  2. *Success:*
     ```json
     {
       "type": "status",
       "status": "CONNECTED",
       "state": "WIFI_CONNECTED",
       "ssid": "Home-Network-2.4G",
       "ip": "192.168.1.145",
       "model": "WSG-01",
       "protocol": 1,
       "fw": "v1.2.0-esp32"
     }
     ```
  3. *Failure (see Error Codes section for variants):*
     ```json
     {
       "type": "status",
       "status": "AUTH_FAILED",
       "state": "WIFI_FAILED",
       "trigger": "wifi",
       "source": "device"
     }
     ```

---

### 4.3. `SCAN_WIFI`
Requests an asynchronous Wi-Fi scan from the ESP32.

- **Request Payload (COMMAND):**
  ```json
  { "cmd": "SCAN_WIFI" }
  ```

- **Replies (STATUS notifications in sequence):**
  1. *Scan started:*
     ```json
     { "type": "wifi_scan", "status": "SCANNING" }
     ```
  2. *Individual networks found (streamed):*
     ```json
     {
       "type": "wifi_net",
       "ssid": "Home-Network-2.4G",
       "rssi": -58,
       "sec": 1
     }
     ```
     *(Note: `sec`: 0 = Open, 1 = WPA/WPA2/WPA3 secured)*
  3. *Scan finished:*
     ```json
     { "type": "wifi_scan", "status": "DONE", "count": 12 }
     ```

---

### 4.4. `FORGET_WIFI`
Clears stored Wi-Fi credentials from ESP32 NVS flash and disconnects from the current AP.

- **Request Payload (COMMAND):**
  ```json
  { "cmd": "FORGET_WIFI" }
  ```

- **Reply (STATUS notification):**
  ```json
  {
    "type": "status",
    "status": "DISCONNECTED",
    "state": "WIFI_DISCONNECTED",
    "trigger": "forget",
    "source": "device",
    "saved": ""
  }
  ```

---

### 4.5. `PING`
Handshake verification to validate link responsiveness.

- **Request Payload (COMMAND):**
  ```json
  { "cmd": "PING" }
  ```

- **Reply (STATUS notification):**
  ```json
  { "status": "PONG" }
  ```

---

### 4.6. `TEST_EMERGENCY`
Triggers an audible and visual test alarm on the hardware. Requires a valid pairing token.

- **Request Payload (COMMAND):**
  ```json
  {
    "cmd": "TEST_EMERGENCY",
    "token": "439281"
  }
  ```

- **Replies:**
  - **EVENT notification (`...26aa`):**
    ```json
    {
      "type": "event",
      "event": "TEST_EMERGENCY",
      "timestamp": 124590
    }
    ```
  - **STATUS notification (`...26a9`):**
    ```json
    {
      "type": "status",
      "status": "TEST_EMERGENCY",
      "state": "EMERGENCY",
      "trigger": "test",
      "source": "app",
      "is_test": true,
      "model": "WSG-01"
    }
    ```
  - **Unauthorized (if token missing or invalid):**
    ```json
    { "status": "ERROR", "error": "UNAUTHORIZED" }
    ```

---

### 4.7. `CANCEL_TEST`
Silences and cancels an active emergency test drill.

- **Request Payload (COMMAND):**
  ```json
  {
    "cmd": "CANCEL_TEST",
    "token": "439281"
  }
  ```

- **Replies:**
  - **EVENT notification (`...26aa`):**
    ```json
    {
      "type": "event",
      "event": "TEST_CANCELLED",
      "test_cancelled": true,
      "timestamp": 125100
    }
    ```
  - **STATUS notification (`...26a9`):**
    ```json
    {
      "status": "OK",
      "test_cancelled": true
    }
    ```

---

### 4.8. `SET_ESCALATION_CONFIG` (or `SET_CONFIG`)
Sets the hardware escalation timing, alarm volume, and heartbeat intervals.

- **Request Payload (COMMAND):**
  ```json
  {
    "cmd": "SET_ESCALATION_CONFIG",
    "t1": 300,
    "repeat": 15,
    "volume": 80,
    "hb_interval": 15
  }
  ```
- **Fields:**
  - `t1` (unsigned long): Stillness threshold before initial alert chime (seconds). Default `300`.
  - `repeat` (unsigned long): Follow-up warning interval (seconds). Default `15`.
  - `volume` (0 - 100): Hardware speaker alert volume percentage. Default `80`.
  - `hb_interval` (unsigned long): Heartbeat telemetry interval (minutes). Default `15`.

- **Effect:** Persisted to ESP32 NVS flash and updated on the **CONFIG** characteristic (`...26ab`).

---

### 4.9. `GET_ESCALATION_CONFIG` (or `GET_CONFIG`)
Instructs device to refresh the **CONFIG** characteristic (`...26ab`) with current settings.

- **Request Payload (COMMAND):**
  ```json
  { "cmd": "GET_ESCALATION_CONFIG" }
  ```

- **Payload readable on CONFIG Characteristic:**
  ```json
  {
    "t1": 300,
    "repeat": 15,
    "volume": 80,
    "heartbeat_interval": 15
  }
  ```

---

### 4.10. `SET_PAIRING_TOKEN`
Stores an authorized numeric/alphanumeric pairing token for protected actions (`TEST_EMERGENCY`, `CANCEL_TEST`).

- **Request Payload (COMMAND):**
  ```json
  {
    "cmd": "SET_PAIRING_TOKEN",
    "token": "439281"
  }
  ```

---

## 5. Event Logs & Historical Telemetry

On the **EVENT** characteristic (`...26aa`), the device emits real-time alerts or circular buffer logs:

### 5.1. Real-Time Emergency Event
```json
{
  "type": "event",
  "event": "EMERGENCY",
  "trigger": "VOICE",
  "source": "device",
  "timestamp": 1729000000000,
  "deviceId": "wsg-01"
}
```

### 5.2. Circular Escalation History Buffer (Array)
Emitted as a JSON array of recent transition logs:
```json
[
  {
    "id": "log-0",
    "timestamp": 1729000010000,
    "from": "IDLE",
    "to": "STILLNESS_CHECK",
    "trigger": "RADAR_STILLNESS",
    "stillness_seconds": 300
  },
  {
    "id": "log-1",
    "timestamp": 1729000025000,
    "from": "STILLNESS_CHECK",
    "to": "ALARM",
    "trigger": "NO_RESPONSE",
    "stillness_seconds": 315
  }
]
```

---

## 6. Error Codes

When a command fails or Wi-Fi provisioning encounters an issue, the device reports structured errors:

| Error Code | Characteristic | Description | Recommended App Action |
| :--- | :--- | :--- | :--- |
| `AUTH_FAILED` | `STATUS` | Wi-Fi password was incorrect / 4-way handshake failed | Prompt user: "Incorrect Wi-Fi password." |
| `NO_SSID` | `STATUS` | Configured SSID could not be found within range (must be 2.4 GHz) | Prompt user: "Network not found. Ensure 2.4 GHz band is enabled." |
| `WIFI_TIMEOUT` | `STATUS` | Wi-Fi association timed out or DHCP failed | Prompt user: "Wi-Fi connection timed out. Check router." |
| `UNAUTHORIZED` | `STATUS` | Pairing token missing or incorrect for sensitive command | Prompt user to enter or re-generate pairing token |
| `UNKNOWN_CMD` | `STATUS` | Command string in `"cmd"` field was not recognized | Log warning; verify app protocol version |
| `INVALID_JSON` | `STATUS` | JSON deserialization failed on the device | Check payload formatting / MTU chunking |
| `FW_UPDATE_NEEDED` | *Client synthetic* | Device `protocol` integer is lower than `MIN_SUPPORTED_PROTOCOL` (1) | Show banner: *"Device firmware update needed"* |

---

## 7. App Validation & Error Handling Rules

1. **Strict Non-Crashing Guarantee:**
   All incoming messages must pass through `parseBleMessage(data)`. Malformed, truncated, or unknown payloads must be logged via `logger.warn('BLE_NOTIF', ...)` and safely dropped. They must **never throw unhandled exceptions**.
2. **Version Negotiation:**
   Whenever `protocol` is parsed from a `GET_STATUS` or other status response:
   - If `protocol < MIN_SUPPORTED_PROTOCOL_VERSION (1)`:
     - Dispatches `FW_UPDATE_NEEDED` device error.
     - Does not silently fail or crash.
3. **No Sensitive Data Logging:**
   Wi-Fi passwords and pairing tokens must **never** be logged to diagnostics, console, or storage.

