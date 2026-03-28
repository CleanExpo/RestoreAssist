# RestoreAssist Mobile App — Complete Build Specification

## Project Overview
- **App**: RestoreAssist — Australian IICRC S500:2025 water damage restoration mobile app
- **Framework**: React Native + Expo SDK 55 (Development Builds)
- **Location**: `D:\RestoreAssist\mobile\`
- **Platforms**: iOS + Android (Phone + Tablet)
- **Scaffold Status**: 30 files, 5,500+ lines written — needs `npm install` + type-check

## Architecture

### Tech Stack
- React Native 0.76.0 + Expo SDK ~52.0.0
- expo-router (file-based routing)
- Zustand (state management)
- expo-sqlite (offline-first local DB)
- expo-secure-store (BYOK API key security — iOS Keychain / Android Keystore)
- expo-camera + expo-image-picker (inspection photos)
- expo-location (GPS auto-tagging)
- @supabase/supabase-js (backend sync)
- Zod + react-hook-form (validation)
- EAS Build (development/preview/production profiles)

### BYOK Architecture (CEO-APPROVED — NO EXCEPTIONS)
Hard-coded 6-model allowlist:
- Anthropic: `claude-opus-4-6`, `claude-sonnet-4-6`
- Google: `gemini-3.1-pro`, `gemini-3.1-flash`
- OpenAI: `gpt-5.4`, `gpt-5.4-mini`

Clients bring their own API keys. Keys stored in expo-secure-store. Validated at constant level. System rejects any model not on the allowlist.

### Offline-First Pattern
- expo-sqlite with 6 tables (inspections, moisture_readings, photos, equipment, environmental, sync_queue)
- Sync queue pattern with retry logic every 30 seconds
- Last-write-wins conflict resolution
- SyncEngine class with periodic sync, online detection via expo-network

---

## File Tree (30 files)

```
D:\RestoreAssist\mobile\
├── package.json, app.json, eas.json, tsconfig.json (config)
├── shared/types.ts (220 lines — ALL types + psychrometric calcs)
├── constants/theme.ts (design tokens), constants/byok.ts (6-model allowlist validation)
├── lib/supabase.ts, lib/store/auth-store.ts (127 lines), lib/store/inspection-store.ts (437 lines — 6 SQLite tables)
├── lib/api/byok-client.ts (153 lines — multi-provider dispatch)
├── lib/sync/sync-engine.ts (339 lines — 30s periodic sync)
├── lib/sensors/sensor-adapter.ts (133 lines — pluggable adapters)
├── app/_layout.tsx, app/index.tsx (root)
├── app/(auth)/login.tsx, signup.tsx, _layout.tsx
├── app/(tabs)/_layout.tsx, index.tsx (dashboard 169 lines)
├── app/(tabs)/inspections/index.tsx (508 lines — list), new.tsx (1,098 lines — capture)
├── app/(tabs)/settings/index.tsx (155 lines — BYOK config)
├── components/ui/Button.tsx (216 lines), Card.tsx (162 lines)
└── components/inspection/MoistureReadingInput.tsx (572 lines)
```

---

## Issue-by-Issue Build Specs

### RA-226: [EPIC] Parent Issue
Parent epic. All sub-issues below roll up here.

### RA-227: Project Scaffold
**Status**: DONE (scaffold written, needs npm install)
**Files**: package.json, app.json, eas.json, tsconfig.json
- bundleIdentifier: com.unitegroup.restoreassist
- plugins: expo-router, expo-secure-store, expo-sqlite, expo-location, expo-camera, expo-notifications, expo-image-picker
- supportsTablet: true
- EAS profiles: development (simulator), preview (internal), production (App Store/Play Store)
- tsconfig: strict mode, path aliases @/lib, @/components, @/shared, @/constants

### RA-228: Auth Screens
**Status**: DONE
**Files**: app/(auth)/login.tsx, signup.tsx, _layout.tsx
- Login: email + password, Supabase signInWithPassword
- Signup: name + email + password + confirm, Zod validation
- Auth store (lib/store/auth-store.ts): Zustand with initialize/signIn/signUp/signOut, onAuthStateChange listener

### RA-229: BYOK Settings
**Status**: DONE
**Files**: app/(tabs)/settings/index.tsx, constants/byok.ts, lib/store/auth-store.ts
- Provider chip selector: Anthropic / Google / OpenAI
- Model dropdown: Filtered to selected provider's 2 models only
- API key input: SecureStore encrypted storage
- validateModel() checks against ALLOWED_MODELS constant
- PROVIDER_AUTH config: endpoints + header patterns per provider

### RA-230: Dashboard
**Status**: DONE
**Files**: app/(tabs)/index.tsx (169 lines)
- Stats grid: drafts, in-progress, completed, pending sync counts
- BYOK warning banner when no config set
- Quick actions: New Inspection button
- Recent inspections with category color coding

### RA-231: Inspection Capture (CORE V1 FEATURE)
**Status**: DONE
**Files**: app/(tabs)/inspections/new.tsx (1,098 lines)
- Camera (expo-camera) + gallery (expo-image-picker), GPS auto-tag (expo-location)
- Moisture: MoistureReadingInput (572 lines), material picker, calibration date (RA-221), 56px touch targets
- Environmental: temp/humidity/dewpoint, auto GPP (Magnus formula), auto EMC (Hailwood-Horrobin) (RA-222, RA-223)
- Equipment: type, serial, location, timestamp (RA-224)
- Water damage: CAT_1/2/3 + CLASS_1/2/3/4 with S500 color coding
- Save draft or submit, haptic feedback, auto SQLite persistence

### RA-232: Inspections List
**Status**: DONE
**Files**: app/(tabs)/inspections/index.tsx (508 lines)
- Search by address/job number
- Filter tabs: All/Drafts/In Progress/Completed/Synced
- Category badges (CAT_1=blue, CAT_2=orange, CAT_3=red)
- Sync status dots (green/yellow/red)
- Pull-to-refresh, FAB for new inspection, 48px+ touch targets

### RA-233: Offline-First SQLite + Sync Engine
**Status**: DONE
**Files**: lib/store/inspection-store.ts (437 lines), lib/sync/sync-engine.ts (339 lines)
- 6 SQLite tables: inspections, moisture_readings, photos, equipment, environmental, sync_queue
- Zustand store: initializeDB, full CRUD, auto sync queue insertion
- SyncEngine: startPeriodicSync(30s), isOnline(), syncAll(), retry logic (5 attempts max)
- getPendingCount(), getFailedItems(), retryFailed()

### RA-234: BYOK API Client
**Status**: DONE
**Files**: lib/api/byok-client.ts (153 lines)
- BYOKClient class with static fromSecureStore() factory
- generate() dispatches to generateAnthropic/Google/OpenAI
- Provider-specific request/response format handling
- validateKey() for testing keys per provider

### RA-235: Sensor Abstraction Layer
**Status**: DONE
**Files**: lib/sensors/sensor-adapter.ts (133 lines)
- SensorAdapter interface: id, name, type, isAvailable, connect, disconnect, read
- ManualMoistureAdapter + ManualEnvironmentalAdapter (v1)
- BluetoothMoistureAdapter placeholder (v2, react-native-ble-plx)
- SensorRegistry: register/get/getAvailable/getByType, hot-swappable

### RA-236: Build Verification
**Status**: TODO
1. cd D:\RestoreAssist\mobile && npm install
2. Configure Supabase URL + anon key in lib/supabase.ts
3. npx tsc --noEmit (verify TypeScript)
4. npx expo start --dev-client (verify dev server)
5. Configure EAS project ID, test iOS + Android builds

---

## S500:2025 Compliance Mapping
- RA-221: Moisture meter calibration tracking → MoistureReadingInput: calibrationDate, meterBrand
- RA-222: Vapor pressure/GPP persistence → EnvironmentalReading: gpp via Magnus formula
- RA-223: EMC calculations → EnvironmentalReading: emc via Hailwood-Horrobin equation
- RA-224: Equipment deployment tracking → EquipmentDeployment: serialNumber, location, deployedAt

## BYOK Allowlist (IMMUTABLE)
claude-opus-4-6, claude-sonnet-4-6, gemini-3.1-pro, gemini-3.1-flash, gpt-5.4, gpt-5.4-mini

## Build Order (Recommended)
1. RA-227: Scaffold verification (npm install + tsconfig)
2. RA-228: Auth screens (foundation for all authenticated routes)
3. RA-233: Offline-First SQLite (data layer must exist before UI)
4. RA-229: BYOK Settings (API key storage)
5. RA-234: BYOK Client (API dispatch)
6. RA-235: Sensor Layer (adapter registration)
7. RA-230: Dashboard (depends on inspection store)
8. RA-231: Inspection Capture (core feature, depends on all above)
9. RA-232: Inspections List (depends on inspection store)
10. RA-236: Build Verification (final gate)
