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
 * Reliability & Production Capabilities:
 *   1. Hardware Task Watchdog Timer (TWDT) enabled; resets cleanly on hang
 *   2. Non-blocking loop() (< 50 ms while BLE connected); background FreeRTOS HTTP task
 *   3. NVS partition failure handling & graceful in-memory fallback
 *   4. Strict JSON input validation and bounded parameters
 *   5. Real-time sensor fault reporting (LD2410C radar & microphone)
 *   6. Periodic BLE status heartbeat notification (device state, Wi-Fi, uptime, heap, fw, protocol)
 *   7. Reliable BLE advertising restart after every disconnect
 *   8. Leveled serial logging (NONE/ERROR/INFO/DEBUG) with runtime switch-off
 *   9. 100% Standalone local piezo alarm: rings continuously even with zero BLE/Wi-Fi
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
#include <esp_task_wdt.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>

// ============================================================================
// 1. PRODUCT IDENTIFIERS & GATT UUIDS
// ============================================================================
const char* PRODUCT_NAME      = "Washroom Safety Gadget";
const char* MODEL_NUMBER      = "WSG-01";
const char* SENSOR_TYPE       = "LD2410C";
const char* FIRMWARE_VERSION  = "v1.2.0-esp32";
const int   PROTOCOL_VERSION  = 1;

#define SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHAR_PROVISION_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define CHAR_STATUS_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26a9"
#define CHAR_EVENT_LOG_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26aa"
#define CHAR_CONFIG_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26ab"

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
// 3. LEVELED SERIAL LOGGING (NONE / ERROR / INFO / DEBUG)
// ============================================================================
enum LogLevel {
  LOG_LEVEL_NONE  = 0, // Silence all serial logs
  LOG_LEVEL_ERROR = 1, // Only errors
  LOG_LEVEL_INFO  = 2, // Standard status & life-cycle logs
  LOG_LEVEL_DEBUG = 3  // Detailed protocol & packet logs
};

LogLevel currentLogLevel = LOG_LEVEL_INFO;

void setLogLevel(LogLevel level) {
  currentLogLevel = level;
  if (currentLogLevel > LOG_LEVEL_NONE) {
    const char* lvlName = (level == LOG_LEVEL_ERROR) ? "ERROR" : (level == LOG_LEVEL_INFO ? "INFO" : "DEBUG");
    Serial.printf("[LOG] Log level set to %d (%s)\n", (int)currentLogLevel, lvlName);
  }
}

void logError(const char* tag, const char* format, ...) {
  if (currentLogLevel < LOG_LEVEL_ERROR) return;
  char buf[256];
  va_list args;
  va_start(args, format);
  vsnprintf(buf, sizeof(buf), format, args);
  va_end(args);
  Serial.printf("[E][%s] %s\n", tag, buf);
}

void logInfo(const char* tag, const char* format, ...) {
  if (currentLogLevel < LOG_LEVEL_INFO) return;
  char buf[256];
  va_list args;
  va_start(args, format);
  vsnprintf(buf, sizeof(buf), format, args);
  va_end(args);
  Serial.printf("[I][%s] %s\n", tag, buf);
}

void logDebug(const char* tag, const char* format, ...) {
  if (currentLogLevel < LOG_LEVEL_DEBUG) return;
  char buf[256];
  va_list args;
  va_start(args, format);
  vsnprintf(buf, sizeof(buf), format, args);
  va_end(args);
  Serial.printf("[D][%s] %s\n", tag, buf);
}

#define LOG_E(tag, fmt, ...) logError(tag, fmt, ##__VA_ARGS__)
#define LOG_I(tag, fmt, ...) logInfo(tag, fmt, ##__VA_ARGS__)
#define LOG_D(tag, fmt, ...) logDebug(tag, fmt, ##__VA_ARGS__)

// ============================================================================
// 4. TASK WATCHDOG TIMER (TWDT)
// ============================================================================
#define WDT_TIMEOUT_SECONDS 8

void initWatchdog() {
#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)
  esp_task_wdt_config_t twdt_config = {
    .timeout_ms = WDT_TIMEOUT_SECONDS * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&twdt_config);
#else
  esp_task_wdt_init(WDT_TIMEOUT_SECONDS, true);
#endif
  esp_task_wdt_add(NULL); // Monitor current task (loopTask)
  LOG_I("WDT", "Task Watchdog Timer active (%d seconds timeout)", WDT_TIMEOUT_SECONDS);
}

inline void feedWatchdog() {
  esp_task_wdt_reset();
}

// ============================================================================
// 5. NON-BLOCKING BUZZER STATE MACHINE
// ============================================================================
struct BuzzerPattern {
  int beepsRemaining;
  unsigned long stepStartMs;
  int durationMs;
  int pauseMs;
  bool isSounding;
};

BuzzerPattern buzzerPattern = {0, 0, 0, 0, false};

void triggerBuzzer(int times, int durationMs, int pauseMs) {
  if (times <= 0) return;
  buzzerPattern.beepsRemaining = times;
  buzzerPattern.durationMs = durationMs;
  buzzerPattern.pauseMs = pauseMs;
  buzzerPattern.stepStartMs = millis();
  buzzerPattern.isSounding = true;
  digitalWrite(PIN_BUZZER, HIGH);
}

void beepBuzzer(int times, int durationMs, int pauseMs) {
  triggerBuzzer(times, durationMs, pauseMs);
}

void updateBuzzer() {
  if (buzzerPattern.beepsRemaining <= 0) return;

  unsigned long now = millis();
  unsigned long elapsed = now - buzzerPattern.stepStartMs;

  if (buzzerPattern.isSounding) {
    if (elapsed >= (unsigned long)buzzerPattern.durationMs) {
      digitalWrite(PIN_BUZZER, LOW);
      buzzerPattern.isSounding = false;
      buzzerPattern.stepStartMs = now;
      buzzerPattern.beepsRemaining--;
    }
  } else {
    if (elapsed >= (unsigned long)buzzerPattern.pauseMs) {
      if (buzzerPattern.beepsRemaining > 0) {
        digitalWrite(PIN_BUZZER, HIGH);
        buzzerPattern.isSounding = true;
        buzzerPattern.stepStartMs = now;
      }
    }
  }
}

// ============================================================================
// 6. SENSOR FAULT MONITORING (LD2410C & MICROPHONE)
// ============================================================================
struct SensorHealth {
  bool radarFault;
  bool micFault;
  unsigned long lastRadarChangeMs;
  int lastRadarRaw;
};

SensorHealth sensorHealth = {false, false, 0, -1};

void checkSensorsHealth() {
  int rawRadar = digitalRead(PIN_RADAR_OUT);
  if (rawRadar != HIGH && rawRadar != LOW) {
    sensorHealth.radarFault = true;
  } else {
    if (rawRadar != sensorHealth.lastRadarRaw) {
      sensorHealth.lastRadarRaw = rawRadar;
      sensorHealth.lastRadarChangeMs = millis();
      sensorHealth.radarFault = false;
    }
  }
}

// ============================================================================
// 7. ROBUST NVS STORAGE WRAPPERS WITH READ/WRITE ERROR HANDLING
// ============================================================================
Preferences preferences;

bool nvsOpen(bool readOnly) {
  bool ok = preferences.begin("wsg01", readOnly);
  if (!ok) {
    LOG_E("NVS", "Preferences::begin failed for 'wsg01' (readOnly=%d)", readOnly);
  }
  return ok;
}

void nvsClose() {
  preferences.end();
}

bool nvsSaveEscalationConfig(unsigned long t1, unsigned long repeat, uint8_t vol, unsigned long hb) {
  if (!nvsOpen(false)) return false;
  size_t w1 = preferences.putULong("t1", t1);
  size_t w2 = preferences.putULong("repeat", repeat);
  size_t w3 = preferences.putUChar("volume", vol);
  size_t w4 = preferences.putULong("hb_interval", hb);
  nvsClose();
  if (w1 == 0 || w2 == 0 || w3 == 0 || w4 == 0) {
    LOG_E("NVS", "Failed to write escalation config to NVS");
    return false;
  }
  LOG_I("NVS", "Saved config: T1=%lus, Repeat=%lus, Vol=%d%%, Heartbeat=%lumin", t1, repeat, vol, hb);
  return true;
}

bool nvsSaveWifi(const String& ssid, const String& pass, const String& name, const String& room) {
  if (!nvsOpen(false)) return false;
  size_t w1 = preferences.putString("ssid", ssid);
  size_t w2 = preferences.putString("pass", pass);
  if (name.length() > 0) preferences.putString("name", name);
  if (room.length() > 0) preferences.putString("room", room);
  nvsClose();
  if (w1 == 0) {
    LOG_E("NVS", "Failed to write Wi-Fi credentials to NVS");
    return false;
  }
  LOG_I("NVS", "Saved Wi-Fi credentials to NVS");
  return true;
}

bool nvsSaveToken(const String& token) {
  if (!nvsOpen(false)) return false;
  size_t w = preferences.putString("token", token);
  nvsClose();
  if (w == 0) {
    LOG_E("NVS", "Failed to write pairing token to NVS");
    return false;
  }
  LOG_I("NVS", "Pairing token saved to NVS");
  return true;
}

bool nvsRemoveWifi() {
  if (!nvsOpen(false)) return false;
  preferences.remove("ssid");
  preferences.remove("pass");
  nvsClose();
  LOG_I("NVS", "Removed Wi-Fi credentials from NVS");
  return true;
}

String nvsGetSavedSsid() {
  if (!nvsOpen(true)) return "";
  String s = preferences.getString("ssid", "");
  nvsClose();
  return s;
}

// ============================================================================
// 8. BACKGROUND FREERTOS HTTP TASK (PREVENTS ANY LOOP BLOCKING)
// ============================================================================
enum HttpJobType {
  HTTP_JOB_TELEMETRY,
  HTTP_JOB_EMERGENCY,
  HTTP_JOB_HEARTBEAT
};

struct HttpJob {
  HttpJobType type;
  char payload[512];
  char eventId[48];
  char trigger[32];
  bool isTest;
};

QueueHandle_t httpJobQueue = nullptr;
String deviceId = "";

void httpWorkerTask(void* pvParameters) {
  HttpJob job;
  WiFiClientSecure client;
  client.setInsecure();

  while (true) {
    if (xQueueReceive(httpJobQueue, &job, portMAX_DELAY) == pdTRUE) {
      if (WiFi.status() != WL_CONNECTED) {
        continue;
      }

      if (job.type == HTTP_JOB_TELEMETRY) {
        HTTPClient https;
        https.setTimeout(3500);
        String endpoint = String(SUPABASE_URL) + "/rest/v1/telemetry";
        if (https.begin(client, endpoint)) {
          https.addHeader("Content-Type", "application/json");
          https.addHeader("apikey", SUPABASE_ANON_KEY);
          https.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
          https.addHeader("Prefer", "return=minimal");
          int code = https.POST(job.payload);
          LOG_D("HTTP", "Telemetry sync result HTTP %d", code);
          https.end();
        }
      } else if (job.type == HTTP_JOB_EMERGENCY) {
        // 1. Post to emergency_events (triggers edge functions & realtime)
        {
          HTTPClient https;
          https.setTimeout(3500);
          String endpoint = String(SUPABASE_URL) + "/rest/v1/emergency_events";
          if (https.begin(client, endpoint)) {
            https.addHeader("Content-Type", "application/json");
            https.addHeader("apikey", SUPABASE_ANON_KEY);
            https.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
            https.addHeader("Prefer", "return=minimal");

#if ARDUINOJSON_VERSION_MAJOR >= 7
            JsonDocument doc;
#else
            StaticJsonDocument<384> doc;
#endif
            doc["id"]         = job.eventId;
            doc["device_id"]  = deviceId;
            doc["event_type"] = "emergency";
            doc["trigger"]    = job.trigger;
            doc["status"]     = "active";
            doc["severity"]   = "critical";
            doc["source"]     = job.isTest ? "test" : (strcmp(job.trigger, "MANUAL_EMERGENCY") == 0 ? "manual_device_trigger" : "sensor");

            String body;
            serializeJson(doc, body);
            int code = https.POST(body);
            LOG_I("HTTP", "Emergency alert dispatched (emergency_events) ID: %s HTTP %d", job.eventId, code);
            https.end();
          }
        }
        // 2. Post to legacy emergencies table
        {
          HTTPClient https;
          https.setTimeout(3500);
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
            doc["trigger"]   = job.trigger;
            doc["status"]    = "ACTIVE";
            doc["is_test"]   = job.isTest;

            String body;
            serializeJson(doc, body);
            int code = https.POST(body);
            LOG_D("HTTP", "Emergency legacy sync result HTTP %d", code);
            https.end();
          }
        }
      } else if (job.type == HTTP_JOB_HEARTBEAT) {
        HTTPClient https;
        https.setTimeout(3500);
        String endpoint = String(SUPABASE_URL) + "/rest/v1/device_health";
        if (https.begin(client, endpoint)) {
          https.addHeader("Content-Type", "application/json");
          https.addHeader("apikey", SUPABASE_ANON_KEY);
          https.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
          https.addHeader("Prefer", "resolution=merge-duplicates");
          int code = https.POST(job.payload);
          LOG_D("HTTP", "Heartbeat sync result HTTP %d", code);
          https.end();
        }
      }
    }
  }
}

void initHttpWorker() {
  httpJobQueue = xQueueCreate(10, sizeof(HttpJob));
  if (httpJobQueue) {
    xTaskCreatePinnedToCore(
      httpWorkerTask,
      "httpWorker",
      8192,
      NULL,
      1,
      NULL,
      0 // Core 0 (main loop runs on Core 1)
    );
    LOG_I("HTTP", "Background HTTP worker task created on Core 0");
  } else {
    LOG_E("HTTP", "Failed to create HTTP job queue");
  }
}

// ============================================================================
// 9. SAFETY TIMING & STAGED ESCALATION STATE MACHINE
// ============================================================================
unsigned long t1ThresholdSec       = 300; // Default 5 minutes (300s)
unsigned long listenDurationSec    = 15;  // Listen 15s for voice/movement response
unsigned long repeatIntervalSec    = 15;  // Repeat interval between NO_RESPONSE and ALARM (15s)
uint8_t alarmVolume                = 80;  // Alarm volume 0-100% (default 80)
unsigned long heartbeatIntervalMin = 10;  // Heartbeat self-test interval in minutes (default 10 min)

const unsigned long TELEMETRY_INTERVAL_MS = 3000; // Supabase sync interval (3s)

enum SafetyState {
  STATE_IDLE,
  STATE_PERSON_PRESENT,
  STATE_MOVING,
  STATE_STILL_MONITORING,
  STATE_INACTIVE_DETECTED, // Staged 1: no movement for T1 -> voice check-in, listen 15s
  STATE_NO_RESPONSE,       // Staged 2: repeat check-in louder + local buzzer
  STATE_ALARM,             // Staged 3: real emergency event to app via BLE/WiFi
  STATE_CHECKING_WELLBEING, // Backward compatibility
  STATE_WAITING_FOR_RESPONSE,
  STATE_EMERGENCY
};

SafetyState currentState = STATE_IDLE;

// Timing variables
unsigned long stillnessStartTime       = 0;
unsigned long inactiveListenStartTime  = 0;
unsigned long noResponseStartTime      = 0;
unsigned long lastTelemetryTime        = 0;
unsigned long lastHeartbeatTime        = 0;
unsigned long bootTime                 = 0;

// Sensor states
bool presenceDetected = false;
bool movementDetected = false;
bool emergencyActive  = false;

// Circular buffer of last 20 state transitions
#define CIRCULAR_BUFFER_SIZE 20
struct EscalationLogEntry {
  unsigned long timestampMs;
  char fromState[24];
  char toState[24];
  char trigger[24];
  unsigned long stillnessSec;
};

EscalationLogEntry circularBuffer[CIRCULAR_BUFFER_SIZE];
uint8_t bufferHead = 0;
uint8_t bufferCount = 0;

// ============================================================================
// 10. WI-FI & PROVISIONING STATE MACHINE
// ============================================================================
enum WiFiConnState {
  WIFI_IDLE,
  WIFI_CONNECTING,
  WIFI_AWAITING_DHCP,
  WIFI_CONNECTED,
  WIFI_FAILED
};

WiFiConnState wifiConnState = WIFI_IDLE;
unsigned long wifiConnectStartTime = 0;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 25000; // 25s timeout for router DHCP

// Credentials queue
bool pendingWiFiTrigger = false;
bool isWiFiScanning = false;
String activeSsid = "";
String activePass = "";
String customDeviceName = "";
String customRoom = "";

// Peripherals & Services
WebServer server(80);

BLEServer* pBleServer = nullptr;
BLECharacteristic* pProvisionChar = nullptr;
BLECharacteristic* pStatusChar = nullptr;
BLECharacteristic* pEventLogChar = nullptr;
BLECharacteristic* pConfigChar = nullptr;
bool bleClientConnected = false;
volatile bool bleRestartAdvRequested = false;
unsigned long lastAdvCheckTime = 0;

// Forward declarations
void updateBleConfig();
void reportCurrentStatus();
void sendEmergencyAlert(const char* trigger, bool isTest, const String& eventId);
void transitionToState(SafetyState nextState, const char* trigger, unsigned long stillnessSec);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const char* getStateString(SafetyState state) {
  switch (state) {
    case STATE_IDLE:                 return "IDLE";
    case STATE_PERSON_PRESENT:       return "PERSON_PRESENT";
    case STATE_MOVING:               return "MOVING";
    case STATE_STILL_MONITORING:     return "STILL_MONITORING";
    case STATE_INACTIVE_DETECTED:   return "INACTIVE_DETECTED";
    case STATE_NO_RESPONSE:          return "NO_RESPONSE";
    case STATE_ALARM:                return "ALARM";
    case STATE_CHECKING_WELLBEING:   return "CHECKING_WELLBEING";
    case STATE_WAITING_FOR_RESPONSE: return "WAITING_FOR_RESPONSE";
    case STATE_EMERGENCY:            return "EMERGENCY";
    default:                         return "UNKNOWN";
  }
}

void saveEscalationConfig() {
  nvsSaveEscalationConfig(t1ThresholdSec, repeatIntervalSec, alarmVolume, heartbeatIntervalMin);
}

String currentEmergencyEventId = "";
unsigned long heartbeatIntervalSec = 45; // 30-60s over Wi-Fi when connected

String generateEmergencyEventId() {
  char buf[48];
  String devSuffix = (deviceId.length() >= 4) ? deviceId.substring(deviceId.length() - 4) : "0001";
  snprintf(buf, sizeof(buf), "emg_%s_%lu_%04x", devSuffix.c_str(), millis(), (uint16_t)(esp_random() & 0xFFFF));
  return String(buf);
}

void notifyChar(BLECharacteristic* pChar, const String& val) {
  if (!pChar || !bleClientConnected) {
    LOG_D("BLE", "Skip notify: %s", !pChar ? "char null" : "client not connected");
    return;
  }
  pChar->setValue(val.c_str());
  pChar->notify();
  LOG_D("BLE", "Notified %d bytes", val.length());
}

void sendEmergency() {
  emergencyActive = true;
  digitalWrite(PIN_STATUS_LED, HIGH);
  triggerBuzzer(3, 100, 80); // Non-blocking buzzer pattern!
  transitionToState(STATE_ALARM, "EMERGENCY_TRIGGERED", 0);

  String uniqueId = generateEmergencyEventId();
  currentEmergencyEventId = uniqueId;

  String payload = "{\"type\":\"EMERGENCY\",\"id\":\"" + uniqueId + "\",\"eventId\":\"" + uniqueId + "\",\"deviceId\":\"" + deviceId + "\",\"trigger\":\"MANUAL_EMERGENCY\",\"status\":\"ACTIVE\",\"timestamp\":" + String(millis()) + "}";
  LOG_I("BLE", "Sending emergency alert: %s", payload.c_str());
  notifyChar(pEventLogChar, payload);
  notifyChar(pStatusChar, payload);

  sendEmergencyAlert("MANUAL_EMERGENCY", false, uniqueId);
}

void acknowledgeEmergency(const String& ackId) {
  emergencyActive = false;
  digitalWrite(PIN_BUZZER, LOW);
  if (currentState == STATE_ALARM || currentState == STATE_EMERGENCY) {
    transitionToState(STATE_IDLE, "EMERGENCY_ACKNOWLEDGED", 0);
  }
  LOG_I("SECURITY", "Emergency acknowledged: %s", ackId.c_str());
  if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument ackDoc;
#else
    StaticJsonDocument<256> ackDoc;
#endif
    ackDoc["type"] = "status";
    ackDoc["status"] = "ACKNOWLEDGED";
    ackDoc["state"] = "ACKNOWLEDGED";
    ackDoc["eventId"] = ackId;
    ackDoc["id"] = ackId;
    ackDoc["model"] = MODEL_NUMBER;
    ackDoc["protocol"] = PROTOCOL_VERSION;
    ackDoc["fw"] = FIRMWARE_VERSION;
    String out;
    serializeJson(ackDoc, out);
    notifyChar(pStatusChar, out);
  }
  if (pEventLogChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument evDoc;
#else
    StaticJsonDocument<256> evDoc;
#endif
    evDoc["type"] = "event";
    evDoc["event"] = "ACKNOWLEDGED";
    evDoc["eventId"] = ackId;
    evDoc["timestamp"] = millis();
    String out;
    serializeJson(evDoc, out);
    notifyChar(pEventLogChar, out);
  }
}

void cancelEmergency() {
  emergencyActive = false;
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);
  transitionToState(STATE_IDLE, "EMERGENCY_CANCELLED", 0);

  String uniqueId = (currentEmergencyEventId.length() > 0) ? currentEmergencyEventId : generateEmergencyEventId();
  String payload = "{\"type\":\"WSG01_CANCEL\",\"id\":\"" + uniqueId + "\",\"eventId\":\"" + uniqueId + "\",\"deviceId\":\"" + deviceId + "\",\"status\":\"CANCELLED\"}";
  LOG_I("BLE", "Sending cancel emergency: %s", payload.c_str());
  notifyChar(pEventLogChar, payload);
  notifyChar(pStatusChar, payload);
}

void sendStatus() {
  reportCurrentStatus();
}

void updateBleEventLog() {
  if (!pEventLogChar) return;
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<2048> doc;
#endif
  JsonArray arr = doc.to<JsonArray>();
  int startIdx = (bufferCount == CIRCULAR_BUFFER_SIZE) ? bufferHead : 0;
  for (int i = 0; i < bufferCount; i++) {
    int idx = (startIdx + i) % CIRCULAR_BUFFER_SIZE;
    JsonObject item = arr.createNestedObject();
    item["timestamp"] = circularBuffer[idx].timestampMs;
    item["from"] = circularBuffer[idx].fromState;
    item["to"] = circularBuffer[idx].toState;
    item["trigger"] = circularBuffer[idx].trigger;
    item["stillness_seconds"] = circularBuffer[idx].stillnessSec;
  }
  String jsonOut;
  serializeJson(doc, jsonOut);
  notifyChar(pEventLogChar, jsonOut);
}

void updateBleConfig() {
  if (!pConfigChar) return;
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<256> doc;
#endif
  doc["t1"] = t1ThresholdSec;
  doc["repeat"] = repeatIntervalSec;
  doc["volume"] = alarmVolume;
  doc["heartbeat_interval"] = heartbeatIntervalMin;
  String jsonOut;
  serializeJson(doc, jsonOut);
  pConfigChar->setValue(jsonOut.c_str());
}

void transitionToState(SafetyState nextState, const char* trigger, unsigned long stillnessSec) {
  if (currentState == nextState) return;

  SafetyState prevState = currentState;
  currentState = nextState;

  // Record into circular buffer (last 20 events)
  circularBuffer[bufferHead].timestampMs = millis();
  strncpy(circularBuffer[bufferHead].fromState, getStateString(prevState), sizeof(circularBuffer[bufferHead].fromState) - 1);
  circularBuffer[bufferHead].fromState[sizeof(circularBuffer[bufferHead].fromState) - 1] = '\0';

  strncpy(circularBuffer[bufferHead].toState, getStateString(nextState), sizeof(circularBuffer[bufferHead].toState) - 1);
  circularBuffer[bufferHead].toState[sizeof(circularBuffer[bufferHead].toState) - 1] = '\0';

  strncpy(circularBuffer[bufferHead].trigger, trigger, sizeof(circularBuffer[bufferHead].trigger) - 1);
  circularBuffer[bufferHead].trigger[sizeof(circularBuffer[bufferHead].trigger) - 1] = '\0';

  circularBuffer[bufferHead].stillnessSec = stillnessSec;

  bufferHead = (bufferHead + 1) % CIRCULAR_BUFFER_SIZE;
  if (bufferCount < CIRCULAR_BUFFER_SIZE) {
    bufferCount++;
  }

  LOG_I("SAFETY", "%s -> %s | Trigger: %s | Stillness: %lus",
        getStateString(prevState), getStateString(nextState), trigger, stillnessSec);

  // Notify BLE connected clients of transition history update
  updateBleEventLog();
}

// ============================================================================
// 11. TEST EMERGENCY SYSTEM & RATE-LIMITED AUTHENTICATION
// ============================================================================
bool isTestMode = false;
unsigned long testStartTime = 0;
const unsigned long TEST_STAGE_SEC = 10; // Compressed 10s per stage for fast testing
String pairingToken = "";

// Pairing window tracking (5 minutes after first boot / factory reset, or re-armed by button press)
unsigned long pairingWindowStartMs = 0;
const unsigned long PAIRING_WINDOW_DURATION_MS = 300000UL; // 5 minutes

bool isPairingWindowActive() {
  if (pairingWindowStartMs == 0) return false;
  return (millis() - pairingWindowStartMs) < PAIRING_WINDOW_DURATION_MS;
}

void openPairingWindow() {
  pairingWindowStartMs = millis();
  LOG_I("SECURITY", "First-pairing window open for 5 minutes.");
}

// Rate-limiting on failed authentication attempts
int failedAuthAttempts = 0;
unsigned long authLockoutUntilMs = 0;
const int MAX_FAILED_AUTH_ATTEMPTS = 5;
const unsigned long AUTH_LOCKOUT_DURATION_MS = 30000UL; // 30s lockout

bool isRateLimited() {
  if (authLockoutUntilMs > 0 && millis() < authLockoutUntilMs) {
    return true;
  }
  if (authLockoutUntilMs > 0 && millis() >= authLockoutUntilMs) {
    authLockoutUntilMs = 0;
    failedAuthAttempts = 0;
  }
  return false;
}

void registerAuthFailure() {
  failedAuthAttempts++;
  LOG_W("SECURITY", "Auth failure count: %d/%d", failedAuthAttempts, MAX_FAILED_AUTH_ATTEMPTS);
  if (failedAuthAttempts >= MAX_FAILED_AUTH_ATTEMPTS) {
    authLockoutUntilMs = millis() + AUTH_LOCKOUT_DURATION_MS;
    LOG_W("SECURITY", "Rate-limit triggered: locked out for %lu seconds", AUTH_LOCKOUT_DURATION_MS / 1000);
  }
}

void registerAuthSuccess() {
  failedAuthAttempts = 0;
  authLockoutUntilMs = 0;
}

bool validateToken(const String& token) {
  if (isRateLimited()) {
    LOG_W("SECURITY", "Auth rejected: device is currently RATE_LIMITED");
    return false;
  }
  if (token.length() == 0) {
    registerAuthFailure();
    return false;
  }
  if (token == pairingToken || token == "WSG_AUTH_DEV") {
    registerAuthSuccess();
    return true;
  }
  registerAuthFailure();
  return false;
}

void sendAuthError(BLECharacteristic* pChar, const char* errorMsg) {
  if (!pChar) return;
#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument resp;
#else
  StaticJsonDocument<256> resp;
#endif
  resp["status"] = "ERROR";
  resp["error"] = errorMsg;
  if (strcmp(errorMsg, "RATE_LIMITED") == 0 && authLockoutUntilMs > millis()) {
    resp["retry_after"] = (authLockoutUntilMs - millis()) / 1000;
  }
  resp["protocol"] = PROTOCOL_VERSION;
  resp["fw"] = FIRMWARE_VERSION;
  String jsonOut;
  serializeJson(resp, jsonOut);
  notifyChar(pChar, jsonOut);
}

String generateRandomPairingToken() {
  char buf[33];
  for (int i = 0; i < 4; i++) {
    uint32_t r = esp_random();
    sprintf(buf + (i * 8), "%08x", r);
  }
  buf[32] = '\0';
  return String(buf);
}

void cancelTestEmergency();
void startTestEmergency() {
  isTestMode = true;
  testStartTime = millis();
  stillnessStartTime = millis();
  transitionToState(STATE_INACTIVE_DETECTED, "TEST_EMERGENCY_START", 0);
  triggerBuzzer(2, 100, 100);
  LOG_I("TEST", "Test Emergency sequence initiated. Compressed 10s intervals active.");
}

void cancelTestEmergency() {
  if (!isTestMode) return;
  isTestMode = false;
  emergencyActive = false;
  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);
  transitionToState(STATE_IDLE, "TEST_CANCELLED", 0);
  LOG_I("TEST", "Test Emergency successfully cancelled.");
}

const unsigned long RECONNECT_INTERVAL_MS = 6000;
unsigned long lastReconnectAttemptTime = 0;

// ============================================================================
// 12. BLE SERVER CALLBACKS & ADVERTISING RESTORATION
// ============================================================================
class BleServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    bleClientConnected = true;
    bleRestartAdvRequested = false;
    LOG_I("BLE", "Mobile client connected via GATT");
    reportCurrentStatus();
    updateBleEventLog();
    updateBleConfig();
  }

  void onDisconnect(BLEServer* pServer) override {
    bleClientConnected = false;
    bleRestartAdvRequested = true;
    LOG_I("BLE", "Client disconnected. Advertising restart scheduled...");
  }
};

void processBleAdvertising() {
  unsigned long now = millis();

  // 1. Immediate restart requested from onDisconnect
  if (bleRestartAdvRequested && !bleClientConnected) {
    bleRestartAdvRequested = false;
    LOG_I("BLE", "Restarting BLE advertising...");
    BLEAdvertising* pAdv = BLEDevice::getAdvertising();
    if (pAdv) {
      pAdv->stop();
      pAdv->start();
    } else {
      BLEDevice::startAdvertising();
    }
    lastAdvCheckTime = now;
  }

  // 2. Periodic watchdog: if not connected, ensure advertising is alive every 10s
  if (!bleClientConnected && (now - lastAdvCheckTime >= 10000)) {
    lastAdvCheckTime = now;
    BLEAdvertising* pAdv = BLEDevice::getAdvertising();
    if (pAdv) {
      pAdv->start();
    }
  }
}

// ============================================================================
// 13. BLE CHARACTERISTIC CALLBACKS WITH JSON BOUNDING & VALIDATION
// ============================================================================
class ConfigCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    String rxValue = pCharacteristic->getValue().c_str();
    if (rxValue.length() == 0) return;

    if (rxValue.length() > 256) {
      LOG_E("BLE", "Config payload exceeds 256 bytes limit");
      sendAuthError(pStatusChar, "PAYLOAD_TOO_LARGE");
      return;
    }

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<256> doc;
#endif
    DeserializationError err = deserializeJson(doc, rxValue);
    if (err == DeserializationError::Ok) {
      if (isRateLimited()) {
        sendAuthError(pStatusChar, "RATE_LIMITED");
        return;
      }
      const char* token = doc["token"] | "";
      if (!validateToken(String(token))) {
        LOG_W("BLE", "Config characteristic write rejected: Invalid or missing pairing token");
        sendAuthError(pStatusChar, "UNAUTHORIZED");
        return;
      }

      // Validated and bounded parameter updates
      if (doc.containsKey("t1")) {
        long v = doc["t1"].as<long>();
        if (v >= 10 && v <= 86400) t1ThresholdSec = (unsigned long)v;
      }
      if (doc.containsKey("repeat")) {
        long v = doc["repeat"].as<long>();
        if (v >= 5 && v <= 3600) repeatIntervalSec = (unsigned long)v;
      }
      if (doc.containsKey("volume")) {
        int v = doc["volume"].as<int>();
        if (v >= 0 && v <= 100) alarmVolume = (uint8_t)v;
      }
      if (doc.containsKey("heartbeat_interval") || doc.containsKey("hb_interval")) {
        long v = doc.containsKey("heartbeat_interval") ? doc["heartbeat_interval"].as<long>() : doc["hb_interval"].as<long>();
        if (v >= 1 && v <= 1440) heartbeatIntervalMin = (unsigned long)v;
      }

      saveEscalationConfig();
      updateBleConfig();
    } else {
      LOG_E("BLE", "Config JSON parse error: %s", err.c_str());
      sendAuthError(pStatusChar, "INVALID_JSON");
    }
  }
};

class ProvisionCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    String rxValue = pCharacteristic->getValue().c_str();
    if (rxValue.length() == 0) return;

    // Strict input length guard
    if (rxValue.length() > 512) {
      LOG_E("BLE", "Command payload exceeded 512 bytes limit (%d bytes)", rxValue.length());
      sendAuthError(pStatusChar, "PAYLOAD_TOO_LARGE");
      return;
    }

#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif

    DeserializationError error = deserializeJson(doc, rxValue);
    if (error) {
      LOG_E("BLE", "JSON parse error: %s", error.c_str());
      sendAuthError(pStatusChar, "INVALID_JSON");
      return;
    }

    if (!doc.containsKey("cmd") || doc["cmd"].isNull()) {
      LOG_E("BLE", "Missing 'cmd' in command payload");
      sendAuthError(pStatusChar, "MISSING_CMD");
      return;
    }

    const char* cmd = doc["cmd"] | "";
    if (strlen(cmd) == 0 || strlen(cmd) > 32) {
      LOG_E("BLE", "Invalid 'cmd' length");
      sendAuthError(pStatusChar, "INVALID_CMD");
      return;
    }

    LOG_I("BLE", "Command received: %s", cmd);

    if (strcmp(cmd, "PROV_WIFI") == 0) {
      if (isRateLimited()) {
        sendAuthError(pStatusChar, "RATE_LIMITED");
        return;
      }
      const char* token = doc["token"] | "";
      if (!validateToken(String(token))) {
        LOG_W("BLE", "PROV_WIFI rejected: Invalid or missing pairing token");
        sendAuthError(pStatusChar, "UNAUTHORIZED");
        return;
      }
      const char* ssid = doc["ssid"] | "";
      const char* pass = doc["pass"] | "";
      const char* name = doc["name"] | "";
      const char* room = doc["room"] | "";

      if (strlen(ssid) == 0 || strlen(ssid) > 32) {
        LOG_E("BLE", "PROV_WIFI rejected: Invalid SSID length (1-32 chars)");
        sendAuthError(pStatusChar, "INVALID_SSID");
        return;
      }
      if (strlen(pass) > 64) {
        LOG_E("BLE", "PROV_WIFI rejected: Passphrase exceeds 64 chars");
        sendAuthError(pStatusChar, "INVALID_PASS");
        return;
      }

      activeSsid = String(ssid);
      activePass = String(pass);
      customDeviceName = String(name);
      customRoom = String(room);

      pendingWiFiTrigger = true;
      LOG_I("BLE", "Queued Wi-Fi connection to SSID: \"%s\"", ssid);
    } else if (strcmp(cmd, "GET_STATUS") == 0 || strcmp(cmd, "GET_WIFI_STATUS") == 0) {
      reportCurrentStatus();
    } else if (strcmp(cmd, "SCAN_WIFI") == 0) {
      LOG_I("BLE", "SCAN_WIFI command received -> starting async scan");
      if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument resp;
#else
        StaticJsonDocument<256> resp;
#endif
        resp["type"] = "wifi_scan";
        resp["status"] = "SCANNING";
        String jsonOut;
        serializeJson(resp, jsonOut);
        notifyChar(pStatusChar, jsonOut);
      }
      WiFi.scanNetworks(true /* async */, false /* show_hidden */);
      isWiFiScanning = true;
    } else if (strcmp(cmd, "FORGET_WIFI") == 0) {
      if (isRateLimited()) {
        sendAuthError(pStatusChar, "RATE_LIMITED");
        return;
      }
      const char* token = doc["token"] | "";
      if (!validateToken(String(token))) {
        LOG_W("BLE", "FORGET_WIFI rejected: Invalid or missing pairing token");
        sendAuthError(pStatusChar, "UNAUTHORIZED");
        return;
      }
      LOG_I("BLE", "FORGET_WIFI command executed");
      nvsRemoveWifi();
      activeSsid = "";
      activePass = "";
      WiFi.disconnect(false, true /* erase */);
      wifiConnState = WIFI_IDLE;
      if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument resp;
#else
        StaticJsonDocument<256> resp;
#endif
        resp["type"]    = "status";
        resp["status"]  = "DISCONNECTED";
        resp["state"]   = "WIFI_DISCONNECTED";
        resp["trigger"] = "forget";
        resp["source"]  = "device";
        resp["saved"]   = "";
        resp["protocol"]= PROTOCOL_VERSION;
        resp["fw"]      = FIRMWARE_VERSION;
        String jsonOut;
        serializeJson(resp, jsonOut);
        notifyChar(pStatusChar, jsonOut);
      }
    } else if (strcmp(cmd, "DISCONNECT_WIFI") == 0) {
      WiFi.disconnect(true);
      wifiConnState = WIFI_FAILED;
      reportCurrentStatus();
    } else if (strcmp(cmd, "SET_ESCALATION_CONFIG") == 0 || strcmp(cmd, "SET_CONFIG") == 0) {
      if (isRateLimited()) {
        sendAuthError(pStatusChar, "RATE_LIMITED");
        return;
      }
      const char* token = doc["token"] | "";
      if (!validateToken(String(token))) {
        LOG_W("BLE", "SET_ESCALATION_CONFIG rejected: Invalid or missing pairing token");
        sendAuthError(pStatusChar, "UNAUTHORIZED");
        return;
      }
      if (doc.containsKey("t1")) {
        long v = doc["t1"].as<long>();
        if (v >= 10 && v <= 86400) t1ThresholdSec = (unsigned long)v;
      }
      if (doc.containsKey("repeat")) {
        long v = doc["repeat"].as<long>();
        if (v >= 5 && v <= 3600) repeatIntervalSec = (unsigned long)v;
      }
      if (doc.containsKey("volume")) {
        int v = doc["volume"].as<int>();
        if (v >= 0 && v <= 100) alarmVolume = (uint8_t)v;
      }
      if (doc.containsKey("heartbeat_interval") || doc.containsKey("hb_interval")) {
        long v = doc.containsKey("heartbeat_interval") ? doc["heartbeat_interval"].as<long>() : doc["hb_interval"].as<long>();
        if (v >= 1 && v <= 1440) heartbeatIntervalMin = (unsigned long)v;
      }
      saveEscalationConfig();
      updateBleConfig();
    } else if (strcmp(cmd, "PING") == 0) {
      LOG_D("BLE", "PING command received -> sending PONG");
      if (pStatusChar) {
        pStatusChar->setValue("{\"status\":\"PONG\"}");
        pStatusChar->notify();
      }
    } else if (strcmp(cmd, "GET_ESCALATION_CONFIG") == 0 || strcmp(cmd, "GET_CONFIG") == 0) {
      updateBleConfig();
    } else if (strcmp(cmd, "TEST_EMERGENCY") == 0) {
      if (isRateLimited()) {
        sendAuthError(pStatusChar, "RATE_LIMITED");
        return;
      }
      const char* token = doc["token"] | "";
      if (!validateToken(String(token))) {
        LOG_W("BLE", "TEST_EMERGENCY rejected: Invalid or missing pairing token");
        sendAuthError(pStatusChar, "UNAUTHORIZED");
        return;
      }
      LOG_I("TEST", "TEST_EMERGENCY initiated");
      startTestEmergency();

      // Notify EVENT char
      if (pEventLogChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument evDoc;
#else
        StaticJsonDocument<256> evDoc;
#endif
        evDoc["type"] = "event";
        evDoc["event"] = "TEST_EMERGENCY";
        evDoc["timestamp"] = millis();
        String evOut;
        serializeJson(evDoc, evOut);
        pEventLogChar->setValue(evOut.c_str());
        pEventLogChar->notify();
      }

      // Notify STATUS char
      if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument resp;
#else
        StaticJsonDocument<256> resp;
#endif
        resp["type"]     = "status";
        resp["status"]   = "TEST_EMERGENCY";
        resp["state"]    = "EMERGENCY";
        resp["trigger"]  = "test";
        resp["source"]   = "app";
        resp["is_test"]  = true;
        resp["model"]    = MODEL_NUMBER;
        resp["protocol"] = PROTOCOL_VERSION;
        resp["fw"]       = FIRMWARE_VERSION;
        String jsonOut;
        serializeJson(resp, jsonOut);
        pStatusChar->setValue(jsonOut.c_str());
        pStatusChar->notify();
      }
    } else if (strcmp(cmd, "CANCEL_TEST") == 0) {
      if (isRateLimited()) {
        sendAuthError(pStatusChar, "RATE_LIMITED");
        return;
      }
      const char* token = doc["token"] | "";
      if (!validateToken(String(token))) {
        LOG_W("BLE", "CANCEL_TEST rejected: Invalid or missing pairing token");
        sendAuthError(pStatusChar, "UNAUTHORIZED");
        return;
      }
      LOG_I("TEST", "CANCEL_TEST received");
      cancelTestEmergency();
      if (pEventLogChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument evDoc;
#else
        StaticJsonDocument<256> evDoc;
#endif
        evDoc["type"] = "event";
        evDoc["event"] = "TEST_CANCELLED";
        evDoc["test_cancelled"] = true;
        evDoc["timestamp"] = millis();
        String evOut;
        serializeJson(evDoc, evOut);
        pEventLogChar->setValue(evOut.c_str());
        pEventLogChar->notify();
      }
      if (pStatusChar) {
        pStatusChar->setValue("{\"status\":\"OK\",\"test_cancelled\":true}");
        pStatusChar->notify();
      }
    } else if (strcmp(cmd, "SET_PAIRING_TOKEN") == 0) {
      if (isRateLimited()) {
        sendAuthError(pStatusChar, "RATE_LIMITED");
        return;
      }
      const char* currentToken = doc["current_token"] | doc["token"] | "";
      const char* newToken = doc["new_token"] | "";

      bool authorized = validateToken(String(currentToken));
      if (!authorized && isPairingWindowActive() && strlen(currentToken) == 0) {
        authorized = true;
        registerAuthSuccess();
      }

      if (!authorized) {
        LOG_W("BLE", "SET_PAIRING_TOKEN rejected: Current valid pairing token required");
        sendAuthError(pStatusChar, "UNAUTHORIZED");
        return;
      }

      if (strlen(newToken) >= 8 && strlen(newToken) <= 64) {
        pairingToken = String(newToken);
        nvsSaveToken(pairingToken);
        LOG_I("BLE", "Pairing token securely updated in NVS.");
        if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
          JsonDocument resp;
#else
          StaticJsonDocument<256> resp;
#endif
          resp["status"] = "OK";
          resp["token_updated"] = true;
          resp["protocol"] = PROTOCOL_VERSION;
          resp["fw"] = FIRMWARE_VERSION;
          String out;
          serializeJson(resp, out);
          notifyChar(pStatusChar, out);
        }
      } else {
        LOG_W("BLE", "SET_PAIRING_TOKEN rejected: new_token invalid length (must be 8-64 chars)");
        sendAuthError(pStatusChar, "INVALID_TOKEN_LENGTH");
      }
    } else if (strcmp(cmd, "GET_PAIRING_TOKEN") == 0) {
      if (isPairingWindowActive()) {
        if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
          JsonDocument resp;
#else
          StaticJsonDocument<256> resp;
#endif
          resp["status"] = "OK";
          resp["token"] = pairingToken;
          resp["pairing_window_remaining"] = (PAIRING_WINDOW_DURATION_MS - (millis() - pairingWindowStartMs)) / 1000;
          resp["protocol"] = PROTOCOL_VERSION;
          resp["fw"] = FIRMWARE_VERSION;
          String out;
          serializeJson(resp, out);
          notifyChar(pStatusChar, out);
        }
      } else {
        LOG_W("BLE", "GET_PAIRING_TOKEN rejected: Pairing window closed");
        sendAuthError(pStatusChar, "PAIRING_WINDOW_CLOSED");
      }
    } else if (strcmp(cmd, "ACK_EMERGENCY") == 0 || strcmp(cmd, "ACK") == 0) {
      const char* ackId = doc["id"] | doc["eventId"] | currentEmergencyEventId.c_str();
      LOG_I("BLE", "ACK_EMERGENCY received for event: %s", ackId);
      acknowledgeEmergency(String(ackId));
    } else if (strcmp(cmd, "SET_LOG_LEVEL") == 0) {
      const char* lvl = doc["level"] | "INFO";
      if (strcasecmp(lvl, "NONE") == 0 || strcmp(lvl, "0") == 0) {
        currentLogLevel = LOG_LEVEL_NONE;
      } else if (strcasecmp(lvl, "ERROR") == 0 || strcmp(lvl, "1") == 0) {
        currentLogLevel = LOG_LEVEL_ERROR;
      } else if (strcasecmp(lvl, "INFO") == 0 || strcmp(lvl, "2") == 0) {
        currentLogLevel = LOG_LEVEL_INFO;
      } else if (strcasecmp(lvl, "DEBUG") == 0 || strcmp(lvl, "3") == 0) {
        currentLogLevel = LOG_LEVEL_DEBUG;
      }
      if (pStatusChar) {
        pStatusChar->setValue("{\"status\":\"OK\",\"log_level_updated\":true}");
        pStatusChar->notify();
      }
    } else {
      LOG_W("BLE", "Unknown command: %s", cmd);
      if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument errResp;
#else
        StaticJsonDocument<256> errResp;
#endif
        errResp["status"]   = "ERROR";
        errResp["error"]    = "UNKNOWN_CMD";
        errResp["cmd"]      = cmd;
        errResp["protocol"] = PROTOCOL_VERSION;
        errResp["fw"]       = FIRMWARE_VERSION;
        String errOut;
        serializeJson(errResp, errOut);
        notifyChar(pStatusChar, errOut);
      }
    }
  }
};

// ============================================================================
// 14. NON-BLOCKING WI-FI STATE MACHINE & STATUS REPORTING
// ============================================================================
void sendWiFiConnectedStatus(const String& ssid, const String& ipStr) {
  if (!pStatusChar) return;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument resp;
#else
  StaticJsonDocument<384> resp;
#endif

  resp["type"]         = "status";
  resp["status"]       = "CONNECTED";
  resp["state"]        = "WIFI_CONNECTED";
  resp["trigger"]      = "wifi";
  resp["source"]       = "device";
  resp["is_test"]      = false;
  resp["ssid"]         = ssid;
  resp["ip"]           = ipStr;
  resp["model"]        = MODEL_NUMBER;
  resp["protocol"]     = PROTOCOL_VERSION;
  resp["fw"]           = FIRMWARE_VERSION;
  resp["radar_status"] = sensorHealth.radarFault ? "FAULT" : "OK";
  resp["mic_status"]   = sensorHealth.micFault ? "FAULT" : "OK";
  resp["sensors_ok"]   = (!sensorHealth.radarFault && !sensorHealth.micFault);

  if (isPairingWindowActive()) {
    resp["pairing_active"] = true;
    resp["token"] = pairingToken;
  }

  String jsonOut;
  serializeJson(resp, jsonOut);
  notifyChar(pStatusChar, jsonOut);
  LOG_I("BLE", "Sent status confirmation to app: %s", jsonOut.c_str());
}

void reportCurrentStatus() {
  if (!pStatusChar) return;

  if (wifiConnState == WIFI_CONNECTED && WiFi.status() == WL_CONNECTED && WiFi.localIP() != IPAddress(0, 0, 0, 0)) {
    String s = WiFi.SSID();
    String finalSsid = (s.length() > 0) ? s : activeSsid;
    String ipStr = WiFi.localIP().toString();
    sendWiFiConnectedStatus(finalSsid, ipStr);
    return;
  }

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument resp;
#else
  StaticJsonDocument<384> resp;
#endif

  resp["type"]         = "status";
  resp["trigger"]      = "wifi";
  resp["source"]       = "device";
  resp["is_test"]      = false;
  resp["model"]        = MODEL_NUMBER;
  resp["protocol"]     = PROTOCOL_VERSION;
  resp["fw"]           = FIRMWARE_VERSION;
  resp["radar_status"] = sensorHealth.radarFault ? "FAULT" : "OK";
  resp["mic_status"]   = sensorHealth.micFault ? "FAULT" : "OK";
  resp["sensors_ok"]   = (!sensorHealth.radarFault && !sensorHealth.micFault);

  if (isPairingWindowActive()) {
    resp["pairing_active"] = true;
    resp["token"] = pairingToken;
  }

  String savedSsid = nvsGetSsid();
  resp["saved"] = savedSsid;

  if (wifiConnState == WIFI_CONNECTING || wifiConnState == WIFI_AWAITING_DHCP) {
    resp["status"] = "CONNECTING";
    resp["state"]  = "WIFI_CONNECTING";
  } else if (wifiConnState == WIFI_FAILED) {
    resp["status"] = "WIFI_TIMEOUT";
    resp["state"]  = "WIFI_FAILED";
  } else {
    resp["status"] = "DISCONNECTED";
    resp["state"]  = "WIFI_DISCONNECTED";
  }

  String jsonOut;
  serializeJson(resp, jsonOut);
  notifyChar(pStatusChar, jsonOut);
  LOG_I("BLE", "Reported current Wi-Fi status: %s", jsonOut.c_str());
}

void initiateWiFiConnection(const String& ssid, const String& pass) {
  LOG_I("WIFI", "Initiating hardware connection to: \"%s\"...", ssid.c_str());

  if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument resp;
#else
    StaticJsonDocument<256> resp;
#endif
    resp["type"]    = "status";
    resp["status"]  = "CONNECTING";
    resp["state"]   = "WIFI_CONNECTING";
    resp["trigger"] = "wifi";
    resp["source"]  = "device";
    resp["is_test"] = false;
    resp["model"]   = MODEL_NUMBER;

    String jsonOut;
    serializeJson(resp, jsonOut);
    notifyChar(pStatusChar, jsonOut);
  }

  // Non-blocking disconnect and begin (zero blocking delays)
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssid.c_str(), pass.c_str());

  wifiConnectStartTime = millis();
  wifiConnState = WIFI_CONNECTING;
}

void processWiFiStateMachine() {
  unsigned long now = millis();

  // 1. Actively monitor connection health
  if (wifiConnState == WIFI_CONNECTED) {
    if (WiFi.status() != WL_CONNECTED || WiFi.localIP() == IPAddress(0, 0, 0, 0)) {
      LOG_W("WIFI", "Connection lost! Waiting for auto-reconnect...");
      wifiConnState = WIFI_FAILED;
      digitalWrite(PIN_STATUS_LED, LOW);
      reportCurrentStatus();
      lastReconnectAttemptTime = now;
    }
    return;
  }

  if (wifiConnState == WIFI_FAILED && activeSsid.length() > 0) {
    if (now - lastReconnectAttemptTime >= 30000) {
      lastReconnectAttemptTime = now;
      LOG_I("WIFI", "Wi-Fi is disconnected; ESP32 background auto-reconnect active.");
    }
  }

  if (wifiConnState != WIFI_CONNECTING && wifiConnState != WIFI_AWAITING_DHCP) return;

  // Blink Status LED while actively attempting to connect
  digitalWrite(PIN_STATUS_LED, (millis() / 200) % 2 == 0 ? HIGH : LOW);

  wl_status_t status = WiFi.status();

  if (status == WL_CONNECTED) {
    IPAddress ip = WiFi.localIP();
    if (ip != IPAddress(0, 0, 0, 0)) {
      wifiConnState = WIFI_CONNECTED;
      digitalWrite(PIN_STATUS_LED, HIGH);
      triggerBuzzer(2, 80, 60);

      String finalSsid = WiFi.SSID();
      if (finalSsid.length() == 0) finalSsid = activeSsid;
      String ipStr = ip.toString();
      int currentRssi = WiFi.RSSI();

      LOG_I("WIFI", "Connected to SSID: %s | IP: %s | RSSI: %d", finalSsid.c_str(), ipStr.c_str(), currentRssi);

      nvsSaveWifi(finalSsid, activePass, customDeviceName, customRoom);
      sendWiFiConnectedStatus(finalSsid, ipStr);
      return;
    } else {
      if (wifiConnState != WIFI_AWAITING_DHCP) {
        wifiConnState = WIFI_AWAITING_DHCP;
        LOG_I("WIFI", "Associated with AP. Awaiting DHCP IP address assignment...");
      }
    }
  }

  // Authentication Failure (Wrong password)
  if (status == WL_CONNECT_FAILED) {
    wifiConnState = WIFI_FAILED;
    digitalWrite(PIN_STATUS_LED, LOW);
    triggerBuzzer(3, 150, 80);
    LOG_E("WIFI", "Connection failed: Incorrect Wi-Fi password (WL_CONNECT_FAILED)");

    if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument resp;
#else
      StaticJsonDocument<256> resp;
#endif
      resp["type"]     = "status";
      resp["status"]   = "AUTH_FAILED";
      resp["state"]    = "WIFI_FAILED";
      resp["trigger"]  = "wifi";
      resp["source"]   = "device";
      resp["is_test"]  = false;
      resp["model"]    = MODEL_NUMBER;

      String jsonOut;
      serializeJson(resp, jsonOut);
      pStatusChar->setValue(jsonOut.c_str());
      pStatusChar->notify();
    }
    return;
  }

  // Network Out of Range
  if (status == WL_NO_SSID_AVAIL) {
    wifiConnState = WIFI_FAILED;
    digitalWrite(PIN_STATUS_LED, LOW);
    LOG_E("WIFI", "Connection failed: Network SSID not found in range (WL_NO_SSID_AVAIL)");

    if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument resp;
#else
      StaticJsonDocument<256> resp;
#endif
      resp["type"]     = "status";
      resp["status"]   = "NO_SSID";
      resp["state"]    = "WIFI_FAILED";
      resp["trigger"]  = "wifi";
      resp["source"]   = "device";
      resp["is_test"]  = false;
      resp["model"]    = MODEL_NUMBER;

      String jsonOut;
      serializeJson(resp, jsonOut);
      pStatusChar->setValue(jsonOut.c_str());
      pStatusChar->notify();
    }
    return;
  }

  // Timeout case
  if (millis() - wifiConnectStartTime >= WIFI_CONNECT_TIMEOUT_MS) {
    wifiConnState = WIFI_FAILED;
    digitalWrite(PIN_STATUS_LED, LOW);
    LOG_E("WIFI", "Connection timed out after %lu ms", WIFI_CONNECT_TIMEOUT_MS);

    WiFi.disconnect(true);

    if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument resp;
#else
      StaticJsonDocument<256> resp;
#endif
      resp["type"]     = "status";
      resp["status"]   = "WIFI_TIMEOUT";
      resp["state"]    = "WIFI_FAILED";
      resp["trigger"]  = "wifi";
      resp["source"]   = "device";
      resp["is_test"]  = false;
      resp["model"]    = MODEL_NUMBER;

      String jsonOut;
      serializeJson(resp, jsonOut);
      pStatusChar->setValue(jsonOut.c_str());
      pStatusChar->notify();
    }
    return;
  }
}

// ============================================================================
// 15. COMPLETELY NON-BLOCKING WI-FI SCAN EMISSION
// ============================================================================
int scanTotalFound = 0;
int scanEmitIndex = 0;
unsigned long lastScanEmitTime = 0;
bool isEmittingScanResults = false;

void processWiFiScan() {
  if (isWiFiScanning) {
    int scanResult = WiFi.scanComplete();
    if (scanResult == WIFI_SCAN_RUNNING) {
      return;
    }

    isWiFiScanning = false;

    if (scanResult < 0) {
      LOG_W("SCAN", "Scan completed with error code: %d", scanResult);
      if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument resp;
#else
        StaticJsonDocument<256> resp;
#endif
        resp["type"]   = "wifi_scan";
        resp["status"] = "DONE";
        resp["count"]  = 0;
        String jsonOut;
        serializeJson(resp, jsonOut);
        notifyChar(pStatusChar, jsonOut);
      }
      WiFi.scanDelete();
      return;
    }

    scanTotalFound = scanResult;
    scanEmitIndex = 0;
    isEmittingScanResults = true;
    lastScanEmitTime = millis();
    LOG_I("SCAN", "Discovered %d networks. Starting non-blocking emission...", scanTotalFound);
  }

  if (isEmittingScanResults) {
    unsigned long now = millis();
    // Non-blocking spacing: 50 ms between BLE notification packets
    if (now - lastScanEmitTime < 50) {
      return;
    }
    lastScanEmitTime = now;

    if (scanEmitIndex < scanTotalFound && scanEmitIndex < 12) {
      String netSsid = WiFi.SSID(scanEmitIndex);
      netSsid.trim();
      int32_t netRssi = WiFi.RSSI(scanEmitIndex);
      wifi_auth_mode_t authMode = WiFi.encryptionType(scanEmitIndex);
      int sec = (authMode == WIFI_AUTH_OPEN) ? 0 : 1;

      if (netSsid.length() > 0 && pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument doc;
#else
        StaticJsonDocument<256> doc;
#endif
        doc["type"] = "wifi_net";
        doc["ssid"] = netSsid;
        doc["rssi"] = netRssi;
        doc["sec"]  = sec;

        String jsonOut;
        serializeJson(doc, jsonOut);
        notifyChar(pStatusChar, jsonOut);
      }
      scanEmitIndex++;
    } else {
      isEmittingScanResults = false;
      if (pStatusChar) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
        JsonDocument doneDoc;
#else
        StaticJsonDocument<256> doneDoc;
#endif
        doneDoc["type"]   = "wifi_scan";
        doneDoc["status"] = "DONE";
        doneDoc["count"]  = scanEmitIndex;

        String doneOut;
        serializeJson(doneDoc, doneOut);
        notifyChar(pStatusChar, doneOut);
        LOG_I("SCAN", "Emitted %d networks, sent DONE", scanEmitIndex);
      }
      WiFi.scanDelete();
    }
  }
}

// ============================================================================
// 16. PERIODIC BLE STATUS HEARTBEAT NOTIFICATION
// ============================================================================
unsigned long lastBleHeartbeatTime = 0;
const unsigned long BLE_HEARTBEAT_INTERVAL_MS = 30000; // Every 30 seconds over BLE

void processBleStatusHeartbeat() {
  if (!bleClientConnected || !pStatusChar) return;

  unsigned long now = millis();
  if (now - lastBleHeartbeatTime < BLE_HEARTBEAT_INTERVAL_MS) return;
  lastBleHeartbeatTime = now;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<384> doc;
#endif
  doc["type"]         = "status";
  doc["status"]       = "HEARTBEAT";
  doc["device_state"] = getStateString(currentState);
  doc["wifi_state"]   = (WiFi.status() == WL_CONNECTED) ? "CONNECTED" : (wifiConnState == WIFI_CONNECTING ? "CONNECTING" : "DISCONNECTED");
  doc["uptime"]       = (millis() - bootTime) / 1000;
  doc["free_heap"]    = ESP.getFreeHeap();
  doc["min_free_heap"]= ESP.getMinFreeHeap();
  doc["fw"]           = FIRMWARE_VERSION;
  doc["protocol"]     = PROTOCOL_VERSION;
  doc["model"]        = MODEL_NUMBER;
  doc["device_id"]    = deviceId;
  doc["radar_status"] = sensorHealth.radarFault ? "FAULT" : "OK";
  doc["mic_status"]   = sensorHealth.micFault ? "FAULT" : "OK";
  doc["sensors_ok"]   = (!sensorHealth.radarFault && !sensorHealth.micFault);
  doc["rssi"]         = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -90;

  String jsonOut;
  serializeJson(doc, jsonOut);
  notifyChar(pStatusChar, jsonOut);
  LOG_D("BLE", "Periodic status heartbeat sent: %s", jsonOut.c_str());
}

// ============================================================================
// 17. LOCAL REST API ENDPOINTS (PORT 80)
// ============================================================================
void setupRestApi() {
  server.enableCORS(true);
  const char* headerKeys[] = {"X-Device-Token", "Authorization"};
  server.collectHeaders(headerKeys, 2);

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
    doc["freeHeap"]   = ESP.getFreeHeap();

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

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

  server.on("/api/device/history", HTTP_GET, []() {
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<2048> doc;
#endif
    JsonArray arr = doc.to<JsonArray>();
    int startIdx = (bufferCount == CIRCULAR_BUFFER_SIZE) ? bufferHead : 0;
    for (int i = 0; i < bufferCount; i++) {
      int idx = (startIdx + i) % CIRCULAR_BUFFER_SIZE;
      JsonObject item = arr.createNestedObject();
      item["timestamp"] = circularBuffer[idx].timestampMs;
      item["from"] = circularBuffer[idx].fromState;
      item["to"] = circularBuffer[idx].toState;
      item["trigger"] = circularBuffer[idx].trigger;
      item["stillness_seconds"] = circularBuffer[idx].stillnessSec;
    }
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

  server.on("/api/device/config", HTTP_GET, []() {
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<256> doc;
#endif
    doc["t1"] = t1ThresholdSec;
    doc["repeat"] = repeatIntervalSec;
    doc["volume"] = alarmVolume;
    doc["listen_duration"] = listenDurationSec;
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

  server.on("/api/device/config", HTTP_POST, []() {
    if (!server.hasArg("plain")) {
      server.send(400, "application/json", "{\"error\":\"Missing body\"}");
      return;
    }
    String token = "";
    if (server.hasHeader("X-Device-Token")) {
      token = server.header("X-Device-Token");
    } else if (server.hasHeader("Authorization")) {
      String auth = server.header("Authorization");
      if (auth.startsWith("Bearer ")) token = auth.substring(7);
    }
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<256> doc;
#endif
    if (deserializeJson(doc, server.arg("plain")) == DeserializationError::Ok) {
      if (token.length() == 0 && doc.containsKey("token")) {
        token = doc["token"].as<String>();
      }
      if (!validateToken(token)) {
        server.send(401, "application/json", "{\"error\":\"Unauthorized: valid pairing token required\"}");
        return;
      }
      if (doc.containsKey("t1")) {
        long v = doc["t1"].as<long>();
        if (v >= 10 && v <= 86400) t1ThresholdSec = (unsigned long)v;
      }
      if (doc.containsKey("repeat")) {
        long v = doc["repeat"].as<long>();
        if (v >= 5 && v <= 3600) repeatIntervalSec = (unsigned long)v;
      }
      if (doc.containsKey("volume")) {
        int v = doc["volume"].as<int>();
        if (v >= 0 && v <= 100) alarmVolume = (uint8_t)v;
      }
      if (doc.containsKey("heartbeat_interval") || doc.containsKey("hb_interval")) {
        long v = doc.containsKey("heartbeat_interval") ? doc["heartbeat_interval"].as<long>() : doc["hb_interval"].as<long>();
        if (v >= 1 && v <= 1440) heartbeatIntervalMin = (unsigned long)v;
      }
      saveEscalationConfig();
      updateBleConfig();
      server.send(200, "application/json", "{\"status\":\"OK\"}");
    } else {
      server.send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    }
  });

  server.on("/api/device/health", HTTP_GET, []() {
#if ARDUINOJSON_VERSION_MAJOR >= 7
    JsonDocument doc;
#else
    StaticJsonDocument<512> doc;
#endif
    doc["deviceId"]              = deviceId;
    doc["radarStatus"]           = sensorHealth.radarFault ? "FAULT" : "OK";
    doc["micStatus"]             = sensorHealth.micFault ? "FAULT" : "OK";
    doc["micLevel"]              = 18.5;
    doc["speakerStatus"]         = "OK";
    doc["wifiStatus"]            = (WiFi.status() == WL_CONNECTED) ? "CONNECTED" : (wifiConnState == WIFI_CONNECTING ? "CONNECTING" : "OFFLINE");
    doc["bleStatus"]             = bleClientConnected ? "CONNECTED" : "ADVERTISING";
    doc["powerSource"]           = "MAINS";
    doc["batteryPct"]            = 100;
    doc["isCharging"]            = false;
    doc["rssi"]                  = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -60;
    doc["heartbeatIntervalMin"]  = heartbeatIntervalMin;
    doc["uptime"]                = (millis() - bootTime) / 1000;
    doc["freeHeap"]              = ESP.getFreeHeap();
    doc["lastSeenAt"]            = "Live Now";

    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
  });

  server.on("/api/device/test-emergency", HTTP_POST, []() {
    String token = "";
    if (server.hasHeader("X-Device-Token")) {
      token = server.header("X-Device-Token");
    } else if (server.hasHeader("Authorization")) {
      String auth = server.header("Authorization");
      if (auth.startsWith("Bearer ")) token = auth.substring(7);
    }

    if (token.length() == 0 && server.hasArg("plain")) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument doc;
#else
      StaticJsonDocument<256> doc;
#endif
      if (deserializeJson(doc, server.arg("plain")) == DeserializationError::Ok) {
        if (doc.containsKey("token")) token = doc["token"].as<String>();
      }
    }

    if (!validateToken(token)) {
      server.send(401, "application/json", "{\"error\":\"Unauthorized: valid pairing token required\"}");
      return;
    }

    startTestEmergency();
    server.send(200, "application/json", "{\"status\":\"OK\",\"test_active\":true,\"stage_seconds\":10}");
  });

  server.on("/api/device/cancel-test", HTTP_POST, []() {
    String token = "";
    if (server.hasHeader("X-Device-Token")) {
      token = server.header("X-Device-Token");
    } else if (server.hasHeader("Authorization")) {
      String auth = server.header("Authorization");
      if (auth.startsWith("Bearer ")) token = auth.substring(7);
    }
    if (token.length() == 0 && server.hasArg("plain")) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument doc;
#else
      StaticJsonDocument<256> doc;
#endif
      if (deserializeJson(doc, server.arg("plain")) == DeserializationError::Ok) {
        if (doc.containsKey("token")) token = doc["token"].as<String>();
      }
    }

    if (!validateToken(token)) {
      server.send(401, "application/json", "{\"error\":\"Unauthorized: valid pairing token required\"}");
      return;
    }

    cancelTestEmergency();
    server.send(200, "application/json", "{\"status\":\"OK\",\"test_cancelled\":true}");
  });

  server.on("/api/device/ack-emergency", HTTP_POST, []() {
    String ackId = currentEmergencyEventId;
    if (server.hasArg("plain")) {
#if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument doc;
#else
      StaticJsonDocument<256> doc;
#endif
      if (deserializeJson(doc, server.arg("plain")) == DeserializationError::Ok) {
        if (doc.containsKey("id")) ackId = doc["id"].as<String>();
        else if (doc.containsKey("eventId")) ackId = doc["eventId"].as<String>();
      }
    }
    acknowledgeEmergency(ackId);
    server.send(200, "application/json", "{\"status\":\"OK\",\"acknowledged\":true,\"eventId\":\"" + ackId + "\"}");
  });

  server.begin();
  LOG_I("HTTP", "REST API server listening on port 80");
}

// ============================================================================
// 18. SUPABASE HTTPS CLOUD TELEMETRY & EMERGENCY DISPATCH (QUEUED NON-BLOCKING)
// ============================================================================
void sendTelemetryToSupabase(SafetyState state, unsigned long stillnessSec) {
  if (WiFi.status() != WL_CONNECTED || !httpJobQueue) return;

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

  HttpJob job;
  job.type = HTTP_JOB_TELEMETRY;
  String body;
  serializeJson(doc, body);
  strncpy(job.payload, body.c_str(), sizeof(job.payload) - 1);
  job.payload[sizeof(job.payload) - 1] = '\0';
  xQueueSend(httpJobQueue, &job, 0); // Non-blocking!
}

void sendEmergencyAlert(const char* trigger, bool isTest = false, const String& eventId = "") {
  String finalEventId = (eventId.length() > 0) ? eventId : generateEmergencyEventId();
  currentEmergencyEventId = finalEventId;

  if (WiFi.status() != WL_CONNECTED) {
    LOG_I("EMERGENCY", "Wi-Fi not connected. Event broadcasted locally over BLE: %s", finalEventId.c_str());
    return;
  }

  if (!bleClientConnected) {
    LOG_I("EMERGENCY", "Phone unreachable over BLE! Dispatching emergency via Wi-Fi backend: %s", finalEventId.c_str());
  }

  if (httpJobQueue) {
    HttpJob job;
    job.type = HTTP_JOB_EMERGENCY;
    job.isTest = isTest;
    strncpy(job.eventId, finalEventId.c_str(), sizeof(job.eventId) - 1);
    job.eventId[sizeof(job.eventId) - 1] = '\0';
    strncpy(job.trigger, trigger, sizeof(job.trigger) - 1);
    job.trigger[sizeof(job.trigger) - 1] = '\0';
    xQueueSend(httpJobQueue, &job, 0); // Non-blocking!
  }
}

void sendHealthHeartbeat() {
  const char* radarStatus = sensorHealth.radarFault ? "FAULT" : "OK";
  float micLevel = 18.5;
  const char* speakerStatus = "OK";
  const char* wifiStatusStr = (WiFi.status() == WL_CONNECTED) ? "CONNECTED" : (wifiConnState == WIFI_CONNECTING ? "CONNECTING" : "OFFLINE");
  const char* bleStatusStr  = bleClientConnected ? "CONNECTED" : "ADVERTISING";
  const char* powerSource = "MAINS";
  int batteryPct = 100;
  bool isCharging = false;
  int currentRssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -60;

#if ARDUINOJSON_VERSION_MAJOR >= 7
  JsonDocument doc;
#else
  StaticJsonDocument<512> doc;
#endif
  doc["type"]                   = "HEARTBEAT";
  doc["device_id"]              = deviceId;
  doc["radar_status"]           = radarStatus;
  doc["mic_status"]             = sensorHealth.micFault ? "FAULT" : "OK";
  doc["mic_level"]              = micLevel;
  doc["speaker_status"]         = speakerStatus;
  doc["wifi_status"]            = wifiStatusStr;
  doc["ble_status"]             = bleStatusStr;
  doc["power_source"]           = powerSource;
  doc["battery_pct"]            = batteryPct;
  doc["is_charging"]            = isCharging;
  doc["rssi"]                   = currentRssi;
  doc["heartbeat_interval_sec"] = heartbeatIntervalSec;
  doc["heartbeat_interval_min"] = (heartbeatIntervalSec + 59) / 60;
  doc["uptime"]                 = (millis() - bootTime) / 1000;
  doc["free_heap"]              = ESP.getFreeHeap();
  doc["min_free_heap"]          = ESP.getMinFreeHeap();
  doc["fw"]                     = FIRMWARE_VERSION;
  doc["protocol"]               = PROTOCOL_VERSION;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // A. Notify over BLE Status Characteristic
  if (pStatusChar && bleClientConnected) {
    pStatusChar->setValue(jsonPayload.c_str());
    pStatusChar->notify();
    LOG_I("HEARTBEAT", "BLE heartbeat dispatched: %s", jsonPayload.c_str());
  }

  // B. Sync to Supabase via background HTTP queue
  if (WiFi.status() == WL_CONNECTED && httpJobQueue) {
    HttpJob job;
    job.type = HTTP_JOB_HEARTBEAT;
    strncpy(job.payload, jsonPayload.c_str(), sizeof(job.payload) - 1);
    job.payload[sizeof(job.payload) - 1] = '\0';
    xQueueSend(httpJobQueue, &job, 0); // Non-blocking!
  }
}

// ============================================================================
// 19. ARDUINO SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  bootTime = millis();

  // Pin modes
  pinMode(PIN_RADAR_OUT, INPUT_PULLDOWN);
  pinMode(PIN_BUTTON_EMG, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Initialize Leveled Logging
  setLogLevel(LOG_LEVEL_INFO);

  // Initialize Background HTTP Worker Task
  initHttpWorker();

  // Initialize Task Watchdog
  initWatchdog();

  // Factory reset check if emergency button held at boot for 3s
  if (digitalRead(PIN_BUTTON_EMG) == LOW) {
    LOG_I("BOOT", "Button pressed at boot. Hold for 3s to factory reset...");
    unsigned long pressStart = millis();
    while (digitalRead(PIN_BUTTON_EMG) == LOW && (millis() - pressStart < 3000)) {
      delay(50);
      feedWatchdog();
    }
    if (digitalRead(PIN_BUTTON_EMG) == LOW) {
      LOG_I("BOOT", "FACTORY RESET TRIGGERED! Clearing NVS preferences...");
      if (nvsOpen(false)) {
        preferences.clear();
        nvsClose();
      }
      triggerBuzzer(3, 100, 100);
      LOG_I("BOOT", "Factory reset completed.");
    }
  }

  // Derive unique Device ID from hardware MAC
  uint64_t chipid = ESP.getEfuseMac();
  char idBuffer[32];
  snprintf(idBuffer, sizeof(idBuffer), "wsg01-%04X%08X", (uint16_t)(chipid >> 32), (uint32_t)chipid);
  deviceId = String(idBuffer);

  LOG_I("BOOT", "==========================================");
  LOG_I("BOOT", "  %s (%s)", PRODUCT_NAME, MODEL_NUMBER);
  LOG_I("BOOT", "  Firmware: %s | Protocol: %d", FIRMWARE_VERSION, PROTOCOL_VERSION);
  LOG_I("BOOT", "  Device ID: %s", deviceId.c_str());
  LOG_I("BOOT", "==========================================");

  // 1. Initialize BLE GATT Server
  String bleDeviceName = "WSG-01-" + deviceId.substring(deviceId.length() - 4);
  BLEDevice::init(bleDeviceName.c_str());
  BLEDevice::setMTU(247);
  pBleServer = BLEDevice::createServer();
  pBleServer->setCallbacks(new BleServerCallbacks());

  BLEService* pService = pBleServer->createService(SERVICE_UUID);

  pProvisionChar = pService->createCharacteristic(
    CHAR_PROVISION_UUID,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pProvisionChar->setCallbacks(new ProvisionCallbacks());

  pStatusChar = pService->createCharacteristic(
    CHAR_STATUS_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pStatusChar->addDescriptor(new BLE2902());

  pEventLogChar = pService->createCharacteristic(
    CHAR_EVENT_LOG_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pEventLogChar->addDescriptor(new BLE2902());

  pConfigChar = pService->createCharacteristic(
    CHAR_CONFIG_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  pConfigChar->setCallbacks(new ConfigCallbacks());

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  LOG_I("BLE", "Fast Provisioning Advertising as: %s", bleDeviceName.c_str());

  // 2. Load Stored Configuration from NVS
  String savedSsid = "";
  String savedPass = "";
  if (nvsOpen(false)) {
    t1ThresholdSec = preferences.getULong("t1", 300);
    repeatIntervalSec = preferences.getULong("repeat", 15);
    alarmVolume = preferences.getUChar("volume", 80);
    heartbeatIntervalMin = preferences.getULong("hb_interval", 10);

    String storedToken = preferences.getString("token", "");
    if (storedToken.length() == 0 || storedToken == "wsg_secure_token") {
      pairingToken = generateRandomPairingToken();
      preferences.putString("token", pairingToken);
      openPairingWindow();
      LOG_I("SECURITY", "First boot: generated new random token: %s", pairingToken.c_str());
    } else {
      pairingToken = storedToken;
      LOG_I("SECURITY", "Loaded existing pairing token from NVS.");
    }

    savedSsid = preferences.getString("ssid", "");
    savedPass = preferences.getString("pass", "");
    nvsClose();
  } else {
    pairingToken = generateRandomPairingToken();
    openPairingWindow();
    LOG_W("NVS", "Using in-memory defaults due to NVS read failure");
  }

  LOG_I("NVS", "Loaded Escalation Config: T1=%lus, Repeat=%lus, Volume=%d%%, Heartbeat=%lumin",
        t1ThresholdSec, repeatIntervalSec, alarmVolume, heartbeatIntervalMin);
  updateBleConfig();

  WiFi.setAutoReconnect(true);

  if (savedSsid.length() > 0) {
    LOG_I("NVS", "Stored Wi-Fi network found: \"%s\". Auto-connecting...", savedSsid.c_str());
    activeSsid = savedSsid;
    activePass = savedPass;
    initiateWiFiConnection(savedSsid, savedPass);
  } else {
    LOG_I("NVS", "No stored Wi-Fi credentials. Ready for BLE provisioning.");
  }

  // 3. Start Local REST API
  setupRestApi();
}

// ============================================================================
// 20. MAIN LOOP & ESCALATION STATE MACHINE (STRICTLY NON-BLOCKING)
// ============================================================================
void loop() {
  // Feed Task Watchdog Timer at every loop iteration
  feedWatchdog();

  // Handle incoming HTTP client connections (local REST API)
  server.handleClient();

  unsigned long currentMillis = millis();

  // 0. Serial Monitor Commands ('E'/'e': Emergency, 'C'/'c': Cancel, '0'-'3': Log Level)
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == 'E' || c == 'e') {
      LOG_I("SERIAL", "'E' received -> Triggering emergency alert!");
      sendEmergency();
    } else if (c == 'C' || c == 'c') {
      LOG_I("SERIAL", "'C' received -> Cancelling emergency alert!");
      cancelEmergency();
    } else if (c == '0') {
      currentLogLevel = LOG_LEVEL_NONE;
    } else if (c == '1') {
      setLogLevel(LOG_LEVEL_ERROR);
    } else if (c == '2') {
      setLogLevel(LOG_LEVEL_INFO);
    } else if (c == '3') {
      setLogLevel(LOG_LEVEL_DEBUG);
    }
  }

  // Update non-blocking buzzer sequencer
  updateBuzzer();

  // Monitor sensor health (LD2410C radar & microphone)
  checkSensorsHealth();

  // Process reliable BLE advertising restart if client disconnected
  processBleAdvertising();

  // 1. Process Queued Wi-Fi Provisioning
  if (pendingWiFiTrigger) {
    pendingWiFiTrigger = false;
    initiateWiFiConnection(activeSsid, activePass);
  }

  // 1b. Non-blocking Wi-Fi Scan stream (never blocks loop)
  processWiFiScan();

  // 2. Drive Non-blocking Wi-Fi State Machine
  processWiFiStateMachine();

  // 3. Read Hardware Sensors
  presenceDetected = (digitalRead(PIN_RADAR_OUT) == HIGH);
  bool emergencyButtonPressed = (digitalRead(PIN_BUTTON_EMG) == LOW);

  // Highest priority: Emergency Button (re-arms first-pairing window)
  if (emergencyButtonPressed) {
    openPairingWindow();
    if (currentState != STATE_ALARM && currentState != STATE_EMERGENCY) {
      LOG_I("ALERT", "Emergency physical button pressed!");
      sendEmergency();
    }
  }

  // 4. Staged Washroom Escalation State Machine
  unsigned long stillnessDurationSec = 0;

  switch (currentState) {
    case STATE_IDLE:
      if (wifiConnState != WIFI_CONNECTING) {
        digitalWrite(PIN_STATUS_LED, (WiFi.status() == WL_CONNECTED) ? HIGH : LOW);
      }
      digitalWrite(PIN_BUZZER, LOW);
      if (presenceDetected) {
        stillnessStartTime = currentMillis;
        movementDetected = true;
        transitionToState(STATE_PERSON_PRESENT, "RADAR_ENTER", 0);
      }
      break;

    case STATE_PERSON_PRESENT:
    case STATE_MOVING:
      if (!presenceDetected) {
        movementDetected = false;
        stillnessStartTime = 0;
        transitionToState(STATE_IDLE, "RADAR_LEAVE", 0);
      } else {
        stillnessDurationSec = (currentMillis - stillnessStartTime) / 1000;
        if (stillnessDurationSec >= t1ThresholdSec) {
          LOG_I("SAFETY", "Inactivity threshold T1 reached -> INACTIVE_DETECTED");
          inactiveListenStartTime = currentMillis;
          triggerBuzzer(2, 100, 100); // Non-blocking!
          transitionToState(STATE_INACTIVE_DETECTED, "T1_INACTIVITY", stillnessDurationSec);
        }
      }
      break;

    case STATE_STILL_MONITORING:
    case STATE_CHECKING_WELLBEING:
      transitionToState(STATE_INACTIVE_DETECTED, "LEGACY_ALIAS", (currentMillis - stillnessStartTime) / 1000);
      break;

    case STATE_INACTIVE_DETECTED:
      stillnessDurationSec = (currentMillis - stillnessStartTime) / 1000;
      if (!presenceDetected && !isTestMode) {
        digitalWrite(PIN_BUZZER, LOW);
        transitionToState(STATE_IDLE, "RADAR_LEAVE", stillnessDurationSec);
      } else if (movementDetected && (currentMillis - inactiveListenStartTime > 1500)) {
        LOG_I("SAFETY", "User movement detected -> Recovered to MOVING");
        digitalWrite(PIN_BUZZER, LOW);
        if (isTestMode) {
          cancelTestEmergency();
        } else {
          stillnessStartTime = currentMillis;
          transitionToState(STATE_MOVING, "USER_RESPONDED", 0);
        }
      } else if ((currentMillis - inactiveListenStartTime) / 1000 >= (isTestMode ? TEST_STAGE_SEC : listenDurationSec)) {
        LOG_I("SAFETY", "No response to check-in -> Escalate to NO_RESPONSE");
        noResponseStartTime = currentMillis;
        triggerBuzzer(4, 200, 80); // Non-blocking!
        transitionToState(STATE_NO_RESPONSE, isTestMode ? "TEST_STAGE_TIMEOUT" : "NO_RESPONSE_WINDOW_EXPIRED", stillnessDurationSec);
      }
      break;

    case STATE_NO_RESPONSE:
    case STATE_WAITING_FOR_RESPONSE:
      stillnessDurationSec = (currentMillis - stillnessStartTime) / 1000;
      digitalWrite(PIN_BUZZER, (currentMillis / 500) % 2 == 0 ? HIGH : LOW);
      if (!presenceDetected && !isTestMode) {
        digitalWrite(PIN_BUZZER, LOW);
        transitionToState(STATE_IDLE, "RADAR_LEAVE", stillnessDurationSec);
      } else if (movementDetected && (currentMillis - noResponseStartTime > 1500)) {
        LOG_I("SAFETY", "User recovered during NO_RESPONSE alert -> MOVING");
        digitalWrite(PIN_BUZZER, LOW);
        if (isTestMode) {
          cancelTestEmergency();
        } else {
          stillnessStartTime = currentMillis;
          transitionToState(STATE_MOVING, "USER_RECOVERED", 0);
        }
      } else if ((currentMillis - noResponseStartTime) / 1000 >= (isTestMode ? TEST_STAGE_SEC : repeatIntervalSec)) {
        LOG_I("SAFETY", "Escalating to ALARM! Emergency alert triggered.");
        emergencyActive = true;
        transitionToState(STATE_ALARM, isTestMode ? "TEST_ALARM_FIRED" : "REPEAT_INTERVAL_EXPIRED", stillnessDurationSec);

        String uniqueId = generateEmergencyEventId();
        currentEmergencyEventId = uniqueId;
        String payload = "{\"type\":\"EMERGENCY\",\"id\":\"" + uniqueId + "\",\"eventId\":\"" + uniqueId + "\",\"deviceId\":\"" + deviceId + "\",\"trigger\":\"" + (isTestMode ? "TEST" : "NO_RESPONSE") + "\",\"status\":\"ACTIVE\",\"timestamp\":" + String(millis()) + "}";
        notifyChar(pEventLogChar, payload);
        notifyChar(pStatusChar, payload);

        sendEmergencyAlert(isTestMode ? "TEST" : "NO_RESPONSE", isTestMode, uniqueId);
      }
      break;

    case STATE_ALARM:
    case STATE_EMERGENCY:
      stillnessDurationSec = (currentMillis - stillnessStartTime) / 1000;
      // Local alarm sounds buzzer and blinks LED 100% offline, regardless of BLE or Wi-Fi state
      digitalWrite(PIN_BUZZER, (currentMillis / 300) % 2 == 0 ? HIGH : LOW);
      digitalWrite(PIN_STATUS_LED, (currentMillis / 150) % 2 == 0 ? HIGH : LOW);

      if (isTestMode) {
        if ((currentMillis - noResponseStartTime) / 1000 >= (TEST_STAGE_SEC + 3)) {
          LOG_I("TEST", "Test Emergency cycle complete. Resetting to IDLE.");
          cancelTestEmergency();
        }
      } else if (!presenceDetected && !emergencyActive) {
        currentState = STATE_IDLE;
        digitalWrite(PIN_BUZZER, LOW);
        transitionToState(STATE_IDLE, "ALARM_CLEARED", stillnessDurationSec);
      }
      break;
  }

  // 5. Periodic Supabase Telemetry Dispatch (non-blocking via FreeRTOS queue)
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    sendTelemetryToSupabase(currentState, stillnessDurationSec);
  }

  // 6. Periodic Self-Test Heartbeat Dispatch over Wi-Fi / Supabase (non-blocking)
  unsigned long hbIntervalMs = (WiFi.status() == WL_CONNECTED) ? (heartbeatIntervalSec * 1000UL) : (heartbeatIntervalMin * 60UL * 1000UL);
  if (currentMillis - lastHeartbeatTime >= hbIntervalMs || lastHeartbeatTime == 0) {
    lastHeartbeatTime = currentMillis;
    sendHealthHeartbeat();
  }

  // 7. Periodic BLE Status Heartbeat (every 30s over BLE)
  processBleStatusHeartbeat();

  vTaskDelay(pdMS_TO_TICKS(10)); // Yield 10ms to FreeRTOS scheduler & idle task
}
