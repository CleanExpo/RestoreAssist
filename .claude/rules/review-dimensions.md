# Review Dimensions — Reference Document

> **Authority**: Loaded by PR Manager, Orchestrator, and all review sub-agents.
> **Purpose**: Defines the 18 dimensions used to evaluate every PR against RestoreAssist's quality standards.

## The 18 Dimensions

### Critical Severity (must fix — blocks merge)

| #   | Dimension                     | What to check                                                                                                                                    |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2   | **Security**                  | Auth checks on all API routes (`getServerSession`), input validation, parameterised queries, no secrets in code, XSS prevention, CSRF protection |
| 7   | **Data Modelling**            | Prisma relations correct, indexes on query fields, no orphaned records, referential integrity, nullable vs required                              |
| 16  | **Database Migration Safety** | No destructive `DROP` without backup plan, no data loss risk, column renames use two-step, index creation won't lock tables                      |
| 17  | **Integration Integrity**     | OAuth flows complete, webhook signatures verified, rate limiting present, retry with backoff, idempotency keys                                   |

### Important Severity (should fix — flags in review)

| #   | Dimension                   | What to check                                                                                                                                                |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Architecture & Patterns** | Follows existing project patterns, proper separation (page → API → service), no business logic in components, consistent file structure                      |
| 3   | **Performance**             | No N+1 queries (use `include`/`select`), pagination on list endpoints, no unbounded `findMany`, lazy loading for heavy components, image optimisation        |
| 4   | **Error Handling**          | Try/catch on all API routes, user-friendly error messages, graceful degradation with fallback UI, no swallowed errors, proper HTTP status codes              |
| 5   | **Type Safety**             | Minimal `any` usage (document if necessary), null checks before property access, Prisma types used correctly, generic types for reusable functions           |
| 6   | **API Design**              | RESTful conventions (GET/POST/PATCH/DELETE), consistent response shapes `{ data }` or `{ error }`, auth middleware on protected routes, correct status codes |
| 9   | **Accessibility**           | ARIA labels on interactive elements, keyboard navigation works, colour contrast meets WCAG AA, screen reader text on icons, focus management                 |
| 12  | **Dependency Management**   | No unnecessary new packages (check if existing dep does it), pinned versions for critical deps, no huge bundle additions, MIT/Apache licensed                |
| 14  | **Scalability**             | No hardcoded limits without constants, pagination on all lists, no unbounded loops, memory-safe patterns, connection pooling                                 |
| 15  | **Australian Compliance**   | IICRC references use correct edition/section, ABN format validated, GST at 10%, state-specific building codes referenced correctly                           |

### Suggestion Severity (optional — nice to have)

| #   | Dimension                    | What to check                                                                                                                                                  |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8   | **State Management**         | React state close to where it's used, no unnecessary re-renders, Context vs prop drilling justified, optimistic updates where appropriate                      |
| 10  | **Testing Strategy**         | Test coverage for critical paths, edge cases considered, tests are deterministic, no flaky tests                                                               |
| 11  | **Documentation**            | JSDoc on exported functions, inline comments on non-obvious logic, README updated if public API changed                                                        |
| 13  | **Code Style & Conventions** | Naming matches project patterns (`camelCase` functions, `PascalCase` components), import order consistent, CLAUDE.md rules followed                            |
| 18  | **UI/UX Consistency**        | Uses shadcn/ui components (not custom), brand colour palette (`#1C2E47`, `#8A6B4E`, `#D4A574`), responsive at mobile/tablet/desktop, loading skeletons present |

## Dimension Activation Matrix

Not every dimension applies to every PR. The PR Manager activates dimensions based on changed file paths:

```
app/dashboard/**/*.tsx     → 1, 4, 5, 8, 9, 13, 18
app/api/**/*.ts            → 2, 3, 4, 5, 6, 14
prisma/**                  → 2, 7, 16
lib/integrations/**        → 2, 4, 17
lib/ai/**                  → 3, 4, 5, 14
components/**              → 1, 5, 9, 13, 18
lib/*.ts                   → 1, 4, 5, 14
.github/**                 → (no dimensions — infra review only)
content/**                 → 11, 15
packages/videos/**         → 1, 12, 13
```

## Verdict Thresholds

| Verdict               | Criteria                                              |
| --------------------- | ----------------------------------------------------- |
| **APPROVED**          | 0 Critical findings, ≤ 2 Important findings           |
| **CHANGES REQUESTED** | Any Critical finding OR ≥ 3 Important findings        |
| **NEEDS DISCUSSION**  | Architecture-level concerns requiring human judgement |

## Confidence Scoring

Each finding must include a confidence score (0–100). Only findings with **≥ 75% confidence** are included in the final report. This prevents false positives from wasting developer time.

Confidence boosters:

- Finding is in code the PR actually changed (+20)
- Finding matches a known anti-pattern (+15)
- Finding is reproducible / has a concrete example (+20)

Confidence reducers:

- Finding is in pre-existing code, not changed by this PR (-30)
- Finding is stylistic preference, not a bug (-20)
- Finding would be caught by linter/compiler (-25)
