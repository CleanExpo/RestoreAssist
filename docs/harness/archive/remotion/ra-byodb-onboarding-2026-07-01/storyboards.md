# RestoreAssist — BYO-Database Onboarding · Explainer Storyboards (dry-run, no render)

**Job:** `ra-byodb-onboarding-2026-07-01` · **Brand:** `ra` (RestoreAssist) · **Composition:** `Explainer`
**Channel:** `training` (in-app onboarding) · **Aspect:** 1920×1080 · **Voice:** single Synthex ElevenLabs voice (from `ra` BrandConfig — no per-scene switching)
**Status:** STORYBOARDS ONLY. No MP4. Final brand tokens (palette, voice id, motion) resolve from `Synthex/packages/brand-config/src/brands/ra.ts` at render time on `remotion-studio` (Mac).
**b-roll caveat:** the client onboarding UI does not exist yet — visual callouts marked `[UI-TBD]` become animated mockups when the flow is built. Re-review storyboards against the real UI before render.

Gate: these three play, in order, before a client deploys their first claim. Each ~60s, 6 scenes.

---

## Video 1 — "Connect your database" (~60s, setup)

*Goal: get the tenant to connect/provision their own DB with confidence.*

| # | ~s | Voiceover (single voice) | On-screen text | Visual / b-roll |
|---|---|---|---|---|
| 1 | 0–8 | "Your restoration business runs on trust. Your customers' data should sit somewhere you control — not in a shared pool." | **Your data. Your database.** | RA logo resolve → a single lit database icon separating from a cluster of grey ones |
| 2 | 8–18 | "RestoreAssist now runs on a two-database model. We keep your account. *You* keep your customers, jobs, and claims — in a database that's yours." | Two-plane split: **Account (us)** · **Customers & claims (you)** | `[UI-TBD]` split diagram, your side highlighted in brand accent |
| 3 | 18–34 | "Connecting takes one step at setup. Provision an isolated database with one click, or paste your own connection string." | **One click, or bring your own** | `[UI-TBD]` setup screen: "Provision for me" / "Paste connection string" |
| 4 | 34–46 | "We test the connection, run the setup safely, and confirm — before anything goes live." | **Tested · Migrated · Confirmed** | `[UI-TBD]` progress checks ticking green: Connectivity → Schema → Ready |
| 5 | 46–54 | "Your connection details are encrypted end to end. Only your workspace can reach your data." | **Encrypted · Isolated** | Lock closing over the connection string; key stays on the tenant's side |
| 6 | 54–60 | "That's it — your database is live. Next, we'll show you exactly how your data stays yours." | **Connected.** → *Next: how isolation works* | Green "Connected" state, CTA chip to Video 2 |

---

## Video 2 — "How your data stays isolated" (~60s, trust/security)

*Goal: make the isolation + ownership story concrete and reassuring.*

| # | ~s | Voiceover (single voice) | On-screen text | Visual / b-roll |
|---|---|---|---|---|
| 1 | 0–8 | "Here's a fair question: when you log a claim, where does that data actually live?" | **Where does your claim data live?** | A claim record; camera pulls back to reveal two databases |
| 2 | 8–20 | "In two places, on purpose. Our database holds only your account — who you are and your plan. It never holds your customers." | **Us: your account only** | Control-plane box: account, plan — greyed, small |
| 3 | 20–34 | "Your database holds everything that matters — your customers, properties, inspections, and claims. That's yours." | **You: customers · claims · reports** | Data-plane box in brand accent, filling with claim/inspection icons |
| 4 | 34–46 | "Each client's database is separate. There is no shared table, and no path from one client's data to another's." | **No shared tables. No cross-access.** | Two tenant databases side by side; a blocked line between them |
| 5 | 46–56 | "Your connection is sealed with a key that's yours alone — so even we can't open every door with one." | **Per-tenant encryption** | Envelope-encryption motif: your key wraps your data; distinct keys per tenant |
| 6 | 56–60 | "Your data. Your database. Your control." | **You own it.** | Ownership badge over the tenant's database |

> Accuracy note for render: keep claims to what the build delivers — "isolated per-tenant database + per-tenant envelope encryption." Do NOT claim certifications or guarantees not yet in place (honesty gate).

---

## Video 3 — "Deploy your first claim" (~60s, first-use walkthrough)

*Goal: walk the tenant through creating their first claim, ending live.*

| # | ~s | Voiceover (single voice) | On-screen text | Visual / b-roll |
|---|---|---|---|---|
| 1 | 0–8 | "You're set up and isolated. Let's log your first claim — start to finish." | **Your first claim** | `[UI-TBD]` dashboard, "New inspection" pulsing |
| 2 | 8–20 | "Start a new inspection. Add the property and the customer — this is the record that lives in your database." | **New inspection → property + customer** | `[UI-TBD]` new-inspection form filling in |
| 3 | 20–34 | "Capture what you see. Photos, the floor plan sketch, moisture readings — all attached to the claim." | **Capture: photos · sketch · moisture** | `[UI-TBD]` capture tools; a sketch + moisture pin drop in |
| 4 | 34–46 | "Generate the report. Branded as yours, complete with the floor plan and photos." | **One-tap branded report** | `[UI-TBD]` report PDF assembling with firm branding + floor plan |
| 5 | 46–56 | "Every step you just took was saved to *your* database — not ours." | **Saved to your database** | The claim animating into the tenant's database icon from Video 2 |
| 6 | 56–60 | "That's your first claim, live and yours. Welcome to RestoreAssist." | **You're live.** | Success state; RA logo out |

---

## Production packet (dry-run)
- **Jobs:** 3 (one Explainer each) · **Render:** deferred (dry-run) · **Voice:** single Synthex voice, `ra` config.
- **Blocked-on:** the client onboarding UI (`[UI-TBD]` callouts) must exist before b-roll is real; owner-confirm brand + render cost (ElevenLabs + Remotion compute) before any production render.
- **Next skills when rendering (on Mac remotion-studio):** `remotion-screen-storyteller` (finalise from these) → `remotion-designer` → `remotion-composition-builder` → `remotion-render-pipeline`.
- **Do not commit generated MP4s.**
