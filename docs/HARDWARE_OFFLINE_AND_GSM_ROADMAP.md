# Washroom Safety Guardian (WSG-01)
## Autonomous Offline Operation & GSM / Cellular Fallback Roadmap

---

### 1. Autonomous On-Device Operation (Offline Safety Guarantee)

The WSG-01 is engineered with a **local-first safety architecture**. The life-safety detection and alert pipeline does not depend on cloud uptime, Wi-Fi router connectivity, or internet access:

1. **Radar Millimeter-Wave Sensing (LD2410C)**:
   - Operates over dedicated digital GPIO 4.
   - Detects occupancy, micro-movements, breathing, and prolonged stillness directly on the ESP32 silicon.
2. **Local Audio Siren & Visual Strobe**:
   - The active piezo buzzer (GPIO 18) generates urgent alarm pulses (400ms square wave alternation) directly in the ESP32 state machine (`STATE_EMERGENCY`).
   - The status LED (GPIO 2) pulses at 200ms intervals.
   - **Zero Network Dependency**: Even if the home router is powered off, Wi-Fi password changes, or the ISP goes down, the on-device alarm sounds immediately inside the residence to alert family members or neighbors.
3. **Graceful Cloud Telemetry Re-association**:
   - Cloud HTTP dispatches (`sendEmergencyAlert` and `sendTelemetryToSupabase`) check `WiFi.status() == WL_CONNECTED` without blocking the main loop.
   - Reconnection runs asynchronously in the background (`processWiFiStateMachine`) without locking the radar sampling or buzzer tone.

---

### 2. Mobile App Offline State Display

- **Strict Non-Emergency Offline Indicator**:
  - The mobile app displays an amber/red subtle badge: `OFFLINE (LOCAL SAFEGUARD)`.
  - It clearly explains: *"Cloud connectivity is paused. Local Safety Guard is ACTIVE: The physical LD2410C millimeter-wave radar and piezo buzzer continue to run directly on the hardware in the washroom."*
  - **No False Alarms**: A lost Wi-Fi connection NEVER triggers an emergency siren on caregiver phones or the high-importance emergency push channel.

---

### 3. GSM / SMS Cellular Fallback Roadmap (Future Hardware Expansion)

To provide remote alerts even in homes without reliable broadband or during power outages, the WSG-01 hardware expansion header is reserved for a cellular modem daughterboard.

#### Recommended Hardware:
- **Module**: SIM7600E / SIM7600G (LTE Cat-1 / 4G with fallback) or SIM800L (2G GSM / SMS).
- **Interface**: ESP32 Hardware UART2:
  - `GPIO 16`: RX2 (ESP32 RX <- GSM TX)
  - `GPIO 17`: TX2 (ESP32 TX -> GSM RX)
  - `GPIO 5`: GSM Power Key / Reset pin

#### Proposed Architecture:
```
             ┌────────────────────────┐
             │   WSG-01 ESP32 Core    │
             │ (Radar, State Machine) │
             └───────────┬────────────┘
                         │
                 Emergency Triggered
                         │
         ┌───────────────┴──────────────┐
         ▼                              ▼
  Local Piezo Buzzer            Wi-Fi Connected?
  (Sounds IMMEDIATELY)          ├── YES ──► Supabase Push / Caregivers
                                └── NO  ──► Fallback: AT+CMGS over UART2
                                            (SMS to Primary Emergency Contact)
```

#### Proposed AT Command Sequence:
1. `AT+CMGF=1` (Set SMS text mode)
2. `AT+CMGS="+1234567890"` (Send SMS to primary caregiver phone)
3. Message text: `EMERGENCY ALERT: Washroom Safety Guardian WSG-01 detected stillness/emergency in Main Bathroom. No WiFi connection. Please check occupant immediately.`
4. Followed by `ATD+1234567890;` (Voice dial siren ring to caregiver phone).

---

### 4. Hardware Health & Telemetry Specs

| Metric | Transport | Nominal Range | Warning Threshold | Action |
|---|---|---|---|---|
| **Battery Percentage** | ADC / Voltage Divider | 100% - 0% | <= 20% | Non-emergency maintenance banner on dashboard |
| **Wi-Fi RSSI** | 802.11 b/g/n beacon | -30 to -85 dBm | < -80 dBm | Suggest repositioning closer to Wi-Fi access point |
| **Last Seen Heartbeat** | Supabase HTTPS (3s) | < 30 seconds | > 5 minutes | Display "Device Unreachable" maintenance alert |
| **Piezo Buzzer Status** | Direct GPIO 18 | 0 / 1 (PWM) | N/A | Sounds automatically on emergency regardless of network |
