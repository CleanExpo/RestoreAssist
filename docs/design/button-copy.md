# Button-copy lexicon — RestoreAssist

Status: scaffold (RA-1568). Reference doc used during PR review.
Per-surface migration is the follow-up sweep; this doc exists so
reviewers have a canonical vocabulary to nudge callers toward.

Goal: when a user sees the same semantic action in two different
surfaces, they should see the same verb. Today the codebase mixes
"Save" / "Save Changes" / "Update" / "Submit" for the same thing.

## The five action clusters

### 1. Save / Persist changes

**Canonical verbs**

| Verb              | When to use                                                |
|-------------------|------------------------------------------------------------|
| **Save**          | A form that creates a new record. Pair with a noun if the create target isn't obvious from the surface (`Save client`, `Save invoice`). |
| **Save changes**  | An edit form that's updating an existing record. The user sees the form pre-populated, and their edits are pending. |
| **Apply**         | Non-destructive settings that take effect immediately (filters, view preferences). Don't mix with Save. |

**Avoid**: "Update" (too generic, doesn't distinguish create vs. edit), "Submit" (form-engineer jargon, not user-facing), "Confirm" (reserved for destructive flows).

### 2. Delete / Remove / Archive

| Verb            | When to use                                                  |
|-----------------|--------------------------------------------------------------|
| **Delete**      | Permanent removal. Pair with shadcn `AlertDialog` using the `destructive` variant (see `components/ConfirmDialog.tsx`). |
| **Remove**      | Non-permanent disassociation. Example: remove a user from a team, remove a line item. The record continues to exist somewhere. |
| **Archive**     | Soft-delete that the user can reverse. Used on invoices / estimates / reports. |
| **Deactivate**  | Reversible status flip, not a deletion. Subscriptions, integrations, API keys. |

**Avoid**: "Hide" (ambiguous), "Trash" (too casual for B2B).

### 3. Cancel / Dismiss / Close / Back

| Verb         | When to use                                                     |
|--------------|-----------------------------------------------------------------|
| **Cancel**   | Abandoning an in-progress form or confirm dialog. The default secondary action next to a destructive primary. |
| **Close**    | Dismissing a modal that was only display-only (e.g. a preview panel). Nothing to abandon because the user wasn't editing. |
| **Dismiss**  | Banners, toasts, checklist cards. The surface goes away until something triggers it again. |
| **Back**     | Navigating to the previous step in a multi-step flow. Always pair with a matching "Next" or "Continue". |

**Avoid**: mixing "Cancel" and "Close" on the same type of modal — pick one per surface class.

### 4. Create / Add / New

| Verb        | When to use                                                    |
|-------------|----------------------------------------------------------------|
| **New <noun>** | Primary header-level CTA for creating the root entity of a list page. `New client`, `New invoice`. Also the `+` button on empty-state cards. |
| **Add <noun>** | Adding a child record to a parent. `Add line item`, `Add attachment`, `Add team member`. |
| **Create**  | Reserved for the final confirm button of a multi-step wizard where "New X" appeared earlier. |

**Avoid**: bare "Create" / "Add" with no noun — the CTA loses all context when read out by a screen reader.

### 5. Send / Deliver / Notify

| Verb             | When to use                                                   |
|------------------|---------------------------------------------------------------|
| **Send**         | Email or message dispatch to a third party. `Send invoice`, `Send estimate`. |
| **Send email**   | Used only when the button sits next to a non-email delivery method (e.g. SMS) and the user needs to pick. |
| **Share**        | Generating a share link without delivery. `Share link` copies / opens a share dialog. |
| **Notify**       | Internal-only broadcasts. Team announcements, push notifications. |

**Avoid**: "Deliver" (logistics jargon), "Email" as a verb (use "Send email" instead).

## AU English in button copy

RA-1567 already covers the broader spelling pass. For buttons
specifically: "Cancel" / "Cancelling", "Organise" / "Organisation",
"Authorise" / "Authorisation", "Licence" (noun) / "License" (verb).
When in doubt, match the surrounding body copy — *don't* mix spellings
across a modal + its trigger button.

## Default tone

* Short — one or two words is the sweet spot; three max.
* Specific — `Save client` beats `Save`, but `Save changes` is a fine
  generic on an edit form where the noun is unambiguous.
* Title Case on the button label itself; sentence case in the
  surrounding copy.

## Reviewer checklist

Copy this block into your PR description when you touch a form or
list page:

```
Button-copy review (RA-1568):
- [ ] Save / Delete / Cancel / New / Send cluster picked correctly
- [ ] Noun paired when the action target isn't obvious
- [ ] AU spellings match surrounding copy
- [ ] Destructive actions use ConfirmDialog + "Delete" (not "Remove")
```
