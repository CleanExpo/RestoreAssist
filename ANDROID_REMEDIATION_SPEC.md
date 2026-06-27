# RestoreAssist — Android Remediation Spec (separate track)

> **Status:** SEPARATE REMEDIATION TRACK. Created 2026-06-27 as a sibling to `SHIPIT_READINESS_SPM_SPEC.md`.
> **Relationship to launch:** Android does **NOT** block the iOS + Desktop first paid release (per the Shipit spec §4/§11). This track runs in parallel and lands whenever the owner-gated external steps complete.
> **Ticket:** RA-2997.

## 1. Problem statement

Android is a **Capacitor server-hosted WebView wrap** of `https://restoreassist.app` — the same shell architecture as iOS, same bundle `com.restoreassist.app`, loading the identical web deployment. The **app builds and runs**: `bundleRelease` succeeds and a signed AAB (~6 MB) is produced. **The failure is entirely in the publish/release pipeline**, not in app code, build, runtime, auth, camera, upload, sync, layout, or browser compatibility.

**Shared-vs-isolated determination:** SHELL/RELEASE-ISOLATED. Any real app bug would also surface on iOS and desktop (same web bundle); none does. The blocker lives in the Google Play upload job plus an external GCP console toggle. Therefore Android is safely deferrable from the iOS/Desktop launch.

## 2. Root causes (evidence-based)

| # | Cause | Evidence | Owner action class |
|---|---|---|---|
| A | **Google Play `androidpublisher` (Play Developer) API is DISABLED** on GCP project `292141944467` → the `r0adkll/upload-google-play` step in `.github/workflows/android-release.yml` fails | `goals.md` ("VERIFIED OPEN, 5 failed runs in May"); `docs/MOBILE_RELEASE_RUNBOOK.md` (incident 2026-05-08 "Play Developer API disabled"); RA-2997 | **OWNER — external GCP console** |
| B | **Play Console account `airestoreassist@gmail.com` not fully verified** (phone + identity verification pending) — Google blocks publishing for unverified developer accounts | `docs/play-store-upload-runbook.md` | **OWNER — Google Play Console** |
| C | **Service account lacks Release-manager role** for the Play Console app | `goals.md` | **OWNER — Play Console permissions** |
| D | **Deprecated track config** `track: internal` should migrate to `tracks: [internal]` for the upload action's current API | `goals.md` / `android-release.yml` | **CODE — small CI edit** |

## 3. Remediation steps (ordered)

### Owner-gated (HUMAN APPROVAL / external dashboards — cannot be done by an agent)
1. **Enable the Google Play Android Developer API** (`androidpublisher.googleapis.com`) on GCP project `292141944467`. Confirm with `gcloud services list --enabled --project 292141944467 | grep androidpublisher` (owner-run).
2. **Complete Play Console developer account verification** for `airestoreassist@gmail.com` (phone + identity). Confirm account status = "Verified" in Play Console.
3. **Grant the CI service account the Release-manager role** on the RestoreAssist Play Console app, scoped to the internal track.
4. Confirm the Play Console app listing exists for `com.restoreassist.app` with at least a draft internal-track release slot.

### In-repo (CODE — safe to do on this track now)
5. Migrate `android-release.yml` upload step from `track: internal` to the current `tracks:` schema for `r0adkll/upload-google-play`; pin the action version.
6. Add a pre-flight CI guard that asserts the Play API is reachable (fail with a clear message pointing at step 1) so future failures are self-describing rather than opaque 403s.
7. Confirm `android/app/build.gradle` `versionCode`/`versionName` bump strategy matches the iOS cadence so internal-track uploads don't collide.

## 4. Verification (after owner steps complete)

```
# Owner confirms API enabled:
gcloud services list --enabled --project 292141944467 | grep androidpublisher

# Re-run the release workflow and watch the upload step:
gh workflow run android-release.yml
gh run list --workflow=android-release.yml -L 3
gh run watch <run-id>

# Success criterion: the upload-google-play step exits 0 and the build appears
# on the Play Console internal track.
```

Then run the same WebView smoke checks used for iOS against an Android internal-track build on a physical device (camera capture + permission grant/deny, offline capture→sync, native Apple/Google sign-in sheets, billing gates render off-app per Path B, share-sheet export).

## 5. Out of scope for this track

- The `/mobile` Expo/React-Native field app (parked; never store-submitted; no store pipeline). Separate owner decision required.
- The `apps/cet` kiosk SPA (referenced in CI but not scaffolded).
- Any web app code changes — Android consumes the same `restoreassist.app` deployment, so all functional fixes flow through the main Shipit track automatically.

## 6. Decision

**Android = post-launch P1 on this separate track.** It unblocks the moment owner steps 1–4 complete; the in-repo steps 5–7 can be prepared now without affecting iOS/Desktop launch. No shared-code risk to the first paid release.
