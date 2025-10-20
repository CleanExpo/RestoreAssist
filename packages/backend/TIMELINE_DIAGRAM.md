# Timeline Diagram: tsx Watch Module Reload Issue

## Visual Timeline

```
TIME    | EVENT                           | users.size | authService state
--------|--------------------------------|------------|-------------------
T+0.0s  | npm run dev starts             | 0          | Module loading...
T+0.1s  | authService.ts loaded          | 0          | Empty Map created
T+0.2s  | index.ts loaded                | 0          | IIFE starts
T+0.3s  | initializeDefaultUsers() runs  | 0 → 2      | Adding admin, demo
T+0.4s  | console.log "✅ 2 users"       | 2          | ✅ HEALTHY STATE
T+0.5s  | app.listen() called            | 2          | Server listening
T+0.6s  | Server ready on :3001          | 2          | ✅ READY
        |                                |            |
T+1.0s  | Playwright health check        | 2          | GET /api/health → 200
T+1.1s  | Health check succeeds          | 2          | Playwright: "Ready!"
T+1.2s  | Playwright waits briefly       | 2          | Tests about to start...
        |                                |            |
        | ⚠️  CRITICAL RACE CONDITION WINDOW ⚠️     |
        |                                |            |
T+2.0s  | tsx watch: "file stabilized"   | 2          | ⚠️ Reload triggered
T+2.1s  | Module cache cleared           | 2 → 0      | ⚠️ Old Map GC'd
T+2.2s  | authService.ts re-imported     | 0          | ❌ NEW empty Map!
T+2.3s  | New singleton exported         | 0          | ❌ BROKEN STATE
        |                                |            |
T+2.5s  | Test: POST /api/auth/login     | 0          | Looking for demo@...
T+2.6s  | authService.login() called     | 0          | Array.from(users.values())
T+2.7s  | find(u => u.email === email)   | 0          | → undefined
T+2.8s  | if (!user) throw Error         | 0          | ❌ "Invalid credentials"
T+2.9s  | Test receives 401              | 0          | ❌ TEST FAILS
```

## State Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: INITIALIZATION (Working Correctly)                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [authService module]          [index.ts IIFE]             │
│         │                             │                     │
│         ├─ const users = new Map()    │                     │
│         │  (empty)                    │                     │
│         │                             │                     │
│         │  ◄────────────────────────  │                     │
│         │     initializeDefaultUsers()                      │
│         │                             │                     │
│         ├─ users.set('admin', ...)    │                     │
│         ├─ users.set('demo', ...)     │                     │
│         │                             │                     │
│         └─► users.size = 2 ───────────┤                     │
│                                       │                     │
│                                  ✅ SUCCESS                 │
│                                       │                     │
│                                 app.listen()                │
│                                       │                     │
│                               Server ready ✓                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

                        ↓
                        ↓ (Health check: 200 OK)
                        ↓ (Playwright: "Server ready")
                        ↓

┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: TSX WATCH RELOAD (The Problem)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [tsx watch daemon]                                         │
│         │                                                   │
│         ├─ Detects: "Files stabilized"                      │
│         │          or "Import graph changed"                │
│         │                                                   │
│         ├─ Decision: Reload authService module              │
│         │                                                   │
│         └─────────────────────┐                             │
│                               │                             │
│                        Module cache clear                   │
│                               │                             │
│                               ↓                             │
│                                                             │
│  [OLD authService]      [NEW authService]                  │
│         │                      │                            │
│   users.size = 2  ──GC──►      │                            │
│   (garbage collected)          ├─ const users = new Map()   │
│                               │   (empty!)                  │
│                               │                             │
│                               └─► users.size = 0            │
│                                                             │
│                                   ❌ BROKEN                 │
│                                                             │
│  NOTE: IIFE in index.ts does NOT re-run!                    │
│        It only ran once during initial load.                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

                        ↓
                        ↓ (Tests start executing)
                        ↓

┌─────────────────────────────────────────────────────────────┐
│ PHASE 3: TEST EXECUTION (Fails)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Test]                    [authService]                    │
│    │                             │                          │
│    ├─ POST /api/auth/login       │                          │
│    │  email: demo@...            │                          │
│    │                             │                          │
│    └──────────────────────────►  │                          │
│                          login() │                          │
│                                  ├─ Find user in Map        │
│                                  │  Array.from(users.values())│
│                                  │  .find(u => u.email === email)│
│                                  │                          │
│                                  │  users.size = 0          │
│                                  │  Result: undefined       │
│                                  │                          │
│                                  ├─ if (!user)              │
│                                  │    throw Error           │
│                                  │                          │
│      ◄─────────────────────────  └─ "Invalid credentials"  │
│   401                                                       │
│                                                             │
│   ❌ TEST FAILS                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Module Import Graph

```
┌────────────────────────────────────────────────────────────┐
│ INITIAL LOAD (T+0s to T+1s)                                │
└────────────────────────────────────────────────────────────┘

    index.ts                authService.ts
       │                           │
       │  import { authService }   │
       │ ─────────────────────────►│
       │                           │
       │                        const users = Map()
       │                        export const authService = new AuthService()
       │                           │
       │ ◄─────────────────────────┤
       │   (singleton instance)    │
       │                           │
    (async IIFE)                   │
       │                           │
       ├─ authService              │
       │    .initializeDefaultUsers()
       │ ─────────────────────────►│
       │                        users.set(...)
       │                        users.set(...)
       │ ◄─────────────────────────┤
       │   (Promise resolved)      │
       │                           │
    ✅ users.size = 2           ✅ users.size = 2


┌────────────────────────────────────────────────────────────┐
│ AFTER TSX RELOAD (T+2s onwards)                            │
└────────────────────────────────────────────────────────────┘

    index.ts                authService.ts (RELOADED)
       │                           │
       │  import { authService }   │
       │  (cached from before)     │
       │                           │
       │                        MODULE RELOAD TRIGGERED
       │                           │
       │                        OLD Map discarded
       │                        NEW const users = Map()
       │                        NEW export const authService
       │                           │
       │ ◄─────────────────────────┤
       │  (NEW singleton)          │
       │  (but IIFE already ran!)  │
       │                           │
       │                           │
    (IIFE does NOT re-run)         │
       │                           │
       │                        ❌ users.size = 0
    ⚠️ No re-initialization     ❌ Empty Map
```

## The Critical Race Window

```
Initialization Complete ───────────┐
                                   │
Server Starts ─────────────────────┤
                                   │
Health Check (200 OK) ─────────────┤
                                   │
Playwright: "Ready" ───────────────┤
                                   │
                           ⚠️  VULNERABLE WINDOW  ⚠️
                                   │
                                   ├─ tsx watch may reload here
                                   │  (timing unpredictable)
                                   │
Tests Start Executing ─────────────┤
                                   │
Login Request ─────────────────────┘

If tsx reload happens AFTER "Ready" but BEFORE tests start:
→ Tests will use empty users Map
→ All auth tests will fail with 401
```

## Why Health Check Doesn't Catch This

```
Health Check Endpoint:
  GET /api/health
    ↓
  Does NOT use authService
    ↓
  Returns { status: 'healthy', ... }
    ↓
  ✅ Always succeeds (unless server crashed)

Login Endpoint:
  POST /api/auth/login
    ↓
  REQUIRES authService with populated users Map
    ↓
  If Map empty → 401 "Invalid credentials"
    ↓
  ❌ Fails if module was reloaded
```

The health check is too simple to detect the state corruption.

## Proof of Timing

From actual test output logs:

```bash
# Server initialization (happens once):
🔍 [INIT] Starting server initialization...
🔍 [AUTH] Final user count after init: 2
✅ Default users initialized successfully

# Health check (Playwright sees this):
✓ GET /api/health should return healthy status (56ms)

# Login test (uses corrupted state):
Login error: Error: Invalid credentials
    at AuthService.login (authService.ts:52:13)

# Later tests fail due to no auth token:
Response status: 401
Response body: {"error":"Authentication required","message":"No authorisation header provided"}
```

**Observation**: The initialization logs appear, health check passes, but login still fails. This confirms the module was reloaded between health check and login test.

## Conclusion

The race condition window is narrow (typically 1-3 seconds) but consistent enough to cause test failures. The tsx watch daemon's hot-reload mechanism is the culprit, clearing the in-memory state that was populated during initialization.

**Fix**: Use persistent storage (database) instead of in-memory Map, or disable watch mode during E2E tests.
