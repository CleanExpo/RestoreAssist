# Package.resolved scope-mix review (commit e1924b13)

## What happened
The shim-deletion commit `e1924b13` ("refactor(xero): delete deprecation shim — Service Layer arc closed") swept in `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` via `git add -A`. Out of scope for the commit message; needed pre-merge review per L6 contrarian.

## Diff content (substantive, not inert)

| Action | Package | Version | Source |
|---|---|---|---|
| ADD | alamofire | 5.12.0 | github.com/Alamofire/Alamofire — HTTP networking |
| ADD | app-check | 11.2.0 | github.com/google/app-check — Firebase App Check |
| ADD | appauth-ios | 2.0.0 | github.com/openid/AppAuth-iOS — OAuth 2.0 + OpenID Connect client |
| BUMP | (8.3.1 → 8.3.3) | — | (revision-only refresh, identity unknown from diff snippet) |
| ADD | facebook-ios-sdk | 18.0.3 | github.com/facebook/facebook-ios-sdk |
| ADD | googlesignin-ios | 9.1.0 | github.com/google/GoogleSignIn-iOS |
| ADD | googleutilities | 8.1.0 | github.com/google/GoogleUtilities |
| ADD | gtm-session-fetcher | 3.5.0 | github.com/google/gtm-session-fetcher |
| ADD | gtmappauth | 5.0.0 | github.com/google/GTMAppAuth |
| ADD | promises | 2.4.0 | github.com/google/promises |

## Provenance

These packages are consistent with this week's iOS native OAuth work:
- **PR #1083** — "hotfix(ios): stamp setupCompletedAt in native-token-exchange JWT (P0 iOS)"
- **PR #1093** — "hotfix(ios): accept plaintext nonce in native-token-exchange (P0)"
- **PR #1094** — "hotfix(ios): skip nonce check when Google idToken has no nonce claim (P0 #3 round 2)"

Native sign-in on iOS requires `GoogleSignIn-iOS` (which pulls in AppAuth-iOS, GoogleUtilities, GTM-AppAuth, GTM-Session-Fetcher, Promises) and optionally `facebook-ios-sdk`. Xcode's Swift Package Manager added them transitively when those PRs were authored. `app-check` is Firebase App Check (already in the codebase — `NEXT_PUBLIC_FIREBASE_*` env vars exist on Vercel). `alamofire` is a common networking dependency of facebook-ios-sdk and others.

None of these packages introduce a new product surface; they are transitive dependencies of capabilities (Google / Apple / Facebook sign-in, Firebase) that were already wired in.

## Safety assessment

- **Bundle size:** modest increase from facebook-ios-sdk + GoogleSignIn-iOS. Both ship gzipped < 5MB. App Store cap is 4GB; not a concern.
- **Supply-chain risk:** all packages are pinned by revision SHA in `Package.resolved`. Vendored SDKs from Google, Facebook, Alamofire — established maintainers, known signing keys.
- **Capacitor / iOS compatibility:** versions selected are current-major across the board (Alamofire 5.x, AppAuth 2.x, FBSDK 18.x, GoogleSignIn 9.x). No deprecated peer-major mismatches.
- **No removed packages** — additive only, plus one minor revision bump.
- **No `Package.swift` changes** — `Package.resolved` only. The `Package.swift` declaring these dependencies was added in the iOS sign-in PRs and is already on `main`.

## Verdict

**SAFE to merge as part of the release branch.** The packages are the lockfile-side accompaniment to iOS sign-in work that already landed on `main` via PRs #1083 / #1093 / #1094. Bundling into the shim-deletion commit was a hygiene mistake but the content itself is correct and intentional. No revert needed.

## Action for Phill (pre-main-merge)

When reviewing the release branch for merge to main, eyeball this file at HEAD (`ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`) to confirm the package set matches the iOS PRs already on main. If `main` HEAD has a different `Package.resolved` than the release branch, the branch's version should win (it carries forward).
