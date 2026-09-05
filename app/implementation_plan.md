# End‑to‑End Connection – Next Steps

**Goal:** Wire a real ESP32 device to the app via Supabase (Realtime telemetry → UI).  The app already has the Supabase client and environment variables.

## 1️⃣ Add Supabase integration in the state store
- Import `supabase` from `src/services/supabaseClient.ts`.
- In `useAppStore.ts` create an `initializeSupabase()` function that:
  - Subscribes to `telemetry` INSERT events → update `telemetry` state & set `isOnline=true`.
  - Subscribes to `emergencies` INSERT events → set `activeEmergency`.
  - Optionally loads the device config on app start (`supabase.from('devices').select(...).eq('id', <deviceId>)`).
- Call `initializeSupabase()` once (e.g., inside a `useEffect` in `App.tsx`).

## 2️⃣ Update `DeviceCommunicationService`
- Create two concrete classes implementing a common interface:
  - `SimulatorDeviceService` (already used in demo mode).
  - `SupabaseDeviceService` that forwards telemetry to Supabase via `supabase.from('telemetry').insert(...)` and sends emergency events via `supabase.from('emergencies').insert(...)`.
- Export a factory `export const deviceService = isSimulator ? new SimulatorDeviceService() : new SupabaseDeviceService();`
- Add a toggle in **DemoScreen** (`Switch` component) to enable/disable simulator mode.

## 3️⃣ ESP32 Firmware (Arduino)
- Provide a `.ino` file (`firmware/WashroomSafety.ino`) that:
  - Connects to Wi‑Fi.
  - Posts telemetry JSON to `https://<PROJECT>.supabase.co/rest/v1/telemetry` using the **anon** key.
  - Optionally posts an emergency row when a keyword is detected.
- Add instructions in `README.md` for installing the Arduino ESP32 board URL, compiling, and flashing.

## 4️⃣ (Optional) Admin Edge Function – **Postponed**
- The admin Edge Function will be added later. No code is generated now.

## 5️⃣ UI polish & testing
- Ensure the **DashboardScreen** displays live telemetry from the store (already wired to simulator, now to real data).
- Show an **Emergency overlay** when a realtime emergency arrives.
- Add a **Settings** option to toggle “Real Device” vs “Simulator”.
- Run `npm run start` and test on a browser and on a device (Expo Go). Verify that:
  1. Telemetry appears instantly after the ESP32 posts.
  2. Emergency rows trigger the overlay.
  3. Offline detection works (no telemetry for > 10 s → show OFFLINE).

## 6️⃣ Documentation
- Update `README.md` with sections:
  - Supabase setup (project ID, anon key, environment variables).
  - ESP32 firmware upload guide.
  - How to run the app in simulator vs real‑device mode.
  - Optional admin Edge Function usage.

---
### Open Questions (need your input)
> **[IMPORTANT]** What authentication model do you prefer for the app?
> - **Anonymous only** (simplest, no user login). 
> - **Email/password** using Supabase Auth (adds a login screen). 
>
> **[IMPORTANT]** Should the ESP32 generate its own `device_id` or shall we pre‑provision a row in the `devices` table?
> - Auto‑generate on first boot (store in flash). 
> - Pre‑provision via an admin UI/Edge Function.
>
> **[WARNING]** Do you want an admin Edge Function now, or postpone until later?

## Verification Plan
- **Automated:** `npm run lint` & `npx tsc --noEmit` (type‑check). 
- **Manual:** Run the app (`npm start`), flash ESP32, watch realtime updates on the dashboard.

---
*This implementation plan is saved as `implementation_plan.md`.  Please review the open questions and approve or adjust before we proceed.*
