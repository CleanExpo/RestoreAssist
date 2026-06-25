# Deferred Linear comment — RA-4827 batch-4 close-out

**Target ticket:** [RA-4827](https://linear.app/unite-group/issue/RA-4827)
**Action:** add comment (the apply landed; this is the verification message)
**Why deferred:** Linear MCP server was unreachable when the comment was first attempted (`Streamable HTTP error: Server not found`). Apply this when the connector is back.

## Comment body to post

```markdown
**Batch 4 applied + #1143 merged 2026-05-18 — `unindexed_foreign_keys` 12 → 3**

9 snake_case-table FK indexes verified in `pg_indexes`:
- `customers_organization_id_idx`, `orders_organization_id_idx`, `order_items_order_id_idx`, `order_items_product_id_idx`, `products_organization_id_idx`, `quote_items_product_id_idx`, `quote_items_quote_id_idx`, `quotes_organization_id_idx`, `users_organization_id_idx`

Remaining 3 `unindexed_foreign_keys` are the Prisma-orphan tables (ClientInvite + MobileInspection ×2). These tables exist in prod but not in `prisma/schema.prisma` — separate ticket needed since long-term fix requires deciding whether to add them to Prisma schema or leave as raw-SQL-managed.

**Final session delta on `udooysjajglluvuxkijp` (verified via `get_advisors`):**

| Metric | Pre-session | Now |
|---|---|---|
| Total perf advisors | 586 | 510 |
| Perf WARN | 82 | **7** |
| `unindexed_foreign_keys` (WARN) | 35 | 0 |
| `auth_rls_initplan` (WARN) | 47 | 0 |
| `multiple_permissive_policies` (WARN) | 34 | 6 |

**91% perf WARN reduction across 4 batches and 5 PRs (#1139, #1140, #1141, #1142, #1143).**

Remaining 7 WARN:
- 6 `multiple_permissive_policies` on snake_case tables — requires policy decision on whether the auth read/write split is intentional
- 1 `duplicate_index` (single-instance, lowest priority)

Both deferred to separate tickets — RA-4827 closed in the previous turn already.
```

## Replay command (when Linear is back)

```python
mcp__claude_ai_Linear__save_comment(
  issueId="RA-4827",
  body="<paste the markdown block above>"
)
```
