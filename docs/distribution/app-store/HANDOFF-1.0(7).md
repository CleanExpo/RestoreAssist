# RestoreAssist 1.0(7) — Submission Handoff

**Status:** code-complete, ready for archive → TestFlight → App Review.

## What was fixed for this build

This build addresses **Guideline 3.1.1 (In-App Purchase)** rejections from builds 1.0(3) – 1.0(6). Strategy is unchanged from the Path B plan in [app-review-resubmit-notes-1.0.4.md](./app-review-resubmit-notes-1.0.4.md):

> RestoreAssist on iOS is a free B2B field tool. Subscriptions, billing, and account upgrades are managed only on the website restoreassist.app.

Previous builds *talked* about Path B but still rendered upgrade CTAs and pricing UI inside the iOS WebView. Build 1.0(7) wraps every billing surface in `<BillingGate>` so they are not rendered at all on iOS Capacitor.

### Files modified (16)

| File | Change |
|---|---|
| `app/pricing/page.tsx` | wrapped page in `<BillingGate>` |
| `app/dashboard/pricing/page.tsx` | wrapped page in `<BillingGate>` |
| `app/dashboard/subscription/page.tsx` | wrapped page in `<BillingGate>` |
| `components/UpgradeBanner.tsx` | wrapped output in `<BillingGate fallback={null}>` |
| `components/clients/upgrade-modal.tsx` | wrapped output in `<BillingGate fallback={null}>` |
| `components/PricingConfiguration.tsx` | gated locked-banner overlay + iOS-guarded auto-redirect |
| `app/compliance/page.tsx` | gated "Start free trial" CTA |
| `app/dashboard/layout.tsx` | iOS-guarded sidebar pricing redirect |
| `app/dashboard/clients/page.tsx` | iOS-guarded UpgradeModal callback |
| `app/dashboard/integrations/page.tsx` | wrapped Upgrade dialog in `<BillingGate>` + iOS-guarded push |
| `app/dashboard/reports/page.tsx` | iOS-guarded both setTimeout pushes |
| `app/dashboard/reports/new/page.tsx` | wrapped 3 surfaces (empty-state, View Subscription, Upgrade Modal) |
| `app/dashboard/success/page.tsx` | iOS-guarded auto-redirects + wrapped View Subscription button |
| `components/InitialDataEntryForm.tsx` | iOS-guarded 2x credit-exhausted pushes |
| `components/forms/guided-interview/GuidedInterviewPanel.tsx` | wrapped tier-gating prompt |
| `ios/App/App.xcodeproj/project.pbxproj` | `CURRENT_PROJECT_VERSION = 7` (was 5) |

The web experience is unchanged. On iOS Capacitor, BillingGate's `shouldHideBillingUI()` returns true and the gated content does not render.

### Pre-flight verification (already passed)

- ✅ Static iOS App Review check (`.claude/hooks/lib/ios-static-check.sh`) → **0 hard violations**
- ✅ Type-check on the 15 modified TS/TSX files → **0 new errors**
- ✅ `npx cap sync ios` → clean, 5 plugins resolved
- ✅ `CURRENT_PROJECT_VERSION = 7` confirmed in both Debug and Release configurations

Pre-existing type errors elsewhere in the codebase (settings page, lucide icon imports, DryingProgressChart) are not regressions — they shipped on 1.0(5).

## What you need to do

### 1. Open Xcode

```bash
cd ~/RestoreAssist
open ios/App/App.xcworkspace
```

### 2. Verify signing & target settings

In Xcode:
- Project navigator → **App** → target **App** → tab **Signing & Capabilities**
- Confirm: Team is your Apple Developer team, Provisioning Profile is correct (per [feedback_ios_release_workflow.md](../.claude/feedback_ios_release_workflow.md): manual signing, not automatic)
- Tab **General** → confirm Version = `1.0`, Build = `7`

### 3. Archive

- Top menu: **Product → Destination → Any iOS Device (arm64)** (NOT a simulator)
- Top menu: **Product → Archive**
- Wait for archive to complete (1–3 min). Organizer window opens automatically.

### 4. Upload to App Store Connect

In the Organizer:
- Select the new 1.0(7) archive (top of list)
- Click **Distribute App**
- Choose **App Store Connect** → **Upload**
- Distribution options: keep defaults (manage version + build number, upload symbols, manage signing)
- Sign with the same provisioning profile, click **Upload**
- Wait for "Uploaded successfully" (5–15 min for TestFlight processing).

If `altool` upload via CLI is preferred (per [feedback_ios_release_workflow.md](../.claude/feedback_ios_release_workflow.md), `altool` over `fastlane`), the IPA path is shown after `Distribute App → Export`.

### 5. Submit to App Review

After TestFlight processing finishes (you'll get an email):
- https://appstoreconnect.apple.com → **Apps → RestoreAssist → 1.0** version
- Under "Build", click **+** and select build **7**
- **Notes for Review** field — use the text in the next section
- Click **Save** → **Add for Review** → **Submit to App Review**

### 6. Notes for Review (paste into App Store Connect)

```
Build 1.0(7) addresses prior Guideline 3.1.1 rejections.

RestoreAssist on iOS is a free B2B field tool for restoration technicians on
job sites. The iOS app does NOT sell digital content, subscriptions, or any
form of paid upgrade. The app loads pages from restoreassist.app inside a
Capacitor WebView; pages or components that contain billing UI on the web
(pricing, subscription management, upgrade prompts, "Buy" / "Subscribe" CTAs)
are wrapped in a `<BillingGate>` component that detects the iOS Capacitor
shell at runtime and either hides the UI entirely or replaces it with an
explanatory placeholder pointing the user to the website.

Server-side, every checkout endpoint (`/api/create-checkout-session`,
`/api/checkout-lifetime`, `/api/addons/checkout`) calls
`rejectIfIOSCapacitor(request)` and returns 403 to any request bearing the
`x-capacitor-platform: ios` header that the Capacitor client injects.

To test: install via TestFlight, sign in with the workspace credentials
provided. You will see the dashboard, but no pricing pages, no upgrade
buttons, and no checkout flows. Subscriptions remain available via the
website only.

Test account
  email:    [PASTE TEST USER EMAIL]
  password: [PASTE TEST USER PASSWORD]

Notable changes from 1.0(6):
  - app/pricing, /dashboard/pricing, /dashboard/subscription wrapped in <BillingGate>
  - UpgradeBanner, UpgradeModal, GuidedInterviewPanel tier-gating wrapped
  - All `router.push("/dashboard/pricing")` paths guarded with `isCapacitorIOS()` check
  - PricingConfiguration locked-banner overlay gated for iOS

Thank you for the careful review.
```

### 7. If you get rejected again

Run the verifier locally:

```bash
cd ~/RestoreAssist
{ find app -type f \( -name '*.tsx' -o -name '*.ts' \) ; \
  find components -type f \( -name '*.tsx' -o -name '*.ts' \) ; \
} | .claude/hooks/lib/ios-static-check.sh | jq
```

If it returns `"status": "static-clean"` and Apple still rejects, the rejection is for a category the static check doesn't cover yet. Reply to the rejection with the rejection text and the verifier will be extended to catch it next time.

## Things explicitly NOT in this build

- New features
- Native iOS code changes (AppDelegate, Info.plist permissions, signing)
- Any change to billing logic on the server side (already iOS-guarded since 1.0(4))
- Changes outside the 16 listed files

## Rollback

If 1.0(7) needs to be pulled before submission:
```bash
cd ~/RestoreAssist
git checkout -- app/ components/ ios/App/App.xcodeproj/project.pbxproj
```
This reverts every BillingGate edit and the build-number bump. The verifier infrastructure (`.claude/hooks/`) is independent and stays.
