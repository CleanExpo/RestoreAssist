---
type: runbook
name: meter-photo-and-demo-claim
description: Operator script for the seeded demo claim and the meter-photo capture path
updated: 2026-08-16
---

# Demo runbook — meter photo capture on a seeded claim

What an operator clicks, in order, to walk a claim from intake through to a
client portal link — and, stated plainly at the bottom, which parts of that walk
are real and which are seeded.

## 0. Preconditions

| Requirement | Why | How to confirm |
| --- | --- | --- |
| Signed in as a user with `role = "ADMIN"` | `POST /api/admin/seed-demo` is admin-only | Settings shows the Admin area |
| Subscription status is `TRIAL`, `ACTIVE` or `LIFETIME` | The vision route returns 402 otherwise | Billing page |
| The workspace has its **own** Anthropic API key saved | Meter reading runs on BYOK, never a platform key | Settings -> Integrations -> AI Providers shows an ACTIVE Anthropic connection |
| A photo of a moisture meter on the demo device | The capture step is a real camera capture | — |

If the Anthropic key is missing the capture step fails closed with
"No Anthropic API key is configured for this workspace" and a link straight to
Settings -> Integrations. Nothing else in the walk depends on it.

## 1. Seed the demo claim (intake)

```
POST /api/admin/seed-demo
```

Idempotent. First call returns `{ seeded: true, inspectionId, reportId }`;
every later call returns `{ seeded: false }` and changes nothing, so it is safe
to press twice before walking on stage.

It creates the client Sarah Thompson, report `RA-DEMO-2026-0001`, inspection
`NIR-2026-04-DEMO` at 42 Harbourside Drive, Manly NSW 2095, a 21-reading drying
log and 5 scope items — **all owned by the admin who pressed the button**.

That ownership matters. Every write the demo performs afterwards (saving a
meter reading, uploading the photo, minting a portal link) is scoped to the
signed-in user, so the operator must be the same account that seeded. Seed from
the machine and account you will demo from. The report carries that account's
business profile, so fill in business name, ABN and address beforehand if the
report is going on screen.

To start over, delete the inspection with number `NIR-2026-04-DEMO` and re-post.
Only one demo claim can exist at a time — the inspection number is unique.

## 2. Capture a live meter reading (the demo's live moment)

1. Open **Dashboard -> Inspections -> NIR-2026-04-DEMO**.
2. Select the **Moisture** tab.
3. In the *Moisture Meter — Photo OCR* card, press **Take Photo** (native camera
   on the iOS/Android shell, the device camera on web) or the upload icon to
   pick an existing photo.
4. Press **Read Meter Display**.
   The photo is base64-encoded in the browser and posted to
   `POST /api/vision/extract-reading`, which resolves the *workspace's own*
   Anthropic key and calls Claude vision.
5. The confirm card appears with the reading pre-filled, the raw display text
   quoted back, and a confidence badge.
6. Type the **Location** (required) and the **Surface / Material**, then press
   **Save Reading**.
   Use one of `timber`, `plasterboard`, `concrete`, `carpet`, `vinyl`, `brick`
   as the surface — the drying log matches those exact lowercase words to its
   IICRC S500 dry-standard table and falls back to a generic 15% target for
   anything else.

The reading is written by `POST /api/inspections/[id]/moisture` tagged
`source: "ocr"`, appears immediately in the readings list, and joins the same
drying log as the seeded readings.

If the display cannot be read the card says so and invites a retake — it does
not save a zero.

## 3. Drying log

**Dashboard -> Inspections -> NIR-2026-04-DEMO -> Monitoring**, or
`GET /api/inspections/[id]/monitoring-report`.

The seeded log holds three monitoring points across seven visits over three
days, each converging on its IICRC S500:2021 dry standard:

| Monitoring point | Surface | Start | Finish | S500 target |
| --- | --- | --- | --- | --- |
| Living Room — timber flooring | `timber` | 31.2% | 18.4% | 19% |
| Kitchen — plasterboard 150mm AFF | `plasterboard` | 4.8% | 1.3% | 1.5% |
| Hallway — concrete slab | `concrete` | 9.2% | 3.2% | 3.5% |

All three finish under target, so the report reads as a completed drying
programme. The reading captured in step 2 shows up here as a fourth point.

## 4. S500-cited scope

**Inspection -> Scope**. Five items; four carry an `IICRC S500:2021 §…` clause
reference in the `clauseRef` field that the report's clause column reads.

To show *live* scope generation instead of the seeded items, use
**Generate Scope** on the inspection, which streams from
`POST /api/inspections/[id]/generate-scope`. That path also spends the
workspace's own key. See the caveat in section 6 — it was not exercised for this
change.

## 5. Report and portal link

1. **Inspection -> Report** to open report `RA-DEMO-2026-0001`, or export it.
2. **Send client portal link** on the inspection
   (`POST /api/inspections/[id]/client-portal-link`) mints a revocable 30-day
   token and emails it, or `POST /api/portal/generate` returns a 7-day HMAC link
   without sending mail — use the latter on stage so nothing leaves the building.
3. Open the returned `/portal/<token>` URL to show the client's view.

## 6. What is real and what is seeded

Be straight about this if asked.

**Genuinely working, end to end**

- The meter photo capture path in step 2: a real photo, a real Anthropic vision
  call on the workspace's own key, a real `MoistureReading` row, a real audit-log
  entry. This is a live AI call, not a fixture.
- BYOK enforcement — no platform Anthropic key is ever spent. A workspace with
  no key gets a 402 and a link to add one.
- The drying-log computation: S500 per-material targets, goal-achieved status
  and the daily grouping are all computed from the reading rows, not stored.
- Portal token minting, expiry and revocation.
- Idempotency and rate limiting on both routes involved.

**Seeded fixture data**

- The claim itself: client, report, inspection, address, dollar figures.
- The 21 readings in the drying log are seeded numbers on a plausible curve.
  They are not measurements from a real job. Only the reading captured in step 2
  is live.
- The five scope items and their S500 clause references are seeded text. The
  citations are real clause numbers written by hand, not retrieved by the RAG
  pipeline in this walk.

**Not exercised by this change — do not promise these on stage**

- Live AI scope generation (`generate-scope`) and its standards retrieval. The
  route exists and is BYOK-correct, but it was not run or tested here.
- Report PDF/Excel export rendering.
- The `environmental` and `measurement` modes of the photo-OCR card. There is no
  extraction endpoint for a thermo-hygrometer or a laser measure; those modes now
  say so and ask for manual entry rather than firing at a route that does not
  exist. Only the moisture mode reads a meter.
