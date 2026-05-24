# SP-8 Tutorial Videos — YouTube Upload Guide

**6 videos. ~5 minutes of your time. Copy-paste metadata below.**

After uploading, paste me the 6 YouTube video IDs and I'll open the follow-up PR that swaps `localPath` → `youtubeId` in `VIDEO_REGISTRY` (matches the existing 6 Pillar B videos).

## Step 1 — Open YouTube Studio (already done via cua-driver, switch to Chrome)

Should be at: `https://studio.youtube.com/channel/<your-channel>/videos/upload`

**Verify you're on the SAME channel as the existing 6 setup-wizard videos** (tsmZpgLrn5Y / wREGInp5yPQ / etc.). If wrong channel, switch via avatar → Switch Account.

## Step 2 — Drag-drop all 6 MP4s into the upload area

Source folder: `/Users/phill-mac/RestoreAssist/public/videos/help/`

Files to upload:

1. `help-billing.mp4` (7.8 MB · 75s)
2. `help-clients-and-portal.mp4` (7.4 MB · 75s)
3. `help-compliance.mp4` (7.8 MB · 75s)
4. `help-inspections.mp4` (7.6 MB · 75s)
5. `help-reports.mp4` (7.9 MB · 75s)
6. `help-team.mp4` (7.6 MB · 75s)

YouTube accepts all 6 in parallel. Drag all at once.

## Step 3 — For EACH video, paste this metadata + set Unlisted

### Video 1 — `help-billing.mp4`

- **Title:** `Billing and subscription on RestoreAssist`
- **Description:**

  ```
  Where to view your invoices, change your card, upgrade or cancel your RestoreAssist subscription, and what each billing line item means. 75-second walkthrough.

  RestoreAssist is an Australian CRM for water-damage restoration tradies. Learn more at https://restoreassist.app
  ```

- **Tags:** `restoreassist, water damage restoration, restoration crm, australia, billing, subscription, saas`
- **Visibility:** `Unlisted`
- **Category:** `Science & Technology` (or `Education`)
- **Audience:** `No, it's not made for kids`

### Video 2 — `help-clients-and-portal.mp4`

- **Title:** `Inviting clients to your Customer Portal`
- **Description:**

  ```
  Send your insurance-claim customer a branded portal link so they can see process explainers, claim walkthroughs, and policy terminology while you work. 75-second walkthrough.

  RestoreAssist is an Australian CRM for water-damage restoration tradies. Learn more at https://restoreassist.app
  ```

- **Tags:** `restoreassist, customer portal, water damage restoration, insurance claim, australia, branded portal`
- **Visibility:** `Unlisted`

### Video 3 — `help-compliance.mp4`

- **Title:** `IICRC compliance citations in your reports`
- **Description:**

  ```
  How RestoreAssist automatically cites the right IICRC standards (S500:2025, S520, S540) in your reports and where to verify the citations match. 75-second walkthrough.

  RestoreAssist is an Australian CRM for water-damage restoration tradies. Learn more at https://restoreassist.app
  ```

- **Tags:** `restoreassist, iicrc, s500, water damage restoration, compliance, australia, restoration standards`
- **Visibility:** `Unlisted`

### Video 4 — `help-inspections.mp4`

- **Title:** `Photo chain-of-custody on RestoreAssist`
- **Description:**

  ```
  Capture inspection photos with SHA-256 hash + GPS + UTC + device fingerprint stamped at capture time. C2PA-style chain-of-custody every insurance assessor will accept. 75-second walkthrough.

  RestoreAssist is an Australian CRM for water-damage restoration tradies. Learn more at https://restoreassist.app
  ```

- **Tags:** `restoreassist, photo evidence, c2pa, chain of custody, water damage restoration, australia, inspection`
- **Visibility:** `Unlisted`

### Video 5 — `help-reports.mp4`

- **Title:** `Your first AI-generated restoration report`
- **Description:**

  ```
  How to generate, review, and customise your first AI-powered IICRC-compliant restoration report on RestoreAssist. 75-second walkthrough.

  RestoreAssist is an Australian CRM for water-damage restoration tradies. Learn more at https://restoreassist.app
  ```

- **Tags:** `restoreassist, ai report, water damage restoration, iicrc, australia, restoration software`
- **Visibility:** `Unlisted`

### Video 6 — `help-team.mp4`

- **Title:** `Inviting technicians and managing your team`
- **Description:**

  ```
  Send a Technician Link to bring crew members onto your RestoreAssist account. Manage roles, mobile-seat billing, and access scope. 75-second walkthrough.

  RestoreAssist is an Australian CRM for water-damage restoration tradies. Learn more at https://restoreassist.app
  ```

- **Tags:** `restoreassist, team management, technician onboarding, water damage restoration, australia, multi-user`
- **Visibility:** `Unlisted`

## Step 4 — Paste me the 6 YouTube IDs

After clicking "Publish" for each, the URL becomes `https://youtu.be/<11-char-id>` or the video appears in your YouTube Studio with the ID visible in the URL.

Paste back in this format (just 6 lines):

```
help-billing            xxxxxxxxxxx
help-clients-and-portal xxxxxxxxxxx
help-compliance         xxxxxxxxxxx
help-inspections        xxxxxxxxxxx
help-reports            xxxxxxxxxxx
help-team               xxxxxxxxxxx
```

Replace each `xxxxxxxxxxx` with the actual 11-character YouTube video ID.

## Step 5 — I open the follow-up PR

Once you paste, I'll swap `localPath` → `youtubeId` in `components/setup/video-registry.ts:60-95`, delete the 6 MP4s from `public/videos/help/`, commit, push, and PR to sandbox. Total ~5 min from your IDs paste → PR open.

## Why this approach vs full cua-driver automation

YouTube Studio's upload UI uses a system file-picker dialog that's painful for cua-driver to drive reliably (custom drag-drop overlay + Cocoa NSOpenPanel + Chrome-internal accessibility tree variations). 5 min of your manual drag-drop is faster than ~30 min of me building the cua-driver harness for the file-picker. The metadata above eliminates the slow part of YouTube uploads (writing 6 titles/descriptions/tags).

---

**Status:** Chrome opened to YouTube Studio in a background window (via cua-driver `launch_app`). Switch to it when ready. Source MP4s are in `~/RestoreAssist/public/videos/help/`.
