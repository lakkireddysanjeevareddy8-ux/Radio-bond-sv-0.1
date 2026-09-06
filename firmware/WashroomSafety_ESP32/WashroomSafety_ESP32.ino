/*
 * ============================================================================
 * Washroom Safety Monitoring System - ESP32 Firmware
 * Hardware:
 *   - ESP32 Development Board (ESP32-WROOM-32)
 *   - HLK-LD2410 Human Presence Radar Sensor (Digital OUT or UART)
 *   - Emergency Push Button (Active LOW with internal pull-up)
 *   - Status LED & Active Buzzer
 *
 * Platform: Arduino IDE / PlatformIO
 * Dependencies:
 *   - ArduinoJson (by Benoit Blanchon)
 *   - WiFi / HTTPClient / WiFiClientSecure (Built-in ESP32 core)
 * ============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

// ============================================================================
// 1. NETWORK & SUPABASE CONFIGURATION
// ============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Supabase details (Matched to your Radio-bond app)
const char* SUPABASE_URL      = "https://xobasrolmpmvrnjcikcq.supabase.co";
const char* SUPABASE_ANON_KEY = "sb_publishable_HMCLVIpmvtvvB5G7kkIyLw_oF1Zk1OI";

// Device Identifier (Store this UUID in your app's EXPO_PUBLIC_DEVICE_UUID)
const char* DEVICE_UUID       = "demo-device-uuid";
const char* FIRMWARE_VERSION  = "v1.0.0-esp32";

// ============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ============================================================================
#define PIN_RADAR_OUT   4   // LD2410 / PIR Sensor Digital OUT (HIGH = Presence detected)
#define PIN_BUTTON_EMG  14  // Emergency Push Button (Active LOW with internal pull-up)
#define PIN_BUZZER      18  // Active Buzzer for warning tone & alarms
#define PIN_STATUS_LED  2   // Onboard Blue LED / Status indicator

// ============================================================================
// 3. SAFETY TIMING & THRESHOLDS (Seconds)
// ============================================================================
const unsigned long STILLNESS_THRESHOLD_SEC = 25; // Still for 25s triggers wellbeing check
const unsigned long RESPONSE_TIMEOUT_SEC    = 15; // 15s to respond before emergency alert
const unsigned long TELEMETRY_INTERVAL_MS   = 3000; // Send telemetry to cloud every 3 seconds

// ============================================================================
// 4. STATE MACHINE DEFINITION
// ============================================================================
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const char* getStateString(SafetyState state) {
  switch (state) {
    case STATE_IDLE:                  return "IDLE";
    case STATE_PERSON_PRESENT:        return "PERSON_PRESENT";
    case STATE_MOVING:                return "MOVING";
    case STATE_STILL_MONITORING:      return "STILL_MONITORING";
    case STATE_CHECKING_WELLBEING:    return "CHECKING_WELLBEING";
    case STATE_WAITING_FOR_RESPONSE:  return "WAITING_FOR_RESPONSE";
    case STATE_EMERGENCY:             return "EMERGENCY";
    default:                          return "UNKNOWN";
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
// CLOUD COMMUNICATION (SUPABASE REST API)
// ============================================================================
void sendTelemetryToSupabase(SafetyState state, unsigned long stillnessSec) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Not connected, skipping telemetry transmission");
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Skip certificate verification for speed

  HTTPClient https;
  String endpoint = String(SUPABASE_URL) + "/rest/v1/telemetry";

  if (https.begin(client, endpoint)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("apikey", SUPABASE_ANON_KEY);
    https.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
    https.addHeader("Prefer", "return=minimal");

    // Construct telemetry payload
    StaticJsonDocument<512> doc;
    doc["device_id"]         = DEVICE_UUID;
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
      Serial.printf("[Cloud Telemetry] State: %s | Stillness: %lus | HTTP: %d\n",
                    getStateString(state), stillnessSec, httpCode);
    } else {
      Serial.printf("[Cloud Telemetry] Error: %s\n", https.errorToString(httpCode).c_str());
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

    StaticJsonDocument<256> doc;
    doc["device_id"]  = DEVICE_UUID;
    doc["trigger"]    = trigger;
    doc["status"]     = "ACTIVE";

    String requestBody;
    serializeJson(doc, requestBody);

    int httpCode = https.POST(requestBody);
    Serial.printf("[Cloud Emergency] Trigger: %s | HTTP: %d\n", trigger, httpCode);
    https.end();
  }
}

// ============================================================================
// ARDUINO SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  bootTime = millis();

  Serial.println("\n==========================================");
  Serial.println("  Washroom Safety Monitor - ESP32 Starting");
  Serial.println("==========================================");

  // Pin configurations
  pinMode(PIN_RADAR_OUT, INPUT);
  pinMode(PIN_BUTTON_EMG, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);

  // Connect to Wi-Fi
  Serial.printf("Connecting to Wi-Fi: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
    digitalWrite(PIN_STATUS_LED, HIGH);
    beepBuzzer(2, 80, 80); // Ready confirmation beeps
  } else {
    Serial.println("\n[WiFi] Connection timed out. Running in local offline mode.");
  }
}

// ============================================================================
// MAIN LOOP & STATE MACHINE
// ============================================================================
void loop() {
  unsigned long currentMillis = millis();

  // 1. Read Physical Sensors
  presenceDetected = (digitalRead(PIN_RADAR_OUT) == HIGH);
  bool emergencyButtonPressed = (digitalRead(PIN_BUTTON_EMG) == LOW);

  // Emergency Button has highest priority
  if (emergencyButtonPressed && currentState != STATE_EMERGENCY) {
    Serial.println("[ALERT] Emergency physical button pressed!");
    currentState = STATE_EMERGENCY;
    emergencyActive = true;
    sendEmergencyAlert("BUTTON");
    sendTelemetryToSupabase(currentState, 0);
  }

  // 2. Safety State Machine
  unsigned long stillnessDurationSec = 0;

  switch (currentState) {
    case STATE_IDLE:
      digitalWrite(PIN_BUZZER, LOW);
      if (presenceDetected) {
        Serial.println("[State] Person entered washroom -> PERSON_PRESENT");
        currentState = STATE_PERSON_PRESENT;
        movementDetected = true;
        stillnessStartTime = currentMillis;
      }
      break;

    case STATE_PERSON_PRESENT:
    case STATE_MOVING:
      if (!presenceDetected) {
        Serial.println("[State] Person left washroom -> IDLE");
        currentState = STATE_IDLE;
        movementDetected = false;
        stillnessStartTime = 0;
      } else {
        // Radar detects micro-movement or stillness
        movementDetected = true;
        currentState = STATE_MOVING;
        stillnessStartTime = currentMillis; // Reset stillness counter while moving
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
          Serial.println("[State] Stillness threshold exceeded -> CHECKING_WELLBEING");
          currentState = STATE_CHECKING_WELLBEING;
          wellbeingStartTime = currentMillis;
          beepBuzzer(3, 200, 150); // Audible wellbeing check chime
        }
      }
      break;

    case STATE_CHECKING_WELLBEING:
    case STATE_WAITING_FOR_RESPONSE:
      stillnessDurationSec = (currentMillis - stillnessStartTime) / 1000;
      unsigned long waitDurationSec = (currentMillis - wellbeingStartTime) / 1000;

      if (movementDetected) {
        Serial.println("[State] Motion detected! Person is safe -> MOVING");
        currentState = STATE_MOVING;
        digitalWrite(PIN_BUZZER, LOW);
      } else if (waitDurationSec >= RESPONSE_TIMEOUT_SEC) {
        Serial.println("[ALERT] No response within timeout! -> EMERGENCY");
        currentState = STATE_EMERGENCY;
        emergencyActive = true;
        sendEmergencyAlert("NO_RESPONSE");
      }
      break;

    case STATE_EMERGENCY:
      // Pulse alarm buzzer continuously
      digitalWrite(PIN_BUZZER, (currentMillis / 500) % 2 == 0 ? HIGH : LOW);
      digitalWrite(PIN_STATUS_LED, (currentMillis / 250) % 2 == 0 ? HIGH : LOW);

      // Can be cancelled by holding the emergency button or leaving the room
      if (!presenceDetected) {
        Serial.println("[State] Room cleared. Emergency reset to IDLE.");
        currentState = STATE_IDLE;
        emergencyActive = false;
        digitalWrite(PIN_BUZZER, LOW);
        digitalWrite(PIN_STATUS_LED, HIGH);
      }
      break;
  }

  // 3. Periodic Telemetry Transmission
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;
    unsigned long currentStillSec = (stillnessStartTime > 0 && presenceDetected) 
                                      ? (currentMillis - stillnessStartTime) / 1000 
                                      : 0;
    sendTelemetryToSupabase(currentState, currentStillSec);
  }

  delay(50); // Small cycle delay
}
