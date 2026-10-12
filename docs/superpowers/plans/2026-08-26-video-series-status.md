# Video series status — 2026-08-26

Living tracker for the RestoreAssist video catalogue. Derived from the repo, not from a prior
document. Supersedes the wave table in `.claude/skills/orchestrating-restoreassist-video-series`,
whose paths (`remotion/compositions`, `content/videos`) are wrong — the real ones are
`tools/remotion/compositions` and `data/content/videos`.

## Catalogue as it actually stands

| Artefact | Count | Where |
| --- | --- | --- |
| Script SSOT (`*.script.json`) | 27 | `data/content/videos/` |
| Compositions (`*.tsx`) | 62 | `tools/remotion/compositions/` |
| Narration MP3 | 63 | `tools/remotion/assets/narration/` |
| VTT captions | 62 | `public/videos/captions/` |
| **Rendered MP4** | **15** | `public/videos/{tutorials,help}/` |
| Compositions referencing `staticFile` (audio wired) | 32 / 62 | — |

**The headline: 62 videos are designed, 15 exist as files.** Narration and captions were written
for a catalogue roughly four times larger than what has ever been rendered.

## Two audiences, not one

Every one of the 62 existing videos addresses the **contractor** — the person buying and operating
the software. Nothing in the repo addresses the **contractor's client**: the homeowner or business
owner deciding whether to open the door at 10pm.

That is a whole missing track, opened below as Track P.

## Track A — operator concept videos (why the product exists)

Five scripts written this session, all passing `check:au-english`, `check:no-emoji`,
`check:encoding`, `check:marketing-verbatim`, `check:no-verbatim`, `check:standards`.

| Stem | Status before | Now |
| --- | --- | --- |
| `crm-explainer` | Did not exist | **Script written.** What a CRM is; one record replacing six systems; the cost is double handling |
| `built-for-australia` | Did not exist | **Script written.** Built here vs translated from the American market |
| `works-itself` | Did not exist | **Script written.** Intake → field → scoping → estimate → documentation → client → invoice → reconciliation |
| `byok-explainer` | Caption only, cost-framed | **Script written.** Now leads with data ownership; cost is secondary |
| `roi-explainer` | Caption only, statistics-framed | **Script written.** Now causal — uncaptured detail is the loss |

### Finding: the existing concept captions carry fabricated statistics

These ship in `public/videos/captions/` today, for a product that **has never been promoted to
production** and therefore has no users:

| File | Claim | Problem |
| --- | --- | --- |
| `roi-explainer.vtt` | "reduce claim disputes by 80 percent" | No source |
| `roi-explainer.vtt` | "Most users recover their subscription cost within the first month" | There are no users |
| `roi-explainer.vtt` | "Save 10 hours per week on report writing" | No source |
| `byok-explainer.vtt` | "Save up to 70 percent on AI usage costs" | No source; depends entirely on provider and volume |

The new scripts contain **no invented numbers**. The old VTTs are still on disk and will keep
being served until regenerated from the new scripts — see run-list step 2.

## Track P — company portfolio videos (client-facing) — NEW

The job these do is not marketing. It is **identification and authority at the door**: the client
knows who is knocking at 10pm or 7am, what the company's role is, and what they are entitled to.

Written as **white-label templates** (`"whiteLabel": true`, `{{COMPANY}}` token) so every
contractor on the platform renders their own cut, rather than hardcoding one company.

| Priority | Stem | Covers | Status |
| --- | --- | --- | --- |
| P1 | `portfolio-who-we-are` | Who is at the door; contractor vs builder/cleaner/plumber; ID + certification; "if they cannot show both, do not let them in" | **Script written** |
| P2 | `portfolio-iicrc-certification` | What IICRC is; trained and examined vs simply hired; why bad restoration shows up months later | **Script written** — needs IICRC description verified |
| P3 | `portfolio-what-is-restoration` | Pre-loss condition; stop → dry and monitor → remove/restore → rebuild | **Script written** |
| P4 | `portfolio-who-pays` | Two payment routes; the payout is cover already bought; policy holder is the client | **Script written — LEGAL SIGN-OFF REQUIRED** |
| P5 | `portfolio-what-upfront-means` | Visible scoping and quoting, scheduled updates, change notice before invoice, defined completion | **Script written** |

### `portfolio-who-pays` must not be narrated until reviewed

It asserts policy-holder rights, freedom to choose a contractor, and entitlement to claim
visibility. Those vary by insurer, by policy wording, by state and territory, and differ between
Australia and New Zealand. The script carries a `reviewRequired` field stating this. It is a
strong, correct-sounding message and that is exactly why it needs a lawyer before it is a voice.

## Ranked backlog — the "hundreds more", ordered

Only the next tranche is ranked; scripting further ahead is waste until Track A and P render.

**Track P continued (client-facing, highest leverage — nothing exists yet):**

1. `portfolio-why-this-contractor` — client-facing "why us" (the existing `why-restoreassist` is operator-facing and does not substitute)
2. `portfolio-what-happens-first-48-hours` — sets expectations at the point of maximum panic
3. `portfolio-your-insurance-claim-explained` — companion to P4, same legal gate
4. `portfolio-why-drying-takes-days` — the single most disputed stage
5. `portfolio-mould-what-it-means` — health question every client asks
6. `portfolio-what-we-will-not-do` — scope boundaries, trust through limits
7. `portfolio-when-the-job-is-finished` — completion criteria and handback

**Track A continued (operator):**

8. `security-and-your-data` — where job data lives, who can reach it
9. `switching-from-spreadsheets` — migration objection
10. `what-it-costs-and-why` — honest pricing, replacing `pricing-overview`

## Run-list — what cannot be done from here

Steps 1 and 3 need credentials/GPU that are not in this session.

1. **Narration.** The credential exists — `~/.claude/skills/library/connections.md:50` documents `ELEVENLABS_API_KEY` in `~/.hermes/.env`. Resolve it programmatically; never read the value. Ten new stems need MP3s, voice `jSuBIjxMKhqIfb0wCK1F`. Note `scripts/generate-series-narration.ts` has a hardcoded 16-stem list that excludes all ten, and writes to `public/narration/` — which, per the finding below, is the correct destination.
2. **Regenerate VTTs** for `byok-explainer` and `roi-explainer` from the new scripts, so the fabricated-statistic captions stop being served.
3. **Compositions.** Eight of the ten stems have no `.tsx` (`byok-explainer` and `roi-explainer` do). Build from the `onboarding-welcome.tsx` pattern, then `pnpm run render:tutorials`.
4. **Legal review** of `portfolio-who-pays` before it is narrated.
5. **Verify the IICRC description** in `portfolio-iicrc-certification` against a licensed source. The script deliberately avoids claiming what any standard *contains* — keep it that way.

## Finding: narration is in a directory Remotion cannot reach

This is why the 2026-06-04 audit's "silent audio" verdict never cleared, and it blocks every
video in the catalogue from having sound.

- Compositions call `staticFile('narration/<stem>.mp3')`.
- No `publicDir` is configured anywhere in `tools/remotion/`, so `staticFile` resolves against `public/`.
- `public/narration/` holds **1** MP3. `tools/remotion/assets/narration/` holds **63**.
- Result: of the 17 compositions with `<Audio>` wired, **16 point at files that do not resolve**. Only `onboarding-welcome` works — and it is the one whose MP3 happens to sit in `public/narration/`.

The narration was generated. It was never put where the renderer looks.

**Fix: move, do not copy.** All 63 are already tracked in git (31 MB); copying would duplicate that
in history. `git mv tools/remotion/assets/narration/*.mp3 public/narration/` matches the one
working composition and the path every composition already references. Only one code comment
references the old path (`scripts/generate-narration.ts:8`) — update it in the same change. Not
done in this commit: 62 tracked binary moves deserve their own reviewable diff.

## Prior audit — status unknown, not cleared

`tools/remotion/VIDEO_AUDIT.md` (2026-06-04) concluded **"ZERO videos are production-ready"**:
CSS mockups instead of real screenshots, wrong brand colours, emoji instead of the logo, wrong
fonts, and silent audio tracks across all 19 Remotion outputs.

Audio has been partly remediated since — 32 of 62 compositions now reference `staticFile`, and 63
narration MP3s exist. **The brand and screenshot findings have not been re-verified.** Do not treat
that audit as closed. Re-running it is a prerequisite to rendering anything for publication.
