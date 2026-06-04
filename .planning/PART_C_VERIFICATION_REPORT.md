# Part C: Existing Content Verification Report
## Date: 2026-06-04 | Branch: codex/ship-gate-recovery

## HELP VIDEOS (public/videos/help/)

| # | File | Size | Audio | Verdict |
|---|------|------|-------|---------|
| 1 | help-billing.mp4 | 9.2 MB | ✅ Screen recording + voiceover | RETAIN — verify UI currency |
| 2 | help-clients-and-portal.mp4 | 8.2 MB | ✅ Screen recording + voiceover | RETAIN — verify UI currency |
| 3 | help-compliance.mp4 | 11.1 MB | ✅ Screen recording + voiceover | RETAIN — verify UI currency |
| 4 | help-inspections.mp4 | 8.6 MB | ✅ Screen recording + voiceover | RETAIN — verify UI currency |
| 5 | help-reports.mp4 | 8.8 MB | ✅ Screen recording + voiceover | RETAIN — verify UI currency |
| 6 | help-team.mp4 | 9.9 MB | ✅ Screen recording + voiceover | RETAIN — verify UI currency |

**Status:** 6 videos, all real screen recordings with voiceover, 8-11 MB each.
**Action:** Retain but verify UI currency against current app.next build.
**Risk:** UI may have changed since recording. Need diff check.

---

## OVERNIGHT CANVAS VIDEOS (RestoreAssist-overnight/public/videos/tutorials/)

| # | File | Size | Audio | Verdict |
|---|------|------|-------|---------|
| 1 | restoreassist-billing-v1.mp4 | 0.6 MB | ❌ NONE | SCRAP — Remotion replacement exists |
| 2 | restoreassist-compliance-v1.mp4 | 0.6 MB | ❌ NONE | SCRAP — Remotion replacement exists |
| 3 | restoreassist-dashboard-v1.mp4 | 1.1 MB | ❌ NONE | SCRAP — Remotion replacement exists |
| 4 | restoreassist-inspections-v1.mp4 | 1.1 MB | ❌ NONE | SCRAP — Remotion replacement exists |
| 5 | restoreassist-login-v1.mp4 | 1.3 MB | ❌ NONE | SCRAP — Remotion replacement exists |
| 6 | restoreassist-reports-v1.mp4 | 1.1 MB | ❌ NONE | SCRAP — Remotion replacement exists |
| 7 | restoreassist-setup-wizard-v1.mp4 | 1.5 MB | ❌ NONE | SCRAP — Remotion replacement exists |
| 8 | restoreassist-signup-v1.mp4 | 1.4 MB | ❌ NONE | SCRAP — Remotion replacement exists |
| 9 | restoreassist-team-v1.mp4 | 0.6 MB | ❌ NONE | SCRAP — Remotion replacement exists |

**Status:** 9 videos, 0 audio tracks, tiny files (Canvas HTML recordings without narration).
**Action:** SCRAP entirely. Replaced by Remotion compositions with brand colours, Inter font,
real logo.png, and CEO-clone narration.
**Replacement mapping:**
  - login → remotion-sign-in
  - signup → remotion-sign-up
  - dashboard → remotion-dashboard
  - inspections → remotion-create-inspection
  - reports → remotion-report-builder
  - team → remotion-team-management
  - billing → remotion-invoice-generator
  - compliance → remotion-compliance-checklists
  - setup-wizard → remotion-setup-wizard-full

---

## YOUTUBE WIZARD VIDEOS (Registry: setup-wizard-*)

| # | Slug | YouTube ID | Title | Verdict |
|---|------|-----------|-------|---------|
| 1 | setup-wizard-signin | tsmZpgLrn5Y | Signing in to RestoreAssist | NEEDS UI CURRENCY CHECK |
| 2 | setup-wizard-signup | wREGInp5yPQ | Creating your RestoreAssist account | NEEDS UI CURRENCY CHECK |
| 3 | setup-wizard-setup | G2CIyp-gDKA | The RestoreAssist Setup Wizard | NEEDS UI CURRENCY CHECK |
| 4 | setup-wizard-dashboard | sp3bMYSaZa8 | Your RestoreAssist dashboard | NEEDS UI CURRENCY CHECK |
| 5 | setup-wizard-integrations | P6rVHLOVNsQ | Connect Xero, MYOB, QuickBooks... | NEEDS UI CURRENCY CHECK |
| 6 | setup-wizard-health | UHUiqnhxGtw | Workspace Health page | NEEDS UI CURRENCY CHECK |

**Status:** 6 YouTube-hosted wizard videos. Unlisted, embedded via youtube-nocookie.com.
**Action:** UI Currency check deferred until app.next build is stable. These show actual
screen recordings — if UI changed, they mislead new users.
**Note:** Cannot verify from CLI without YouTube API access or browser inspection.
**Recommendation:** After next app.next release, check each video against live UI.
If drift >20%, re-record or redirect to remotion-* equivalents.

---

## SUMMARY

| Category | Count | Valid | Scrap | Action |
|----------|-------|-------|-------|--------|
| Help videos | 6 | ✅ 6 audio | 0 | Retain, UI currency check |
| Overnight Canvas | 9 | ❌ 0 audio | 9 | SCRAP — use Remotion |
| YouTube wizards | 6 | Unknown | 0 | UI currency check pending |
| Remotion (current) | 34 | 34 audio | 0 | Production-ready |

---

## RECOMMENDED CURRENCY CHECK PROCESS

1. Deploy latest app.next build
2. Open each help video alongside live app
3. Flag UI drift (new nav, removed buttons, changed colours)
4. If drift >20%, re-record help video OR replace with Remotion equivalent
5. For YouTube wizards: check comments for "outdated" flags, view admin analytics
