# RestoreAssist Icon System

A branded icon language that replaces generic Unicode emojis with original,
on-brand SVG icons rendered from typed `[ra:*]` tokens.

> **Why:** RestoreAssist is operational, trustworthy, and restoration-grade.
> Generic full-colour emojis read as consumer software and are off-brand. The
> icon system gives AI output and UI copy a consistent, professional voice.

---

## Rules

1. **No standard Unicode emojis** in UI copy, AI responses, prompts, docs, or
   app labels.
2. Use **`[ra:name]` tokens** instead. They render as branded SVG icons in the
   app and stay readable as text everywhere else.
3. Only registry names are valid. Unknown tokens render as literal text (never
   silently dropped).
4. Tokens are accents, not decoration — at most one leading token per line.
5. `pnpm check:no-emoji` enforces rule 1 across `app`, `src`, `components`,
   `prompts`, and `docs`.

## Branding

Icons are original SVGs (no external icon packs), 24x24 viewBox, rounded
geometry, drawn with the RestoreAssist palette:

| Role | Hex | Use in icons |
| --- | --- | --- |
| Navy (primary) | `#1C2E47` | Primary line work |
| Grey (secondary) | `#5A6A7B` | Secondary / supporting lines |
| Bronze (accent) | `#8A6B4E` | Accent marks, emphasis |
| Gold (highlight) | `#D4A574` | Small highlights |

## File structure

```
public/brand/restoreassist/icons/
  svg/                       # master assets (source of truth)
    success.svg  warning.svg  critical.svg  ...
  png/                       # optional raster exports (generated from svg)
src/brand/restoreassist/
  icon-registry.ts           # typed names, metadata, token parser
src/components/brand/
  RAIcon.tsx                 # renders one branded icon
  RAIconText.tsx             # renders text containing [ra:*] tokens
prompts/no-generic-emojis.md # AI output policy
scripts/check-no-emoji.mjs   # CI guard
```

SVG is the master format. PNGs are optional; the `png/` folder is ready for a
raster export step (e.g. `sharp`/`resvg`) when bitmap assets are needed.

## Token list

| Token | Label | Use for |
| --- | --- | --- |
| `[ra:success]` | Success | Completed / passed / OK |
| `[ra:warning]` | Warning | Caution / needs attention |
| `[ra:critical]` | Critical | Blocking / urgent / failure |
| `[ra:evidence]` | Evidence | Captured evidence / proof item |
| `[ra:photo]` | Photo | Photograph / image capture |
| `[ra:inspection]` | Inspection | Site inspection / assessment |
| `[ra:moisture]` | Moisture | Moisture reading / water content |
| `[ra:room]` | Room | Room / area / zone |
| `[ra:job]` | Job | Job / work order |
| `[ra:report]` | Report | Report / document output |
| `[ra:task]` | Task | Task / checklist item |
| `[ra:ai]` | AI | AI assistant / generated content |
| `[ra:phone]` | Phone | Call / phone contact |
| `[ra:customer]` | Customer | Customer / client / contact |
| `[ra:invoice]` | Invoice | Invoice / billing |
| `[ra:shield]` | Shield | Compliance / security / protection |
| `[ra:drying]` | Drying | Drying / airflow / dehumidification |
| `[ra:claim]` | Claim | Insurance claim |
| `[ra:map]` | Map | Location / map / service area |
| `[ra:calendar]` | Calendar | Schedule / date / appointment |

## Usage

### Render a single icon

```tsx
import { RAIcon } from "@/src/components/brand/RAIcon";

<RAIcon name="moisture" size={20} />
<RAIcon name="success" decorative />        {/* hidden from screen readers */}
<RAIcon name="shield" title="Compliance" /> {/* custom a11y label */}
```

### Render text with tokens (AI output, status copy)

```tsx
import { RAIconText } from "@/src/components/brand/RAIconText";

<RAIconText>{"[ra:success] Inspection RA-1234 passed all checks."}</RAIconText>
<RAIconText iconSize={16}>{aiResponse}</RAIconText>
```

### Parse tokens yourself

```ts
import { parseRATokens, isRAIconName } from "@/src/brand/restoreassist/icon-registry";

const segments = parseRATokens("[ra:warning] Room 2 above dry standard");
// -> [{ type: "icon", icon: "warning", ... }, { type: "text", value: " Room 2 ..." }]
```

## Guidance for AI agents

- Use tokens, never emojis. See `prompts/no-generic-emojis.md`.
- Never invent token names. If nothing fits, use plain words.
- Keep tokens out of code blocks, file paths, numbers, IDs, and currency.

## Accessibility

- `RAIcon` sets `alt` from the registry label by default.
- Pass `decorative` when the icon repeats adjacent text (sets `alt=""` and
  `aria-hidden`).
- Pass `title` to override the label for context-specific meaning.

## Enforcement and migration

`pnpm check:no-emoji` fails the build-local check if generic emojis appear in
the scanned directories. To migrate existing copy:

1. **React UI text / AI output** -> replace the emoji with the matching
   `[ra:name]` token and render through `RAIconText` (or drop in `RAIcon`).
2. **Plain-text surfaces that are NOT rendered as React** (server logs, email
   bodies, generated report strings, JSON) -> do **not** use `[ra:*]` tokens
   there (they would show literally). Remove the emoji or use a plain word.
3. A line that genuinely needs an emoji (e.g. a test fixture asserting emoji
   handling) may opt out with the trailing marker `ra-allow-emoji`.

Adding a new icon: drop `svg/<name>.svg` in the brand palette, add the name to
`RA_ICON_NAMES` and `RA_ICONS` in `icon-registry.ts`, and document it here.
