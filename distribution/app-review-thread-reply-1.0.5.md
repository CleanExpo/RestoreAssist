# App Store Connect — reply to App Review thread for 1.0(5)

**Where this goes:** App Store Connect → Reviews tab on the rejected
submission (787b39e4-db29-43fd-8957-ae4ae3295896) → Reply box.

**Tone:** factual, addresses each ground in the order Apple raised it,
no excuses, no editorial. Short — reviewers read hundreds of these.

---

Hello,

Thank you for the detailed feedback. Build 1.0(5) (now in TestFlight,
processing) addresses all three grounds.

**2.1(a) — Black screen on iPad Air 11" M3 at launch.**
Root cause: the Capacitor server URL in capacitor.config.ts was conditional
on NODE_ENV, which the iOS sync step does not set, so build 1.0(2) shipped
with the WebView pointing at localhost. Fix: the URL is now hardcoded to
https://restoreassist.app. The launch flow is splash → dashboard with no
black screen. Verified on iPad Air 11" M3 (iPadOS 26.4.2) and iPhone 17.

**2.3.8 — Placeholder app icons.**
The previous icon (a metallic disc with the text "RestoreAssist" and
"RESTORATION INTELLIGENCE" inside it) has been replaced. The new icon is
a flat brand mark — a white house outline with a copper magnifying-glass
overlay and two foundation arcs — on a solid #1C2E47 brand-navy
background. No text inside the icon, no drop shadow, no template
aesthetic. Used at 1024×1024 in App Store Connect, throughout the iOS
asset catalog, and on the launch splash so the experience is consistent
from icon tap to dashboard.

**2.3.10 — Non-iOS status bars in screenshots.**
All screenshots in App Store Connect have been replaced. The new set was
captured at the required iOS device viewports (1320×2868, 1290×2796,
2064×2752) and contains no OS chrome — no Android nav bar, no browser
URL bar, no macOS chrome. Please refresh "View All Sizes in Media
Manager" if any cached previews persist.

**Reviewer demo account** (also in App Review Information):
Username: reviewer@restoreassist.app
Password: (set in Sign-In Information field)

If a verification step would help, I can provide a Loom walkthrough or
join a live call.

Thank you for your time.
