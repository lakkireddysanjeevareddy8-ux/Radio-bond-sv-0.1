/*
 * ============================================================================
 * Washroom Safety Gadget (WSG-01) - Provisioned IoT Firmware
 * Hardware:
 *   - ESP32-WROOM-32 Development Board
 *   - HLK-LD2410C 24GHz Millimeter-Wave Human Presence Radar Sensor
 *   - Emergency Push Button (GPIO 14, Active LOW with pullup)
 *   - Active Piezo Buzzer (GPIO 18)
 *   - Status Blue LED (GPIO 2)
 *
 * Core Features:
 *   1. BLE Advertising & GATT Fast Provisioning Service
 *      - Service UUID:        4fafc201-1fb5-459e-8fcc-c5c9c331914b
 *      - Provision Char UUID: beb5483e-36e1-4688-b7f5-ea07361b26a8
 *      - Status Char UUID:    beb5483e-36e1-4688-b7f5-ea07361b26a9
 *   2. Wi-Fi Auto-Connection & NVS Flash Storage
 *   3. Local HTTP REST API (Port 80)
 *      - GET /api/device/info       -> Hardware signature & sensor health
 *      - GET /api/device/telemetry  -> Live mmWave radar safety metrics
 *   4. Cloud Telemetry Dispatcher to Supabase
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
// 1. PRODUCT IDENTIFIERS & UUIDS
// ============================================================================
const char* PRODUCT_NAME      = "Washroom Safety Gadget";
const char* MODEL_NUMBER      = "WSG-01";
const char* SENSOR_TYPE       = "LD2410C";
const char* FIRMWARE_VERSION  = "v1.1.0-provisioned";

#define SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_PROVISION_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CHAR_STATUS_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26a9"

// Supabase Configuration
const char* SUPABASE_URL      = "https://xobasrolmpmvrnjcikcq.supabase.co";
const char* SUPABASE_ANON_KEY = "sb_publishable_HMCLVIpmvtvvB5G7kkIyLw_oF1Zk1OI";

// ============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ============================================================================
#define PIN_RADAR_OUT   4   // LD2410C OUT (HIGH = Human presence detected)
#define PIN_BUTTON_EMG  14  // Physical Emergency Call button (Active LOW)
#define PIN_BUZZER      18  // Audible Warning Buzzer
#define PIN_STATUS_LED  2   // Onboard Blue Status LED

// Safety Thresholds
const unsigned long STILLNESS_THRESHOLD_SEC = 25; // 25s stillness triggers wellbeing check
const unsigned long RESPONSE_TIMEOUT_SEC    = 15; // 15s to respond before emergency alert
const unsigned long TELEMETRY_INTERVAL_MS   = 3000;

// State Machine
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

// Sensor states
bool presenceDetected = false;
bool movementDetected = false;
bool emergencyActive  = false;

unsigned long stillnessStartTime = 0;
unsigned long wellbeingStartTime = 0;
unsigned long lastTelemetryTime  = 0;
unsigned long bootTime           = 0;

String deviceId = "";
String wifiSsid = "";
String wifiPass = "";

// Web server & NVS
WebServer server(80);
Preferences preferences;

// BLE Server & Characteristics
BLEServer* pBleServer = nullptr;
BLECharacteristic* pProvisionChar = nullptr;
BLECharacteristic* pStatusChar = nullptr;
bool deviceConnected = false;

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

// ============================================================================
// BLE CALLBACKS FOR PROVISIONING
// ============================================================================
class BleServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("[BLE] Mobile client connected via GATT");
  }

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("[BLE] Client disconnected. Restarting advertising...");
    pServer->startAdvertising();
  }
};

class ProvisionCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) {
    String rxValue = pCharacteristic->getValue().c_str();
    if (rxValue.length() > 0) {
      Serial.println("[BLE] Received provisioning payload");

      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, rxValue);
      if (!error) {
        const char* cmd = doc["cmd"] | "";
        if (strcmp(cmd, "PROV_WIFI") == 0) {
          const char* ssid = doc["ssid"] | "";
          const char* pass = doc["pass"] | "";

          if (strlen(ssid) > 0) {
            wifiSsid = String(ssid);
            wifiPass = String(pass);

            // Save to NVS
            preferences.begin("wsg01", false);
            preferences.putString("ssid", wifiSsid);
            preferences.putString("pass", wifiPass);
            preferences.end();

            Serial.printf("[WiFi] Saved new credentials for SSID: %s\n", ssid);
            connectToWiFi();
          }
        }
      }
    }
  }
};

// ============================================================================
// WI-FI CONNECTION
// ============================================================================
void connectToWiFi() {
  if (wifiSsid.length() == 0) {
    Serial.println("[WiFi] No saved credentials found in NVS");
    return;
  }

  Serial.printf("[WiFi] Connecting to %s...\n", wifiSsid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    String ip = WiFi.localIP().toString();
    Serial.printf("\n[WiFi] Connected! IP Address: %s\n", ip.c_str());
    digitalWrite(PIN_STATUS_LED, HIGH);
    beepBuzzer(2, 60, 60);

    // Notify BLE client of success
    if (pStatusChar) {
      StaticJsonDocument<256> resp;
      resp["status"] = "CONNECTED";
      resp["ip"] = ip;
      resp["model"] = MODEL_NUMBER;
      String jsonOut;
      serializeJson(resp, jsonOut);
      pStatusChar->setValue(jsonOut.c_str());
      pStatusChar->notify();
    }
  } else {
    Serial.println("\n[WiFi] Connection timeout");
    if (pStatusChar) {
      pStatusChar->setValue("{\"status\":\"AUTH_FAILED\"}");
      pStatusChar->notify();
    }
  }
}

// ============================================================================
// LOCAL REST API ENDPOINTS
// ============================================================================
void setupRestApi() {
  // CORS Headers for browser web apps
  server.enableCORS(true);

  // 1. Device Info Endpoint
  server.on("/api/device/info", HTTP_GET, []() {
    StaticJsonDocument<512> doc;
    doc["deviceType"] = PRODUCT_NAME;
    doc["deviceId"]   = deviceId;
    doc["model"]      = MODEL_NUMBER;
    doc["firmware"]   = FIRMWARE_VERSION;
    doc["sensor"]     = SENSOR_TYPE;
    doc["status"]     = "ONLINE";
    doc["ipAddress"]  = WiFi.localIP().toString();
    doc["uptime"]     = (millis() - bootTime) / 1000;

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

  // 2. Real-time Telemetry Endpoint
  server.on("/api/device/telemetry", HTTP_GET, []() {
    unsigned long currentStillSec = (stillnessStartTime > 0 && presenceDetected) 
                                      ? (millis() - stillnessStartTime) / 1000 
                                      : 0;
    StaticJsonDocument<512> doc;
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
  Serial.println("[HTTP] REST API server started on port 80");
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  bootTime = millis();

  pinMode(PIN_RADAR_OUT, INPUT);
  pinMode(PIN_BUTTON_EMG, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Generate Unique Device ID based on MAC
  uint64_t chipid = ESP.getEfuseMac();
  char idBuffer[32];
  snprintf(idBuffer, sizeof(idBuffer), "wsg01-%04X%08X", (uint16_t)(chipid >> 32), (uint32_t)chipid);
  deviceId = String(idBuffer);

  Serial.println("\n==========================================");
  Serial.printf("  %s (%s)\n", PRODUCT_NAME, MODEL_NUMBER);
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

  Serial.printf("[BLE] Advertising started as: %s\n", bleDeviceName.c_str());

  // 2. Load stored Wi-Fi credentials
  preferences.begin("wsg01", true);
  wifiSsid = preferences.getString("ssid", "");
  wifiPass = preferences.getString("pass", "");
  preferences.end();

  if (wifiSsid.length() > 0) {
    connectToWiFi();
  }

  // 3. Start Local REST API
  setupRestApi();
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  server.handleClient();
  unsigned long currentMillis = millis();

  // 1. Read Physical Sensor Inputs
  presenceDetected = (digitalRead(PIN_RADAR_OUT) == HIGH);
  bool emergencyButtonPressed = (digitalRead(PIN_BUTTON_EMG) == LOW);

  if (emergencyButtonPressed && currentState != STATE_EMERGENCY) {
    Serial.println("[ALERT] Physical emergency button pressed!");
    currentState = STATE_EMERGENCY;
    emergencyActive = true;
  }

  // 2. Safety State Machine
  unsigned long stillnessDurationSec = 0;
  switch (currentState) {
    case STATE_IDLE:
      digitalWrite(PIN_BUZZER, LOW);
      if (presenceDetected) {
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
        currentState = STATE_EMERGENCY;
        emergencyActive = true;
      }
      break;

    case STATE_EMERGENCY:
      digitalWrite(PIN_BUZZER, (currentMillis / 400) % 2 == 0 ? HIGH : LOW);
      digitalWrite(PIN_STATUS_LED, (currentMillis / 200) % 2 == 0 ? HIGH : LOW);
      if (!presenceDetected) {
        currentState = STATE_IDLE;
        emergencyActive = false;
        digitalWrite(PIN_BUZZER, LOW);
      }
      break;
  }

  delay(20);
}
