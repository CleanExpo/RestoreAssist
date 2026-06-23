# RestoreAssist AI Output Policy — No Generic Emojis

**Status:** Always-on. Applies to every AI response, prompt, system message,
generated report, UI string, and document produced for RestoreAssist.

RestoreAssist is an operational, trustworthy, restoration-technology platform.
Generic Unicode emojis (the rounded full-colour pictographs shipped by phone
keyboards) read as consumer-grade and are off-brand. We use a branded icon
language instead.

---

## The rule

1. **Do not emit standard Unicode emojis** in any output — not in chat replies,
   headings, bullet lists, status lines, report copy, or labels.
2. **Use RestoreAssist icon tokens** instead, written as `[ra:name]`.
3. Tokens are rendered as branded SVG icons by the `RAIconText` component in the
   app. In plain-text surfaces they remain readable as `[ra:name]`.
4. Only use names from the registry. Unknown tokens render as literal text.

## Token vocabulary

| Token | Use for |
| --- | --- |
| `[ra:success]` | Completed / passed / OK |
| `[ra:warning]` | Caution / needs attention |
| `[ra:critical]` | Blocking / urgent / failure |
| `[ra:evidence]` | Captured evidence / proof item |
| `[ra:photo]` | Photograph / image capture |
| `[ra:inspection]` | Site inspection / assessment |
| `[ra:moisture]` | Moisture reading / water content |
| `[ra:room]` | Room / area / zone |
| `[ra:job]` | Job / work order |
| `[ra:report]` | Report / document output |
| `[ra:task]` | Task / checklist item |
| `[ra:ai]` | AI assistant / generated content |
| `[ra:phone]` | Call / phone contact |
| `[ra:customer]` | Customer / client / contact |
| `[ra:invoice]` | Invoice / billing |
| `[ra:shield]` | Compliance / security / protection |
| `[ra:drying]` | Drying / airflow / dehumidification |
| `[ra:claim]` | Insurance claim |
| `[ra:map]` | Location / map / service area |
| `[ra:calendar]` | Schedule / date / appointment |

## Examples

Instead of a check-mark emoji:

> `[ra:success]` Inspection RA-1234 passed all moisture thresholds.

Instead of a warning-sign emoji:

> `[ra:warning]` Room 2 still reads above the dry standard — schedule another
> `[ra:drying]` pass before close.

A status list:

> - `[ra:task]` Capture entry-condition photos
> - `[ra:moisture]` Log baseline moisture for every affected room
> - `[ra:report]` Generate the IICRC S500 summary

## Guidance for AI agents

- Prefer at most one leading token per line; tokens are accents, not decoration.
- Never invent token names. If no token fits, use plain words.
- Do not wrap numbers, IDs, or currency in tokens.
- Keep tokens out of code blocks and file paths.

## Enforcement

`pnpm check:no-emoji` scans `app`, `src`, `components`, `prompts`, and `docs`
for generic Unicode emojis and fails if any are found. Replace them with the
tokens above. A single line may opt out with the marker `ra-allow-emoji` when an
emoji is genuinely required (for example, test fixtures asserting emoji
handling).
