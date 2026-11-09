# Over-The-Air (OTA) Firmware Updates

This document describes the dual-partition OTA update pipeline, automatic rollback safety mechanisms, partition table configuration, and the step-by-step procedure to compile and publish new firmware releases for the **Washroom Safety Gadget (WSG-01)**.

---

## 1. Dual-Partition Architecture & Rollback Safety

The WSG-01 firmware uses ESP32's native dual-partition Over-The-Air (`ota_0` and `ota_1`) architecture with an active `otadata` selector.

```
+-----------------------------------------------------------------------+
| Flash Memory (4MB)                                                    |
|                                                                       |
| [Bootloader] [NVS (16KB)] [otadata (8KB)]                             |
|                                                                       |
| +-------------------------+       +-------------------------+         |
| | Partition: ota_0        |       | Partition: ota_1        |         |
| | (Slot A - Active App)   | <---> | (Slot B - Staged OTA)   |         |
| | Size: 1.875 MB          |       | Size: 1.875 MB          |         |
| +-------------------------+       +-------------------------+         |
|                                                                       |
| [SPIFFS Storage (192KB)]                                              |
+-----------------------------------------------------------------------+
```

### Automatic 60-Second Health Rollback Guard
1. When new firmware is downloaded and flashed into the inactive slot (e.g., `ota_1`), the bootloader sets its initial state to `ESP_OTA_IMG_PENDING_VERIFY`.
2. Upon first boot of the new partition, `initOtaRollbackCheck()` flags the image as pending verification and starts a 60-second hardware health timer.
3. If the device runs smoothly for **60 continuous seconds** (loop task watchdog fed, radar operational, no kernel panics), the firmware calls:
   ```cpp
   esp_ota_mark_app_valid_cancel_rollback();
   ```
   This cancels the rollback and permanently marks the new partition as the default boot slot.
4. **Failure Case**: If a crash, kernel panic, watchdog timeout, or boot loop occurs within the 60-second window, the ESP-IDF second-stage bootloader automatically detects that validation never completed and **reverts execution back to the previous working partition** on the next reboot.

---

## 2. Partition Table Configuration

To support dual OTA slots with sufficient capacity for BLE, Wi-Fi, and SSL libraries, configure the flash partition table as follows:

Create a custom partition file named `partitions_two_ota.csv`:

```csv
# Name,   Type, SubType, Offset,   Size,     Flags
nvs,      data, nvs,     0x9000,   0x4000,
otadata,  data, ota,     0xd000,   0x2000,
phy_init, data, phy,     0xf000,   0x1000,
ota_0,    app,  ota_0,   0x10000,  0x1E0000,
ota_1,    app,  ota_1,   0x1F0000, 0x1E0000,
spiffs,   data, spiffs,  0x3D0000, 0x30000,
```

### Build Tool Settings
- **Arduino IDE**:
  - Tools $\rightarrow$ **Partition Scheme** $\rightarrow$ select **"Minimal SPIFFS (1.9MB OTA APP / 190KB SPIFFS)"**.
  - Tools $\rightarrow$ **Core Debug Level** $\rightarrow$ **"None"** (for production builds).
- **PlatformIO (`platformio.ini`)**:
  ```ini
  [env:esp32dev]
  platform = espressif32
  board = esp32dev
  framework = arduino
  board_build.partitions = partitions_two_ota.csv
  ```

---

## 3. Supabase Backend Infrastructure

### A. Storage Bucket
1. Navigate to the Supabase Dashboard $\rightarrow$ **Storage**.
2. Create a bucket named `firmware` (set to **Public** or generate signed URLs).
3. Set file size limit to `5 MB` and MIME type allowlist to `application/octet-stream, application/macbinary, application/x-binary`.

### B. Database Schema: `firmware_releases`
Execute the following SQL in your Supabase SQL Editor:

```sql
-- Create firmware releases catalog
CREATE TABLE IF NOT EXISTS public.firmware_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(32) NOT NULL,
    fw VARCHAR(64) NOT NULL UNIQUE,
    protocol INTEGER NOT NULL DEFAULT 1,
    url TEXT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    release_notes TEXT,
    min_app_version VARCHAR(32) DEFAULT '1.0.0',
    file_size_bytes BIGINT,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.firmware_releases ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated and anon users
CREATE POLICY "Allow public read on firmware_releases"
ON public.firmware_releases FOR SELECT
USING (true);
```

---

## 4. Step-by-Step Release Publishing Guide

### Step 1: Update Firmware Version
In `firmware/WashroomSafety_ESP32/WashroomSafety_ESP32.ino`:
```cpp
const char* FIRMWARE_VERSION  = "v1.3.0-esp32";
const int   PROTOCOL_VERSION  = 1;
```

### Step 2: Compile the Binary
- In **Arduino IDE**:
  - Select board: `ESP32 Dev Module`.
  - Click **Sketch** $\rightarrow$ **Export Compiled Binary** (`Ctrl+Alt+S`).
  - Output binary is saved at `build/esp32.esp32.esp32dev/WashroomSafety_ESP32.ino.bin`.
- Or via **Arduino CLI**:
  ```bash
  arduino-cli compile --fqbn esp32:esp32:esp32dev --output-dir ./build firmware/WashroomSafety_ESP32/WashroomSafety_ESP32.ino
  ```

### Step 3: Compute Cryptographic SHA-256 Checksum
The ESP32 validates every byte downloaded against this SHA-256 hash. Compute it:

- **Windows (PowerShell)**:
  ```powershell
  (Get-FileHash -Algorithm SHA256 .\build\WashroomSafety_ESP32.ino.bin).Hash.ToLower()
  ```
- **macOS / Linux**:
  ```bash
  sha256sum ./build/WashroomSafety_ESP32.ino.bin
  ```

### Step 4: Upload Binary to Supabase Storage
Upload `WashroomSafety_ESP32.ino.bin` to bucket `firmware`:
- Destination path: `firmware/wsg01_v1.3.0.bin`
- Public URL: `https://<YOUR_SUPABASE_ID>.supabase.co/storage/v1/object/public/firmware/wsg01_v1.3.0.bin`

### Step 5: Register Release Record
Insert the release metadata into the `firmware_releases` table:

```sql
INSERT INTO public.firmware_releases (
    version,
    fw,
    protocol,
    url,
    sha256,
    release_notes,
    min_app_version,
    file_size_bytes
) VALUES (
    '1.3.0',
    'v1.3.0-esp32',
    1,
    'https://<YOUR_SUPABASE_ID>.supabase.co/storage/v1/object/public/firmware/wsg01_v1.3.0.bin',
    'b4c4839cf9e5831969a259c631a29f8f48074d6f46990d0b0b8c665db7251703',
    '• Dual-partition OTA support with 60-second health rollback guard.
• HTTPS binary download with SHA-256 checksum verification.
• Improved Wi-Fi connection recovery and FreeRTOS task watchdog.',
    '1.0.0',
    1153434
);
```

---

## 5. Mobile App Safety Guardrails

The mobile application enforces strict life-safety checks before offering or starting an update:

1. **Explicit Manual Approval ("Do Not Flash Automatically")**:
   - The app **never** initiates firmware flashing without human consent.
   - The user must review release notes, check prerequisite readiness, and tap **"Start Update"** in an explicit confirmation dialog.
2. **Phone Battery Threshold**:
   - Phone battery level must be strictly **$> 30\%$**. If battery is $\le 30\%$, the update button is disabled to prevent phone shutdown during the BLE command session.
3. **Wi-Fi Connectivity Requirement**:
   - The ESP32 device must be connected to local 2.4 GHz Wi-Fi. The binary is downloaded directly by the hardware over HTTPS to avoid slow, lossy BLE chunk transfers.
4. **Cryptographic Token Authorization**:
   - The app attaches the device's per-device pairing token (from `expo-secure-store`) to the `START_OTA` command. Unpaired devices or unauthorized clients cannot trigger updates.
5. **Real-Time Progress & Rollback Monitoring**:
   - The app listens to BLE GATT status notifications:
     - `{"type":"ota_progress","progress":45,"bytes":519168,"total":1153434}`
     - `{"type":"ota_status","status":"VERIFYING"}`
     - `{"type":"ota_status","status":"SUCCESS"}`
   - If the device does not report healthy within 75 seconds following reboot, the app warns the user that automatic partition rollback may have occurred.

