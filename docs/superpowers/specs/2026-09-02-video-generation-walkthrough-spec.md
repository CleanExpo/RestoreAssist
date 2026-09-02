# SPM Spec — Can Every RestoreAssist Process Become a Generated Video?

> Produced 2026-09-02, in answer to a direct question: are we moving towards all
> processes being video-generatable for training and understanding?
> Scope: a walkthrough of the current video pipeline against the product's
> machine-readable process definitions, and the gap between them.

## 1. The question, and the short answer

- **Original request:** "Have the SPM do the next walkthrough and understand if
  we are moving towards all processes able to be Video Generated for training
  and understanding."
- **Answer: no — not on the current trajectory.** The video estate is 70
  hand-authored compositions with **zero** coupling to the product. Adding a
  process means a person writes another video. That is O(n) human effort, which
  is the opposite of generation.
- **But the hard part is already built, elsewhere.** The product now holds
  machine-readable process definitions with provenance. Nothing points a
  renderer at them. That is a wiring gap, not a research problem.

## 2. What was measured, and how

Every figure below is a command, run 2026-09-02 against `b821b77c`.

| Measure | Value | Command |
| --- | --- | --- |
| Compositions | 70 | `find tools/remotion/compositions -name '*.tsx' \| wc -l` |
| Total composition source | 5,486 lines (~78 each) | `find … -exec wc -l {} +` |
| Compositions importing app code | **0** | `grep -rl "from '@/" tools/remotion/compositions/` |
| Shared library | 1 file, 42 lines (`brand.ts`) | `wc -l tools/remotion/lib/*` |
| Compositions with narration wired | 17 of 70 | `grep -rl "narration/" …` |
| Narration MP3s on disk | 63 | `ls tools/remotion/assets/narration \| wc -l` |
| Narration **scripts** in the repo | **0** | `find tools/remotion -name '*script*'` |
| Workflow templates in the app | 13 | `WORKFLOW_TEMPLATES` |
| Ordered workflow steps in the app | **134** | enumerated from the same |

## 3. The three findings

### 3.1 The videos know nothing about the product

Not one composition imports anything from `lib/` or `app/`. They are CSS
mock-ups of the product, drawn from memory. `tools/remotion/VIDEO_AUDIT.md`
(2026-06-04) reached the same conclusion from the other end — "Not actual RA
screenshots (CSS mockups) 19/19", "Wrong brand colours 19/19" — and its verdict
was **"ZERO videos are production-ready."**

The structural consequence matters more than the cosmetic one: because a video
is a drawing of a screen rather than a rendering of a process, **a process change
cannot invalidate a video.** Nothing goes red. The video simply becomes quietly
wrong, which is the failure mode this codebase has spent the last week
eliminating everywhere else.

### 3.2 The narration cannot be regenerated

63 MP3s, no script anywhere in the repository. The text that produced them is
not under version control, so a changed step cannot be re-narrated — it can only
be re-recorded from scratch by someone who reconstructs what was said.

53 of 70 compositions do not reference narration at all. The June audit called
the silence critical; `render-all.ts` has since been fixed so that
`staticFile('narration/…')` resolves (its own comment records that `publicDir`
pointed at a `public/` folder this project does not have, so **every** video
rendered silent). That fixed the plumbing for the 17 that have audio. It did not
give the other 53 anything to play.

### 3.3 The process definitions the pipeline would need already exist

`lib/evidence/workflow-definitions.ts` holds `WORKFLOW_TEMPLATES`: 13 job types,
134 ordered steps, already used to seed real `workflowStep` rows. Beside it sit
two more machine-readable sources built this week — `lib/documents/authority-catalogue.ts`
(5 document templates) and `lib/compliance/regulatory-registry/` (32 entries,
each carrying instrument, source, jurisdiction and verification date, enforced by
`check:regulatory-registry`).

That is the corpus a generator would consume. **134 steps against 70 hand-drawn
videos** is the whole argument: the process inventory is already larger than the
video estate, and it is the half that is machine-readable.

## 4. What "yes" would require

Not more compositions. A different shape:

1. **One scene grammar, many processes.** A small set of parameterised scene
   components — step, hazard callout, evidence capture, sign-off — driven by a
   `WorkflowStep`, instead of 70 bespoke files. Today's shared layer is 42 lines
   of brand tokens.
2. **Narration as source.** Script text generated from the step definition and
   committed, with audio as a build artefact. Then a step change re-narrates.
3. **Composition registration derived, not hand-typed.** `index.tsx` currently
   imports and registers each composition by hand; a generator enumerates
   `WORKFLOW_TEMPLATES`.
4. **A drift gate.** The same shape as `check:regulatory-registry` and
   `check_copies_in_step`: a step with no scene, or a video whose step no longer
   exists, fails the build. Without this, generated videos rot exactly as the
   hand-authored ones did — only faster, because there would be more of them.
5. **Real screens, not drawings.** Otherwise §3.1 survives the rewrite.

## 5. Honest limits of this walkthrough

- **Read-only.** No video was rendered or watched. Every claim is a count or a
  file read, and the audio findings rest on `VIDEO_AUDIT.md` plus the absence of
  `<Audio>` in 52 of 70 files — not on listening.
- **No judgement on the 6 help videos** in `public/videos/help/`. Those are real
  screen recordings with real voiceover and are outside the generated pipeline
  entirely; whether they should be folded in is a product decision.
- **Effort is not estimated.** §4 states the shape, not the cost.
- **This spec plans. It builds nothing**, and it is not a commitment to build.

## 6. Recommendation

Do not add composition 71. The next unit of work worth doing is item 1 of §4 —
one parameterised scene set driven by a single real `WorkflowStep` — as a
pilot against `WATER_DAMAGE` (12 steps). If one job type renders from its
definition, the remaining 12 are configuration. If it does not, we have learned
that for the cost of one video instead of seventy.
