# RestoreAssist — Android Remediation Spec (separate track)

> **Status:** SEPARATE REMEDIATION TRACK. Created 2026-06-27 as a sibling to `SHIPIT_READINESS_SPM_SPEC.md`.
> **Relationship to launch:** Android does **NOT** block the iOS + Desktop first paid release (per the Shipit spec §4/§11). This track runs in parallel and lands whenever the owner-gated external steps complete.
> **Ticket:** RA-2997.

## 1. Problem statement

Android is a **Capacitor server-hosted WebView wrap** of `https://restoreassist.app` — the same shell architecture as iOS, same bundle `com.restoreassist.app`, loading the identical web deployment. The **app builds and runs**: `bundleRelease` succeeds and a signed AAB (~6 MB) is produced. **The failure is entirely in the publish/release pipeline**, not in app code, build, runtime, auth, camera, upload, sync, layout, or browser compatibility.

**Shared-vs-isolated determination:** SHELL/RELEASE-ISOLATED. Any real app bug would also surface on iOS and desktop (same web bundle); none does. The blocker lives entirely in Google Play **developer-account verification/publishing** (see §2) — not in app code, the build, or CI. Therefore Android is safely deferrable from the iOS/Desktop launch.

## 2. Current status & root cause (updated 2026-06-27, per RA-2997)

> The original "androidpublisher API disabled" failure (incident 2026-05-08) is **RESOLVED**. This section was realigned to the live ticket state — the blocker has moved from a CI/API problem to a **Google developer-account** problem.

As of RA-2997's 2026-06-17 live execution: the Play Developer API is **enabled** on GCP project `292141944467`, the signed AAB **builds and uploads**, and bundle `restoreassist-app-release.aab` (v `1 (1.0)`, API 26+, target SDK 36) was accepted into Play Console **Internal testing**, establishing the `com.restoreassist.app` package.

**The remaining hard blocker is account-level — not code, not CI:**

| # | Blocker | Evidence | Action class |
|---|---|---|---|
| A | **Google could not verify the developer's identity** — appeal open, support ticket `9-1797000040825` | RA-2997 (2026-06-17) | OWNER — Google appeal |
| B | **Contact-phone verification blocked** behind the identity decision (cannot proceed until A clears) | RA-2997 | OWNER — Play Console (after A) |
| C | **Payments-profile hold** ("there's a hold on your payments account") | RA-2997 | OWNER — Google Payments |
| D | Play Console refuses save/publish — "issues with your account … you can't publish changes"; banner "You can't publish apps from this developer account" (clears once A–C resolve) | RA-2997 | OWNER — downstream of A–C |

There is **no open code or CI blocker.** The release workflow builds and signs correctly; the API `Package not found` response only occurred before the first publish established the package, which the manual Internal-testing upload has already mitigated.

## 3. Remediation steps (ordered) — all owner / Google-account-gated

1. Resolve the Google **identity-verification appeal** (ticket `9-1797000040825`). This is the gating step — nothing downstream can proceed until it clears.
2. **Verify the contact phone number** in Play Console → Account details (unblocks once step 1 clears).
3. **Clear the payments-profile hold** (Google Payments).
4. Return to the existing **Internal-testing draft release** and **Save → publish / roll out**.
5. **Re-run** the `Android Release — Google Play` GitHub workflow — with `com.restoreassist.app` now established in Play, API upload should no longer return `Package not found`.

### Optional in-repo polish (non-blocking)
- Upload **native debug symbols** with the AAB (Play warns they're missing — crash/ANR diagnostics only, not a publish blocker).
- Keep `android/app/build.gradle` `versionCode` ahead of the accepted `1 (1.0)` so re-uploads don't collide.

## 4. Verification (after the account restrictions clear)

```
# Re-run the release workflow and watch the upload step:
gh workflow run "Android Release — Google Play"
gh run list --workflow=android-release.yml -L 3
gh run watch <run-id>

# Success criterion: the upload-google-play step exits 0 (no "Package not found")
# and the build appears on the Play Console internal track.
```

Then run the same WebView smoke checks used for iOS against an Android internal-track build on a physical device (camera capture + permission grant/deny, offline capture→sync, native Apple/Google sign-in sheets, billing gates render off-app per Path B, share-sheet export).

## 5. Out of scope for this track

- The `/mobile` Expo/React-Native field app (parked; never store-submitted; no store pipeline). Separate owner decision required.
- The `apps/cet` kiosk SPA (referenced in CI but not scaffolded).
- Any web app code changes — Android consumes the same `restoreassist.app` deployment, so all functional fixes flow through the main Shipit track automatically.

## 6. Decision

**Android = post-launch P1 on this separate track.** It unblocks the moment the owner-gated Google account restrictions (§3 steps 1–3) clear; there is no remaining code or CI work, and nothing here affects the iOS/Desktop launch. No shared-code risk to the first paid release.
