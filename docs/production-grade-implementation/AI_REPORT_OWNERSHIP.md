# AI report ownership (application holder liability)

When RestoreAssist AI drafts an inspection report:

1. The model is instructed to label output as an **AI-assisted draft**.
2. UI shows a **Report ownership review** stepper until the holder **rewrites and saves**, then **acknowledges**.
3. Report list shows ownership badges (`AI draft` / `Confirm ownership` / `Owned`).
4. Export package shows ownership status, watermark explanation, and format readiness.
5. PDF / DOCX / ZIP exports keep an **AI-ASSISTED DRAFT** watermark until acknowledgement.
6. Regenerating with AI clears acknowledgement and restores the draft state.

Liability for issued report wording sits with the application holder — AI is an assistant only.

## Status lifecycle

| Status | Meaning |
|--------|---------|
| `no_content` | No report body yet |
| `ai_draft` | Body exists; rewrite required before ack |
| `ready_to_acknowledge` | Rewrite saved; confirm ownership CTA enabled |
| `owned` | Holder confirmed; exports issue without watermark |

Helpers: `lib/reports/ai-ownership.ts` (`getAiOwnershipStatus`, `getAiOwnershipSteps`, `getAiOwnershipStatusMeta`).
