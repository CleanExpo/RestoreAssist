# Accessibility Tokens — RestoreAssist

Status: scaffold (RA-1574). Shipped with no breaking classname renames.
Long-tail codemod of 2,276 `text-slate-400` / `text-gray-400`
occurrences is tracked per-surface; this doc is the source of truth
for which token to choose *going forward*.

## Body / supporting text

Use **`text-slate-700` on light** and **`text-slate-300` on dark**.
Both clear the WCAG 1.4.3 AA 4.5:1 ratio against the canonical
backgrounds used across the app (white / slate-50 / slate-900 /
slate-950).

```tsx
<p className="text-sm text-slate-700 dark:text-slate-300">…</p>
```

Do NOT use `text-slate-400` or `text-gray-400` for body or supporting
text. Their contrast against white is ~3.9:1 and ~3.8:1 respectively —
both fail AA for normal text (<18pt / <14pt bold).

## Muted text (hints, metadata, helper lines)

Use **`text-slate-600` on light** and **`text-slate-300` on dark**.
Reaches 4.5:1 on the primary backgrounds. When you need something
visually lighter, reach for font-size or opacity rather than
`text-slate-400`.

## Disabled / placeholder text

WCAG explicitly exempts disabled controls from 1.4.3. `text-slate-400`
is acceptable on `<input>`/`<textarea>` *placeholders* and disabled
buttons. Anywhere else, it is a finding.

## Inline error copy

Use `text-rose-600` on light and `text-rose-400` on dark (verified
>4.5:1). Pair with `role="alert"` on the element when the error
appears in response to a user action.

## Success state copy

Use `text-emerald-700` on light and `text-emerald-300` on dark. The
default `text-emerald-400` fails AA on white.

## Background tints

On pale tinted backgrounds (amber-50, sky-50, emerald-50), bump body
text to `text-{tint}-800` (e.g. `text-amber-800`, `text-sky-900`).
`text-{tint}-500` fails AA on the matching -50 tint.

## Icon-only buttons

Icons inside `size="icon"` Buttons inherit the button's foreground and
don't need an independent contrast check. Ensure the button variant
itself passes. Always pair with `aria-label` (RA-1575).

## Migration policy

- New components: pick the token above, no exceptions.
- Existing components: edit the contrast the same commit the file is
  touched for any other reason. Do NOT open codemod PRs that rename
  thousands of classnames at once — they generate merge-conflict
  storms and break git blame.
- A lint rule for `text-slate-400` on body surfaces is tracked as a
  follow-up; until then this doc is the review checklist.
