# Distribution screenshots — App Store Connect uploads

## What's in here

| Folder                 | Source                                                                    | Apple-acceptable?               |
| ---------------------- | ------------------------------------------------------------------------- | ------------------------------- |
| `appstore/iphone-6.9/` | Public marketing pages captured at iPhone 17 Pro Max viewport (1320×2868) | [PASS] no OS chrome — passes 2.3.10 |
| `appstore/iphone-6.7/` | Same, iPhone 15 Pro Max viewport (1290×2796)                              | [PASS]                              |
| `appstore/ipad-13/`    | Same, iPad Pro 13 viewport (2064×2752)                                    | [PASS]                              |

Captured 2026-05-04 from `https://restoreassist-sandbox.vercel.app` via headless
Chromium with no UA spoofing. Routes: `/`, `/features`, `/pricing`, `/login`.

## Caveats

These are **marketing pages, not the dashboard.** Apple guideline 2.3.10 says
the majority of screenshots should "highlight the app's main features" in use.
For a stronger submission, replace `02-features.png` and `03-pricing.png` with
captures of the actual dashboard / inspection / reports surfaces.

To capture authenticated dashboard pages, run `distribution/capture-screenshots.mjs`
with sandbox credentials. See the runbook in `docs/MOBILE_RELEASE_RUNBOOK.md`.

## Upload order to App Store Connect

For each device size, upload in this order so the carousel reads as a
walkthrough of the value proposition:

1. `01-landing.png` — brand + tagline ("One System. Fewer Gaps. More Confidence.")
2. `02-features.png` — IICRC S500 / damage assessment feature card grid
3. `03-pricing.png` — plan comparison
4. `04-login.png` — minimal login surface (proves the iOS app works)

If you have authenticated dashboard captures, sub them in for slots 2 and 3.
