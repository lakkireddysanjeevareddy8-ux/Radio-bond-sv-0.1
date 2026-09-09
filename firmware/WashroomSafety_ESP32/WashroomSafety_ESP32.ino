/*
 * ============================================================================
 * Washroom Safety Gadget (WSG-01) - Production Firmware
 * Hardware:
 *   - ESP32 Development Board (ESP32-WROOM-32)
 *   - HLK-LD2410 / LD2410C Human Presence Radar Sensor (GPIO 4)
 *   - Physical Emergency Button (GPIO 14, Active LOW with pull-up)
 *   - Active Piezo Buzzer (GPIO 18)
 *   - Status Blue LED (GPIO 2)
 *
 * Capabilities:
 *   1. BLE Fast Provisioning (GATT Server)
 *      - Service UUID:        4fafc201-1fb5-459e-8fcc-c5c9c331914b
 *      - Provision Char UUID: beb5483e-36e1-4688-b7f5-ea07361b26a8 (WRITE)
 *      - Status Char UUID:    beb5483e-36e1-4688-b7f5-ea07361b26a9 (READ | NOTIFY)
 *   2. Real Wi-Fi Association & DHCP Verification (No simulation)
 *      - Connection attempt executed asynchronously in loop() to keep BLE stack responsive
 *      - Error classification: CONNECTED, AUTH_FAILED, SSID_NOT_FOUND, TIMEOUT
 *      - Real DHCP IPv4 returned to mobile app via BLE status characteristic
 *   3. Persistent Storage (NVS / Preferences)
 *      - Automatically reconnects to router on boot
 *   4. Local HTTP REST API (Port 80)
 *      - GET /api/device/info
 *      - GET /api/device/telemetry
 *   5. Supabase HTTPS Cloud Telemetry & Emergency Alerts
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ============================================================================
// 1. PRODUCT IDENTIFIERS & GATT UUIDS
// ============================================================================
const char* PRODUCT_NAME      = "Washroom Safety Gadget";
const char* MODEL_NUMBER      = "WSG-01";
const char* SENSOR_TYPE       = "LD2410C";
const char* FIRMWARE_VERSION  = "v1.2.0-esp32";

#define SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_PROVISION_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CHAR_STATUS_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26a9"

// Supabase Configuration
const char* SUPABASE_URL      = "https://xobasrolmpmvrnjcikcq.supabase.co";
const char* SUPABASE_ANON_KEY = "sb_publishable_HMCLVIpmvtvvB5G7kkIyLw_oF1Zk1OI";

// ============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ============================================================================
#define PIN_RADAR_OUT   4   // LD2410 / PIR Sensor Digital OUT (HIGH = Presence detected)
#define PIN_BUTTON_EMG  14  // Emergency Push Button (Active LOW with internal pull-up)
#define PIN_BUZZER      18  // Active Buzzer for warning tone & alarms
#define PIN_STATUS_LED  2   // Onboard Blue LED / Status indicator

// ============================================================================
// 3. SAFETY TIMING & STATE MACHINE
// ============================================================================
const unsigned long STILLNESS_THRESHOLD_SEC = 25; // Still for 25s triggers wellbeing check
const unsigned long RESPONSE_TIMEOUT_SEC    = 15; // 15s to respond before emergency alert
const unsigned long TELEMETRY_INTERVAL_MS   = 3000; // Supabase sync interval (3s)

enum SafetyState {
  STATE_IDLE,
  STATE_PERSON_PRESENT,
  STATE_MOVING,
  STATE_STILL_MONITORING,
  STATE_CHECKING_WELLBEING,
  STATE_WAITING_FOR_RESPONSE,
  STATE_EMERGENCY
};

SafetyState currentState = STATE_IDLE;

// Timing variables
unsigned long stillnessStartTime = 0;
unsigned long wellbeingStartTime = 0;
unsigned long lastTelemetryTime  = 0;
unsigned long bootTime           = 0;

// Sensor states
bool presenceDetected = false;
bool movementDetected = false;
bool emergencyActive  = false;

String deviceId = "";

// ============================================================================
// 4. WI-FI & PROVISIONING STATE MACHINE
// ============================================================================
enum WiFiConnState {
  WIFI_IDLE,
  WIFI_CONNECTING,
  WIFI_CONNECTED,
  WIFI_FAILED
};

WiFiConnState wifiConnState = WIFI_IDLE;
unsigned long wifiConnectStartTime = 0;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 25000; // 25s timeout for router DHCP

// Credentials queue
bool pendingWiFiTrigger = false;
String activeSsid = "";
String activePass = "";
String customDeviceName = "";
String customRoom = "";

// Peripherals & Services
WebServer server(80);
Preferences preferences;

BLEServer* pBleServer = nullptr;
BLECharacteristic* pProvisionChar = nullptr;
BLECharacteristic* pStatusChar = nullptr;
bool bleClientConnected = false;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const char* getStateString(SafetyState state) {
  switch (state) {
    case STATE_IDLE:                 return "IDLE";
    case STATE_PERSON_PRESENT:       return "PERSON_PRESENT";
    case STATE_MOVING:               return "MOVING";
    case STATE_STILL_MONITORING:     return "STILL_MONITORING";
    case STATE_CHECKING_WELLBEING:   return "CHECKING_WELLBEING";
    case STATE_WAITING_FOR_RESPONSE: return "WAITING_FOR_RESPONSE";
    case STATE_EMERGENCY:            return "EMERGENCY";
    default:                         return "UNKNOWN";
  }
}

void beepBuzzer(int times, int durationMs, int pauseMs) {
  for (int i = 0; i < times; i++) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(durationMs);
    digitalWrite(PIN_BUZZER, LOW);
    if (i < times - 1) delay(pauseMs);
  }
}

const unsigned long RECONNECT_INTERVAL_MS = 6000;
unsigned long lastReconnectAttemptTime = 0;

// Forward declaration
void reportCurrentStatus();

// ============================================================================
// BLE CALLBACKS
// ============================================================================
class BleServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    bleClientConnected = true;
    Serial.println("[BLE] Mobile client connected via GATT");
    // Immediately report actual current Wi-Fi state upon BLE handshake
    reportCurrentStatus();
  }

  void onDisconnect(BLEServer* pServer) {
    bleClientConnected = false;
    Serial.println("[BLE] Client disconnected. Restarting BLE advertising...");
    pServer->startAdvertising();
  }
};

class ProvisionCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    String rxValue = pCharacteristic->getValue().c_str();
    if (rxValue.length() == 0) return;

    Serial.printf("[BLE] Received provisioning payload (%d bytes)\n", rxValue.length());

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif

    DeserializationError error = deserializeJson(doc, rxValue);
    if (error) {
      Serial.printf("[BLE] JSON parse error: %s\n", error.c_str());
      return;
    }

    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "PROV_WIFI") == 0) {
      const char* ssid = doc["ssid"] | "";
      const char* pass = doc["pass"] | "";
      const char* name = doc["name"] | "";
      const char* room = doc["room"] | "";

      if (strlen(ssid) > 0) {
        activeSsid = String(ssid);
        activePass = String(pass);
        customDeviceName = String(name);
        customRoom = String(room);

        // Queue connection in loop() so BLE task is NOT blocked
        pendingWiFiTrigger = true;
        Serial.printf("[BLE] Queued Wi-Fi connection to SSID: \"%s\"\n", ssid);
      }
    } else if (strcmp(cmd, "GET_STATUS") == 0 || strcmp(cmd, "GET_WIFI_STATUS") == 0) {
      reportCurrentStatus();
    } else if (strcmp(cmd, "DISCONNECT_WIFI") == 0) {
      WiFi.disconnect(true);
      wifiConnState = WIFI_FAILED;
      reportCurrentStatus();
    }
  }
};

// ============================================================================
// NON-BLOCKING WI-FI STATE MACHINE
// ============================================================================
void reportCurrentStatus() {
  if (!pStatusChar) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument resp;
#else
  StaticJsonDocument<256> resp;
#endif

  if (WiFi.status() == WL_CONNECTED) {
    IPAddress ip = WiFi.localIP();
    if (ip != IPAddress(0, 0, 0, 0)) {
      resp["status"] = "CONNECTED";
      resp["ip"]     = ip.toString();
      resp["ssid"]   = WiFi.SSID();
      resp["rssi"]   = WiFi.RSSI();
    } else {
      resp["status"] = "CONNECTING";
    }
  } else if (wifiConnState == WIFI_CONNECTING) {
    resp["status"] = "CONNECTING";
  } else {
    resp["status"] = "DISCONNECTED";
  }

  resp["model"] = MODEL_NUMBER;
  String jsonOut;
  serializeJson(resp, jsonOut);
  pStatusChar->setValue(jsonOut.c_str());
  pStatusChar->notify();
  Serial.printf("[BLE] Reported current Wi-Fi status: %s\n", jsonOut.c_str());
}

void initiateWiFiConnection(const String& ssid, const String& pass) {
  Serial.printf("\n[WiFi] Initiating hardware connection to: \"%s\"...\n", ssid.c_str());

  // Notify BLE client that attempt has begun
  if (pStatusChar) {
    pStatusChar->setValue("{\"status\":\"CONNECTING\"}");
    pStatusChar->notify();
  }

  // Disconnect any existing link cleanly
  WiFi.disconnect(true, true);
  delay(100);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  wifiConnectStartTime = millis();
  wifiConnState = WIFI_CONNECTING;
}

void processWiFiStateMachine() {
  unsigned long now = millis();

  // 1. Actively monitor connection health: Detect router powered off or link lost (Acceptance Test 3)
  if (wifiConnState == WIFI_CONNECTED) {
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("\n[WiFi] Connection lost! Router powered off or out of range.");
      wifiConnState = WIFI_FAILED;
      digitalWrite(PIN_STATUS_LED, LOW);
      reportCurrentStatus();
      lastReconnectAttemptTime = now;
    }
    return;
  }

  // 2. Background Auto-Reconnect when router is restored (Acceptance Test 4)
  if (wifiConnState == WIFI_FAILED && activeSsid.length() > 0) {
    if (now - lastReconnectAttemptTime >= RECONNECT_INTERVAL_MS) {
      lastReconnectAttemptTime = now;
      Serial.printf("[WiFi] Auto-reconnecting to stored router: \"%s\"...\n", activeSsid.c_str());
      initiateWiFiConnection(activeSsid, activePass);
      return;
    }
  }

  if (wifiConnState != WIFI_CONNECTING) return;

  // Blink Status LED while actively attempting to connect
  digitalWrite(PIN_STATUS_LED, (millis() / 200) % 2 == 0 ? HIGH : LOW);

  wl_status_t status = WiFi.status();

  // 1. Success case: Connected and DHCP assigned real IP
  if (status == WL_CONNECTED) {
    IPAddress ip = WiFi.localIP();
    if (ip != IPAddress(0, 0, 0, 0)) {
      wifiConnState = WIFI_CONNECTED;
      digitalWrite(PIN_STATUS_LED, HIGH);
      beepBuzzer(2, 80, 60); // Audio confirmation

      String ipStr = ip.toString();
      Serial.printf("\n[WiFi] Connected successfully to router!\n");
      Serial.printf("[WiFi] Assigned IP Address: %s\n", ipStr.c_str());
      Serial.printf("[WiFi] Signal RSSI: %d dBm\n", WiFi.RSSI());

      // Persist verified credentials to NVS
      preferences.begin("wsg01", false);
      preferences.putString("ssid", WiFi.SSID());
      preferences.putString("pass", activePass);
      if (customDeviceName.length() > 0) preferences.putString("name", customDeviceName);
      if (customRoom.length() > 0) preferences.putString("room", customRoom);
      preferences.end();
      Serial.println("[NVS] Credentials securely stored.");

      // Send real hardware confirmation over BLE status characteristic
      if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument resp;
#else
        StaticJsonDocument<256> resp;
#endif
        resp["status"] = "CONNECTED";
        resp["ip"]     = ipStr;
        resp["ssid"]   = WiFi.SSID();
        resp["model"]  = MODEL_NUMBER;
        resp["rssi"]   = WiFi.RSSI();

        String jsonOut;
        serializeJson(resp, jsonOut);
        pStatusChar->setValue(jsonOut.c_str());
        pStatusChar->notify();
        Serial.printf("[BLE] Sent status confirmation to app: %s\n", jsonOut.c_str());
      }
      return;
    }
  }

  // 2. Authentication Failure (Wrong password)
  if (status == WL_CONNECT_FAILED) {
    wifiConnState = WIFI_FAILED;
    digitalWrite(PIN_STATUS_LED, LOW);
    beepBuzzer(3, 150, 80);
    Serial.println("\n[WiFi] Connection failed: Incorrect Wi-Fi password (WL_CONNECT_FAILED)");

    if (pStatusChar) {
      pStatusChar->setValue("{\"status\":\"AUTH_FAILED\",\"message\":\"Incorrect Wi-Fi password\"}");
      pStatusChar->notify();
    }
    return;
  }

  // 3. Network Out of Range
  if (status == WL_NO_SSID_AVAIL) {
    wifiConnState = WIFI_FAILED;
    digitalWrite(PIN_STATUS_LED, LOW);
    Serial.println("\n[WiFi] Connection failed: Network SSID not found in range (WL_NO_SSID_AVAIL)");

    if (pStatusChar) {
      pStatusChar->setValue("{\"status\":\"SSID_NOT_FOUND\",\"message\":\"Network not found in range\"}");
      pStatusChar->notify();
    }
    return;
  }

  // 4. Timeout case
  if (millis() - wifiConnectStartTime >= WIFI_CONNECT_TIMEOUT_MS) {
    wifiConnState = WIFI_FAILED;
    digitalWrite(PIN_STATUS_LED, LOW);
    Serial.printf("\n[WiFi] Connection timed out after %lu ms\n", WIFI_CONNECT_TIMEOUT_MS);

    WiFi.disconnect(true);

    if (pStatusChar) {
      pStatusChar->setValue("{\"status\":\"TIMEOUT\",\"message\":\"Wi-Fi connection timed out\"}");
      pStatusChar->notify();
    }
    return;
  }
}

// ============================================================================
// LOCAL REST API ENDPOINTS (PORT 80)
// ============================================================================
void setupRestApi() {
  server.enableCORS(true);

  // 1. Device Info Endpoint
  server.on("/api/device/info", HTTP_GET, []() {
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif
    doc["deviceType"] = PRODUCT_NAME;
    doc["deviceId"]   = deviceId;
    doc["model"]      = MODEL_NUMBER;
    doc["firmware"]   = FIRMWARE_VERSION;
    doc["sensor"]     = SENSOR_TYPE;
    doc["status"]     = (WiFi.status() == WL_CONNECTED) ? "ONLINE" : "OFFLINE";
    doc["ipAddress"]  = WiFi.localIP().toString();
    doc["uptime"]     = (millis() - bootTime) / 1000;
    doc["wifi_ssid"]  = WiFi.SSID();
    doc["rssi"]       = WiFi.RSSI();

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

  // 2. Real-time Telemetry Endpoint
  server.on("/api/device/telemetry", HTTP_GET, []() {
    unsigned long currentStillSec = (stillnessStartTime > 0 && presenceDetected)
                                      ? (millis() - stillnessStartTime) / 1000
                                      : 0;
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif
    doc["device_id"]         = deviceId;
    doc["presence"]          = presenceDetected;
    doc["movement"]          = movementDetected;
    doc["stillness_seconds"] = currentStillSec;
    doc["state"]             = getStateString(currentState);
    doc["wifi_rssi"]         = WiFi.RSSI();
    doc["uptime"]            = (millis() - bootTime) / 1000;
    doc["firmware_version"]  = FIRMWARE_VERSION;

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

  server.begin();
  Serial.println("[HTTP] REST API server listening on port 80");
}

// ============================================================================
// SUPABASE HTTPS CLOUD TELEMETRY & EMERGENCY ALERTS
// ============================================================================
void sendTelemetryToSupabase(SafetyState state, unsigned long stillnessSec) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // Skip certificate validation for rapid embedded sync

  HTTPClient https;
  String endpoint = String(SUPABASE_URL) + "/rest/v1/telemetry";

  if (https.begin(client, endpoint)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    https.addHeader("Prefer", "return=minimal");

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif
    doc["device_id"]         = deviceId;
    doc["presence"]          = presenceDetected;
    doc["movement"]          = movementDetected;
    doc["stillness_seconds"] = stillnessSec;
    doc["state"]             = getStateString(state);
    doc["wifi_rssi"]         = WiFi.RSSI();
    doc["uptime"]            = (millis() - bootTime) / 1000;
    doc["firmware_version"]  = FIRMWARE_VERSION;

    String requestBody;
    serializeJson(doc, requestBody);

    int httpCode = https.POST(requestBody);
    if (httpCode > 0) {
      Serial.printf("[Supabase] Telemetry syncd | State: %s | HTTP: %d\n",
                    getStateString(state), httpCode);
    }
    https.end();
  }
}

void sendEmergencyAlert(const char* trigger) {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient https;
  String endpoint = String(SUPABASE_URL) + "/rest/v1/emergencies";

  if (https.begin(client, endpoint)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    https.addHeader("Prefer", "return=minimal");

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<256> doc;
#endif
    doc["device_id"] = deviceId;
    doc["trigger"]   = trigger;
    doc["status"]    = "ACTIVE";

    String requestBody;
    serializeJson(doc, requestBody);

    int httpCode = https.POST(requestBody);
    Serial.printf("[Supabase Emergency] Trigger: %s | HTTP: %d\n", trigger, httpCode);
    https.end();
  }
}

// ============================================================================
// ARDUINO SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  bootTime = millis();

  // Pin modes
  pinMode(PIN_RADAR_OUT, INPUT);
  pinMode(PIN_BUTTON_EMG, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Derive unique Device ID from hardware MAC
  uint64_t chipid = ESP.getEfuseMac();
  char idBuffer[32];
  snprintf(idBuffer, sizeof(idBuffer), "wsg01-%04X%08X", (uint16_t)(chipid >> 32), (uint32_t)chipid);
  deviceId = String(idBuffer);

  Serial.println("\n==========================================");
  Serial.printf("  %s (%s)\n", PRODUCT_NAME, MODEL_NUMBER);
  Serial.printf("  Firmware: %s\n", FIRMWARE_VERSION);
  Serial.printf("  Device ID: %s\n", deviceId.c_str());
  Serial.println("==========================================");

  // 1. Initialize BLE GATT Server
  String bleDeviceName = "WSG-01-" + deviceId.substring(deviceId.length() - 4);
  BLEDevice::init(bleDeviceName.c_str());
  pBleServer = BLEDevice::createServer();
  pBleServer->setCallbacks(new BleServerCallbacks());

  BLEService* pService = pBleServer->createService(SERVICE_UUID);

  pProvisionChar = pService->createCharacteristic(
    CHAR_PROVISION_UUID,
    BLECharacteristic::PROPERTY_WRITE
  );
  pProvisionChar->setCallbacks(new ProvisionCallbacks());

  pStatusChar = pService->createCharacteristic(
    CHAR_STATUS_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pStatusChar->addDescriptor(new BLE2902());

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.printf("[BLE] Fast Provisioning Advertising as: %s\n", bleDeviceName.c_str());

  // 2. Load Stored Wi-Fi Credentials & Auto-Connect
  preferences.begin("wsg01", true);
  String savedSsid = preferences.getString("ssid", "");
  String savedPass = preferences.getString("pass", "");
  preferences.end();

  if (savedSsid.length() > 0) {
    Serial.printf("[NVS] Stored Wi-Fi network found: \"%s\". Auto-connecting...\n", savedSsid.c_str());
    activeSsid = savedSsid;
    activePass = savedPass;
    initiateWiFiConnection(savedSsid, savedPass);
  } else {
    Serial.println("[NVS] No stored Wi-Fi credentials. Ready for BLE provisioning.");
  }

  // 3. Start Local REST API
  setupRestApi();
}

// ============================================================================
// MAIN LOOP & STATE MACHINE
// ============================================================================
void loop() {
  server.handleClient();
  unsigned long currentMillis = millis();

  // 1. Process Queued Wi-Fi Provisioning
  if (pendingWiFiTrigger) {
    pendingWiFiTrigger = false;
    initiateWiFiConnection(activeSsid, activePass);
  }

  // 2. Drive Non-blocking Wi-Fi State Machine
  processWiFiStateMachine();

  // 3. Read Hardware Sensors
  presenceDetected = (digitalRead(PIN_RADAR_OUT) == HIGH);
  bool emergencyButtonPressed = (digitalRead(PIN_BUTTON_EMG) == LOW);

  // Highest priority: Emergency Button
  if (emergencyButtonPressed && currentState != STATE_EMERGENCY) {
    Serial.println("[ALERT] Emergency physical button pressed!");
    currentState = STATE_EMERGENCY;
    emergencyActive = true;
    sendEmergencyAlert("BUTTON");
  }

  // 4. Washroom Safety State Machine
  unsigned long stillnessDurationSec = 0;

  switch (currentState) {
    case STATE_IDLE:
      if (wifiConnState != WIFI_CONNECTING) {
        digitalWrite(PIN_STATUS_LED, (WiFi.status() == WL_CONNECTED) ? HIGH : LOW);
      }
      digitalWrite(PIN_BUZZER, LOW);
      if (presenceDetected) {
        Serial.println("[Safety] Human presence detected -> PERSON_PRESENT");
        currentState = STATE_PERSON_PRESENT;
        movementDetected = true;
        stillnessStartTime = currentMillis;
      }
      break;

    case STATE_PERSON_PRESENT:
    case STATE_MOVING:
      if (!presenceDetected) {
        currentState = STATE_IDLE;
        movementDetected = false;
        stillnessStartTime = 0;
      } else {
        movementDetected = true;
        currentState = STATE_MOVING;
        stillnessStartTime = currentMillis;
      }
      break;

    case STATE_STILL_MONITORING:
      if (!presenceDetected) {
        currentState = STATE_IDLE;
      } else if (movementDetected) {
        currentState = STATE_MOVING;
      } else {
        stillnessDurationSec = (currentMillis - stillnessStartTime) / 1000;
        if (stillnessDurationSec >= STILLNESS_THRESHOLD_SEC) {
          Serial.println("[Safety] Prolonged stillness threshold reached -> CHECKING_WELLBEING");
          currentState = STATE_CHECKING_WELLBEING;
          wellbeingStartTime = currentMillis;
          beepBuzzer(3, 150, 100);
        }
      }
      break;

    case STATE_CHECKING_WELLBEING:
    case STATE_WAITING_FOR_RESPONSE:
      stillnessDurationSec = (currentMillis - stillnessStartTime) / 1000;
      if (movementDetected) {
        currentState = STATE_MOVING;
        digitalWrite(PIN_BUZZER, LOW);
      } else if ((currentMillis - wellbeingStartTime) / 1000 >= RESPONSE_TIMEOUT_SEC) {
        Serial.println("[Safety] No movement response -> Escalating to EMERGENCY!");
        currentState = STATE_EMERGENCY;
        emergencyActive = true;
        sendEmergencyAlert("NO_RESPONSE");
      }
      break;

    case STATE_EMERGENCY:
      // Rapid visual and audible alarm patterns
      digitalWrite(PIN_BUZZER, (currentMillis / 400) % 2 == 0 ? HIGH : LOW);
      digitalWrite(PIN_STATUS_LED, (currentMillis / 200) % 2 == 0 ? HIGH : LOW);
      if (!presenceDetected && !emergencyActive) {
        currentState = STATE_IDLE;
        digitalWrite(PIN_BUZZER, LOW);
      }
      break;
  }

  // 5. Periodic Supabase Telemetry Dispatch
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    sendTelemetryToSupabase(currentState, stillnessDurationSec);
  }

  delay(20);
}
