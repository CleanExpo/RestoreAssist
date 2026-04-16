# RestoreAssist — Engineering Constraints (RA-678 / KARPATHY-5)

#

# Hard constraints the pipeline must respect for this workspace.

# Injected into every build spec automatically.

## Non-Negotiable Constraints

### Auth & Security

- All /api/ routes require getServerSession auth except /api/auth/_, /api/cron/_, webhook endpoints
- Admin routes must use verifyAdminFromDb() from lib/admin-auth.ts — JWT role claims can be stale
- Rate-limit keys must use session.user.id, not client IP
- File uploads must check magic bytes, not Content-Type header

### Data Safety

- Always use Prisma include/select to prevent N+1 queries
- Atomic credit deduction: updateMany with { creditsRemaining: { gte: 1 } } — never read-then-write
- Never expose error.message in API 500 responses
- Subscription gate before every AI call: allowlist is ["TRIAL", "ACTIVE", "LIFETIME"]

### Australian Compliance

- IICRC references must cite edition and section (e.g. "IICRC S500:2025 §7.1")
- GST is always 10%, ABN format is 11 digits
- Use lib/nir-jurisdictional-matrix.ts for state building code variations

### UI/Components

- Use shadcn/ui components from components/ui/ — never create custom form controls
- Brand colours: navy #1C2E47, warm accent #8A6B4E, light accent #D4A574

### Integrations

- Integration sync is always fire-and-forget — failures must never block user operations
- Schema changes require migration: npx prisma migrate dev --name descriptive_name

## Scope Limits

- max_files_modified: 10 (default)
- Prefer editing existing files over creating new ones
- Never add speculative abstractions — only what the task requires
