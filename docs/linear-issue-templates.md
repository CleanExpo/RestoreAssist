# Linear Issue Templates — RestoreAssist
## Standardised structure for batch issue creation

**Source:** RA-165 [GAP-002]
**Team:** RestoreAssist (RA)

---

## Template 1: Feature Implementation

```
Title: [FEAT] <Component> — <what it does>

## Goal
One sentence: what does this feature do for the user?

## Acceptance Criteria
- [ ] <specific, testable outcome 1>
- [ ] <specific, testable outcome 2>
- [ ] <TypeScript strict — no `any` types>
- [ ] <tests: unit test for business logic / E2E for user flow>

## Technical Scope
**Files to create:**
- `app/api/<endpoint>/route.ts`
- `components/<Component>.tsx`

**Files to modify:**
- `prisma/schema.prisma` — add <ModelName> model
- `app/dashboard/layout.tsx` — add nav link

**Prisma models needed:** <ModelName>
**Migration name:** <timestamp>_add_<model>

## Dependencies
- Blocks: <RA-XXX>
- Blocked by: <RA-XXX>

## Estimate
<1 | 2 | 3 | 5 | 8> points
```

---

## Template 2: Bug Fix

```
Title: [BUG] <Component> — <symptom>

## Reproduction Steps
1. Go to <URL>
2. <Action>
3. See error: <exact error message>

## Expected Behaviour
<what should happen>

## Actual Behaviour
<what happens instead>

## Root Cause (if known)
<e.g., "Stripe eager-init throws at module evaluation during next build">

## Fix
<describe the fix or approach>

## Affected PRs / Branches
- Branch: <feat/...>
- PR: #<N>

## Estimate
<1 | 2> points
```

---

## Template 3: Human Action Required

```
Title: [HUMAN] <Task> — <what Phill needs to do>

## Owner
Phill McGurk (manual human action — cannot be automated)

## Blocks
- <RA-XXX> (<feature name>)

## Steps
### Step 1 — <Name>
<exact commands or UI actions>

### Step 2 — <Name>
<exact commands or UI actions>

## Verification
After completing:
- [ ] <check that X works>
- [ ] <confirm Y is set>

## Done when
- [ ] <specific state that confirms completion>
```

---

## Template 4: Strategy / Planning

```
Title: [STRATEGY] <Topic> — <what decision is being made>

## Source
<CEO Board decision | Podcast Monitor | CEO memo | date>

## Owner
<Phill | Team>

## Sprint
<Month 1 | Q2 | Q3 | Backlog>

## Decision
<what was decided, by whom>

## Actions
1. <specific action>
2. <specific action>

## Success Metrics
- <measurable outcome by date>

## Done when
- [ ] <specific, verifiable state>
```

---

## Template 5: Content / Marketing

```
Title: [CONTENT] <Asset type> — <description>

## Owner
Phill McGurk

## Format
<YouTube video | LinkedIn post | email | script | document>

## Audience
<Australian restoration professionals | insurance adjusters | etc.>

## Key Messages
1. <message>
2. <message>

## Constraints
- <no product CTA / AUS English / IICRC refs / word count limit>

## Done when
- [ ] <Draft reviewed>
- [ ] <Published to <platform>>
- [ ] <Analytics set up>
```

---

## Template 6: Epic

```
Title: [EPIC] <Feature area> — <milestone>

## Scope
<1-2 sentence description>

## V1 Feature Set (target: <date>)
- [ ] <sub-feature 1> (RA-XXX — <status>)
- [ ] <sub-feature 2> (RA-XXX — <status>)

## Stack
- <technologies>

## Directory
`D:\RestoreAssist\<path>\`

## Board Decision
<source of decision and date>
```

---

## Label Taxonomy

| Label | When to apply |
|-------|--------------|
| `bug` | Incorrect behaviour |
| `feature` | New capability |
| `dx` | Developer experience / tooling |
| `compliance` | IICRC / AS/NZS / WHS regulatory |
| `mobile` | React Native app |
| `ai` | Claude API / AI features |
| `integration` | Third-party API (Ascora, Xero, DR-NRPG) |
| `content` | YouTube / marketing assets |
| `blocked` | Waiting on human action or external dep |
| `p0` | Production blocker |

---

## Priority Guidelines

| Priority | When to use | Response time |
|----------|-------------|---------------|
| Urgent (P0) | Production down, data loss, can't access account | Same session |
| High (P1) | Major feature broken, payment error | Next sprint |
| Normal (P2) | Meaningful improvement, non-critical bug | Backlog |
| Low (P3) | Nice-to-have, cosmetic | When time allows |

---

## Dependency Notation

Always add:
- **Blocks:** issues that CANNOT start until this is done
- **Blocked by:** issues that must complete BEFORE this starts

Example:
```
INF-006 (prisma migrate deploy)
  Blocks: CORE-009 (e-signature), AI-003 (PromptVariant table)
  Blocked by: INF-005 (NODE_TLS for Ascora)
```

---

*Document prepared for RA-165 — Linear issue structure standardisation*
