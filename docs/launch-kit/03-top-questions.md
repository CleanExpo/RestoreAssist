# The 10 questions a new restorer will actually ask

Drafted answers. Every figure here was verified against the live site or `lib/pricing.ts`
on 2026-08-25 — don't quote a number that isn't in this file without re-checking it.

### 1. "Why do I need my own AI key? Nobody else asks for that."

Because it's cheaper for you. Most tools bundle AI cost into the subscription with a
margin on top. We don't run AI on our account at all — you connect your own Anthropic or
OpenAI key and pay them directly at cost, usually a few dollars a month. It's two minutes
of setup in Settings → AI Providers, and it's the reason the subscription is $99 flat
instead of $200+ per seat.

*(This is the single most common place a trial stalls. Lead with it, don't wait to be asked.)*

### 2. "What does it cost?"

A$99/month per workspace, GST inclusive. Flat — not per seat, so your whole crew is
included. 50 report credits a month; extra reports are $1.98 each. Optional add-on modules
are $11/month each (Floor Plan Underlay is $9.95/month). 15-day free trial with 50 credits.

### 3. "Is it built for Australia or is it an American product with our spelling?"

Built here, for here. GST at 10%, ABN validation, Australian state building codes, and
IICRC S500:2021 citations against an actual standards corpus rather than "S500-aligned"
as a marketing line. It does not export to Xactimate — that's a deliberate choice, since
Xactimate penetration is low in AU and we integrate with Ascora and Xero instead.

### 4. "Will my reports hold up with an insurer?"

The reports cite the specific IICRC S500:2021 clause behind each recommendation rather
than asserting compliance generally. That's the part that survives a challenge. Try it on
a real job during the trial — that's the only test that counts.

### 5. "Does it work offline? I'm in basements and roof cavities."

Yes. Field capture queues locally and syncs when you get signal back.

### 6. "Can my technicians use it?"

Yes — the $99 is per workspace, not per seat, so adding your crew doesn't change the bill.
There's a field mode built for gloved hands and bright light.

### 7. "What happens to my data if I stop paying?"

You can export your reports. We don't hold your job records hostage. *(Founder: confirm
the exact export path before promising specifics.)*

### 8. "Do I have to re-type readings into a drying log?"

Moisture readings are entered once and flow into the report. Each is checked against the
IICRC dry standard for that material as you enter it, so you see dry/drying/wet live
rather than working it out later.

### 9. "Can I invite my client to see progress?"

There's a customer portal where clients view job status, approve scope and cost estimates,
and download reports. *(Founder: the portal is live and its routes are up, but the
end-to-end invite flow has NOT been verified on production — email sending is not
configured yet. Don't promise this until it's tested.)*

### 10. "Who's behind it?"

You are. Say it in your own words — that you're a restorer who got tired of the
paperwork, not a software company that discovered restoration. It's the most credible
thing about the product; don't let a support doc flatten it.

---

## Do not say

- Anything about **email notifications working** — no email provider is configured on
  production right now.
- **"Australia's first"** — unsubstantiated, ACCC exposure. Removed from the site
  deliberately; don't reintroduce it in conversation.
- **restoreassist.com.au** — that domain is not controlled. The product is
  **restoreassist.app**.
- Any promise that the **client portal invite** works end to end until it's been tested.
