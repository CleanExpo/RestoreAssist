# Enhancement Review

## auto-approve
- [x] Added guard test to detect S520:2024 citation inconsistencies

## need-sign-off
- [ ] Fix S520:2024 citations in iicrc-checklists.ts (§14.1/.2/.3 → §12.x)
- [ ] Fix S520:2024 citations in equipment-calculator-mould.ts (§12.3/.4 → §9.x or §5)
- [ ] Fix S520:2024 citations in nir-standards-mapping.ts (§6/§7.3/§8.1/§9 → correct chapters)
- [ ] Fix S520:2024 citations in scope-biohazard.ts (§6.1 → §9.x or §5)
- [ ] Fix S520:2024 citations in equipment-hepa-negative-air.ts (§12.2 → §9.x)
- [ ] Fix S520:2024 citations in assessments/domains/mould.ts (§12.2/.2.1/.2.2/.3/.4 → §9.x)
- [ ] Apply `take` clauses to unbounded findMany queries across multiple API routes:
  - Tier 1: reports, inspections, notifications, clients, invoices, estimates, scopes
  - Tier 2: cron jobs, admin routes, analytics
  - Tier 3: smaller tables with existing bounds
- [ ] Extend unit tests for reports pipeline

## more-context
- [ ] Obtain licensed per-chapter S520:2024 PDFs to confirm exact subsection numbers for chapters 5, 9, and 12
- [ ] Determine exact section mappings for all remaining citations

---