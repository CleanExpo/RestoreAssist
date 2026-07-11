# `mobile/` — DORMANT Expo track (do not ship from here)

> **Status: dormant.** The RestoreAssist iOS app on the App Store is **NOT** built from this
> directory. This is a parallel, self-contained Expo project that is **not in the root
> `pnpm-workspace.yaml` and not in CI**.

## What actually ships

The live App Store binary is the **Capacitor** app (`Capacitor 8.3.0` wrapping
`https://restoreassist.app`). Releases are cut by Fastlane → TestFlight via
`.github/workflows/ios-release.yml`, which builds `ios/App/App.xcodeproj` (scheme `App`).
That pipeline never touches `mobile/`. See `docs/MOBILE_RELEASE_RUNBOOK.md`.

## Do not release from Expo

`eas submit` is **deliberately not configured** here — the `submit` profile was removed from
`eas.json` (RA-6946) to prevent an accidental submission to the live bundle id
`com.restoreassist.app`. Do **not** re-add a `submit` profile or run `eas submit` unless the
founder explicitly decides to release RestoreAssist via Expo instead of Capacitor CI.

## Why it's kept

Per RA-6946 (2026-07-11), `mobile/` is retained (not deleted) because:

- **Release-asset dependency** — `docs/MOBILE_RELEASE_RUNBOOK.md` §4.3 sources the Android
  adaptive icon from `mobile/assets/adaptive-icon.png`.
- **Salvage candidate** — `mobile/lib/sync/engine.ts` (tested offline sync engine) is flagged
  for reuse if offline-first lands in the Capacitor app.

If `mobile/` is ever removed, relocate those assets first and update the runbook.
