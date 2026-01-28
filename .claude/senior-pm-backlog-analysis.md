# Senior Project Manager — Backlog Analysis & Prioritization
**Date**: 2026-01-28
**Analyst**: Claude (Senior PM Mode)
**Context**: Post-V1.4 Authority Forms UX completion
**Status**: Analyzing Linear backlog for next priority

---

## Executive Summary

**Current State:**
- ✅ V1.4 Authority Forms UX: **COMPLETE** (Commit 9cc82cbf)
- ⏳ V1.x Phase: 80% complete (V1.1-V1.5 mostly done)
- 🔄 UNI-171 Core CRM Module: **IN PROGRESS** (schema + APIs + pages exist, needs UI completion)
- 📋 10 Priority 2 (High) tasks in backlog (6 Todo, 1 In Progress)

**Recommendation:**
Continue UNI-171 Core CRM Module (In Progress) → Complete UI components and integration before starting new Priority 2 tasks.

---

## Priority Analysis

### Priority 1 (Urgent) — Status: ✅ ALL COMPLETE
- 20/20 tasks completed
- Latest: UNI-185 (V1.5 Production Hardening)

### Priority 2 (High) — Status: 🔄 IN PROGRESS
**Completed (4):**
- UNI-187: Migrate password reset to database ✅
- UNI-186: Remove debug console.log ✅
- UNI-181: Service Pages (27 sub-services) ✅
- UNI-179: ABN/TFN Verification ✅
- UNI-178: STP Phase 2 Compliance ✅
- UNI-155: V1.4 Authority Forms UX ✅
- UNI-154: V1.3 Claims Management ✅
- UNI-153: V1.2 Interview Module ✅
- UNI-152: V1.1 NIR Inspection ✅
- ... (24 more completed)

**In Progress (1):**
- **UNI-171: Core CRM Module — Contacts & Companies** 🔄
  - Status: Backend 60% complete, Frontend 20% complete
  - Blockers: None
  - Dependencies: None
  - Assignee: Claude
  - Est. Completion: 8-12 hours remaining

**Todo (6):**
1. UNI-183: Property Owner Portal (Priority 2)
2. UNI-182: Contractor Directory & Verification (Priority 2)
3. UNI-173: Invoicing & Financial Module (Priority 2)
4. UNI-172: ERP — Inventory & Stock Management (Priority 2)
5. UNI-157: V2.0 — Multi-tenant SaaS Conversion (Priority 2)

### Priority 3 (Normal) — Status: 📋 BACKLOG
- UNI-184: SEO & Local Search (In Progress)
- UNI-180: Tax Reporting Dashboard (Todo)
- UNI-174: Workflow Automation (Todo)
- UNI-163: Client Dashboard White-label (Todo)
- UNI-162: AI Campaign Builder (Todo)

---

## UNI-171: Core CRM Module — Current State Analysis

### What's Already Implemented ✅

**Database Schema (100% Complete):**
- ✅ Company model (D:\RestoreAssist\prisma\schema.prisma:659)
- ✅ Contact model (schema.prisma:722)
- ✅ Activity model (schema.prisma:809)
- ✅ CrmTask model (schema.prisma:852)
- ✅ CrmNote model (schema.prisma:920+)
- ✅ Tag model (schema.prisma:950+)
- ✅ Opportunity model (schema.prisma:1000+)
- ✅ All 9 enums (CompanySize, CompanyStatus, ContactMethod, etc.)
- ✅ Relationships configured (User, Report, Client migration fields)

**API Routes (80% Complete):**
- ✅ GET/POST /api/crm/companies
- ✅ GET/PUT/DELETE /api/crm/companies/[id]
- ✅ GET/POST /api/crm/contacts
- ✅ GET/PUT/DELETE /api/crm/contacts/[id]
- ✅ GET/POST /api/crm/activities
- ✅ GET/POST /api/crm/tasks
- ✅ GET/POST /api/crm/notes
- ✅ GET/POST /api/crm/tags
- ❌ Missing: Company sub-routes (activities, contacts, opportunities)
- ❌ Missing: Contact sub-routes (activities, tasks)
- ❌ Missing: Task completion endpoint
- ❌ Missing: Tag assignment endpoints

**UI Pages (30% Complete):**
- ✅ /dashboard/crm — Dashboard page exists (D:\RestoreAssist\app\dashboard\crm\page.tsx)
- ✅ /dashboard/crm/companies — List page exists
- ✅ /dashboard/crm/contacts — List page exists
- ✅ Loading states created
- ❌ Missing: Company detail page (/companies/[id])
- ❌ Missing: Contact detail page (/contacts/[id])
- ❌ Missing: Activities timeline page
- ❌ Missing: Tasks kanban/list page
- ❌ Missing: Create/edit modals or forms

**UI Components (0% Complete):**
- ❌ Missing: ActivityTimeline component
- ❌ Missing: TaskKanban component
- ❌ Missing: TaskList component
- ❌ Missing: TagPicker component
- ❌ Missing: CompanyCard component
- ❌ Missing: ContactCard component
- ❌ Missing: EntityPicker component
- ❌ Missing: StatsCard (exists in claims, needs CRM version)

**Navigation (50% Complete):**
- ✅ CRM menu item exists in sidebar (likely)
- ❌ Needs verification and submenu configuration

### What Needs to Be Built (40% Remaining)

**Phase 1: Complete API Routes (2-3 hours)**
- Add company sub-routes: /[id]/activities, /[id]/contacts, /[id]/opportunities
- Add contact sub-routes: /[id]/activities, /[id]/tasks
- Add task completion endpoint: /[id]/complete
- Add tag assignment endpoints: /assign, /unassign
- Add search endpoints: /companies/search, /contacts/search

**Phase 2: Build UI Components (3-4 hours)**
- ActivityTimeline.tsx — Timeline component for activities
- TaskKanban.tsx — Kanban board for tasks
- TaskList.tsx — List view for tasks
- TagPicker.tsx — Multi-select tag picker
- CompanyCard.tsx — Company display card
- ContactCard.tsx — Contact display card
- EntityPicker.tsx — Universal entity selector

**Phase 3: Build Detail Pages (2-3 hours)**
- /companies/[id]/page.tsx — Company detail with tabs
- /contacts/[id]/page.tsx — Contact detail with tabs
- Activities timeline view
- Tasks management view

**Phase 4: Polish & Integration (1-2 hours)**
- Update navigation with CRM submenu
- Add create/edit forms
- Test all flows
- Build verification
- Documentation

**Total Remaining Effort: 8-12 hours**

---

## Task Breakdown: UNI-171 Core CRM Completion

### Epic: UNI-171 Core CRM Module
**Status**: In Progress (60% backend, 20% frontend)
**Priority**: P2 (High)
**Effort**: 8-12 hours remaining
**Dependencies**: None
**Blockers**: None

#### Sub-Task 1: Complete CRM API Routes (P0)
**Effort**: 2-3 hours
**Status**: Not Started
**Files to Create (5):**
- `app/api/crm/companies/[id]/activities/route.ts`
- `app/api/crm/companies/[id]/contacts/route.ts`
- `app/api/crm/contacts/[id]/activities/route.ts`
- `app/api/crm/tasks/[id]/complete/route.ts`
- `app/api/crm/tags/assign/route.ts`

**Acceptance Criteria:**
- [ ] Company activities endpoint returns all activities for company
- [ ] Company contacts endpoint returns all contacts for company
- [ ] Contact activities endpoint returns contact activity history
- [ ] Task completion endpoint marks task complete with timestamp
- [ ] Tag assignment endpoint creates ContactTag/CompanyTag records
- [ ] All endpoints have proper auth and error handling
- [ ] All endpoints return consistent JSON format

#### Sub-Task 2: Build CRM UI Components (P0)
**Effort**: 3-4 hours
**Status**: Not Started
**Files to Create (7):**
- `components/crm/ActivityTimeline.tsx` (200-250 lines)
- `components/crm/TaskKanban.tsx` (300-350 lines)
- `components/crm/TaskList.tsx` (200 lines)
- `components/crm/TagPicker.tsx` (150 lines)
- `components/crm/CompanyCard.tsx` (100 lines)
- `components/crm/ContactCard.tsx` (100 lines)
- `components/crm/EntityPicker.tsx` (150 lines)

**Design Requirements:**
- Follow V1.3 design system (ScoreRing, StatCard patterns)
- Use Shadcn/ui components (Dialog, Card, Badge, etc.)
- Mobile responsive (breakpoints at md:768px)
- Dark mode support throughout
- Color consistency: cyan for primary actions, emerald for success

**Acceptance Criteria:**
- [ ] ActivityTimeline displays chronological activity list with icons
- [ ] TaskKanban has 3+ columns (TODO, IN_PROGRESS, COMPLETED)
- [ ] TaskList shows tasks with priority colors
- [ ] TagPicker allows multi-select with color display
- [ ] CompanyCard shows company info in card format
- [ ] ContactCard shows contact with company link
- [ ] EntityPicker has search and select functionality
- [ ] All components are mobile responsive
- [ ] All components support dark mode

#### Sub-Task 3: Build CRM Detail Pages (P0)
**Effort**: 2-3 hours
**Status**: Not Started
**Files to Create (5):**
- `app/dashboard/crm/companies/[id]/page.tsx`
- `app/dashboard/crm/companies/[id]/loading.tsx`
- `app/dashboard/crm/contacts/[id]/page.tsx`
- `app/dashboard/crm/contacts/[id]/loading.tsx`
- `app/dashboard/crm/activities/page.tsx`

**Page Structure:**
- Company Detail: Tabs (Overview, Contacts, Activities, Tasks, Opportunities)
- Contact Detail: Tabs (Overview, Activities, Tasks, Notes)
- Activities: Timeline view with filters

**Acceptance Criteria:**
- [ ] Company detail page loads company data
- [ ] Company tabs show related entities
- [ ] Contact detail page loads contact data
- [ ] Contact tabs show activity history
- [ ] Activities page shows unified timeline
- [ ] All pages have loading states
- [ ] All pages handle errors gracefully

#### Sub-Task 4: CRM Navigation & Polish (P1)
**Effort**: 1-2 hours
**Status**: Not Started
**Files to Modify (2):**
- `app/dashboard/layout.tsx` — Add CRM submenu
- `app/dashboard/crm/page.tsx` — Enhance dashboard stats

**Navigation Structure:**
```typescript
{
  label: "CRM",
  icon: Building2,
  href: "/dashboard/crm",
  submenu: [
    { label: "Dashboard", href: "/dashboard/crm" },
    { label: "Companies", href: "/dashboard/crm/companies" },
    { label: "Contacts", href: "/dashboard/crm/contacts" },
    { label: "Activities", href: "/dashboard/crm/activities" },
    { label: "Tasks", href: "/dashboard/crm/tasks" },
  ]
}
```

**Acceptance Criteria:**
- [ ] CRM menu item in sidebar with submenu
- [ ] Dashboard shows real stats (not mocks)
- [ ] Quick actions on dashboard work
- [ ] All navigation links work
- [ ] Active route highlighting works

#### Sub-Task 5: Testing & Documentation (P1)
**Effort**: 1 hour
**Status**: Not Started
**Deliverables:**
- Build verification (npm run build)
- Manual testing checklist
- Completion summary document

**Acceptance Criteria:**
- [ ] Build passes with 0 errors
- [ ] All CRUD operations tested
- [ ] Mobile responsiveness tested
- [ ] Dark mode tested
- [ ] Documentation created (.claude/uni-171-completion.md)

---

## Next 5 Priority 2 Tasks Analysis

### UNI-183: Property Owner Portal
**Priority**: P2 (High)
**Status**: Todo
**Dependencies**: Client portal system (exists), Authority forms (done)
**Effort Estimate**: 6-8 hours
**Description**: Build portal for property owners to view reports, sign authority forms, track job progress
**Complexity**: Medium
**Business Value**: High (client engagement, transparency)

**Scope:**
- Portal authentication (extends existing ClientUser system)
- Property owner dashboard
- Report viewing (read-only)
- Authority form signing
- Progress tracking
- Document downloads
- Notification preferences

**Technical Approach:**
- Extend existing /portal structure
- Reuse AuthorityFormViewer (read-only mode)
- Add PropertyOwner role to ClientUser
- Create PropertyOwnerDashboard component

---

### UNI-182: Contractor Directory & Verification
**Priority**: P2 (High)
**Status**: Todo
**Dependencies**: ContractorProfile model (exists), Verification system
**Effort Estimate**: 8-10 hours
**Description**: Public contractor directory with verification badges, reviews, service areas
**Complexity**: Medium-High
**Business Value**: High (marketplace feature, trust building)

**Scope:**
- Public contractor directory page (/contractors)
- Search and filter (location, services, ratings)
- Contractor profile pages (/contractors/[slug])
- Verification system (licenses, insurance, certifications)
- Review management (already partially built)
- Service area mapping

**Technical Approach:**
- Extend existing ContractorProfile model
- Build search API with Elasticsearch or Algolia
- Verification badge system
- Google Maps integration for service areas
- Review aggregation and display

**Note**: ContractorProfile already exists (schema.prisma:508), reviews system exists (ContractorReview model:604), just needs frontend polish and verification workflow

---

### UNI-173: Invoicing & Financial Module
**Priority**: P2 (High)
**Status**: Todo
**Dependencies**: **UNI-171 CRM** (Contact/Company models)
**Effort Estimate**: 12-16 hours
**Description**: Comprehensive invoicing system with Stripe payments, recurring billing, credit notes, PDF generation
**Complexity**: High
**Business Value**: Critical (revenue generation)

**Scope:**
- Invoice CRUD (create, read, update, delete)
- Invoice templates and PDF generation
- Stripe payment integration (checkout, webhooks)
- Recurring billing (subscription-style invoices)
- Credit notes and adjustments
- Payment tracking and status updates
- Accounting software sync (Xero, QuickBooks, MYOB)
- Financial dashboard and reports

**Technical Approach:**
- Create Invoice model (number, date, due date, line items, tax, total)
- Create InvoiceLineItem model
- Create Payment model (stripe payment tracking)
- Stripe Checkout integration
- PDF generation with company branding
- Xero/QuickBooks OAuth integration
- Email invoice delivery

**Dependencies**:
- ⚠️ **BLOCKS**: Requires Contact/Company from UNI-171 CRM
- Plan file exists: `C:\Users\Disaster Recovery 4\.claude\plans\glowing-rolling-pumpkin.md`

---

### UNI-172: ERP — Inventory & Stock Management
**Priority**: P2 (High)
**Status**: Todo
**Dependencies**: None (standalone)
**Effort Estimate**: 16-20 hours
**Description**: Full inventory management system with stock tracking, reorder points, suppliers
**Complexity**: Very High
**Business Value**: Medium-High (operational efficiency)

**Scope:**
- Inventory items (SKU, name, description, price, cost)
- Stock locations and warehouses
- Stock movements (in, out, transfer, adjustment)
- Reorder points and alerts
- Supplier management
- Purchase orders
- Stock valuation (FIFO, LIFO, Weighted Average)
- Barcode scanning support
- Low stock notifications
- Inventory reports

**Technical Approach:**
- Create InventoryItem model
- Create StockLocation model
- Create StockMovement model
- Create Supplier model
- Create PurchaseOrder model
- Real-time stock updates
- Audit trail for all movements

**Recommendation**: Defer to Phase 2+ (large scope, not MVP critical)

---

### UNI-157: V2.0 — Multi-tenant SaaS Conversion
**Priority**: P2 (High)
**Status**: Todo
**Dependencies**: All V1.x features complete
**Effort Estimate**: 40-60 hours (Epic)
**Description**: Convert single-tenant app to multi-tenant SaaS with white-labeling
**Complexity**: Very High
**Business Value**: Critical (scalability, B2B market)

**Scope:**
- Tenant isolation (schema, data, files)
- Subdomain routing (tenant1.restoreassist.com)
- White-label configuration (logo, colors, domain)
- Tenant admin dashboard
- Subscription management per tenant
- API rate limiting per tenant
- Tenant onboarding flow
- Data export/migration tools

**Technical Approach:**
- Add tenantId to all models
- Row-level security (Prisma middleware or Postgres RLS)
- Cloudinary folder per tenant
- Next.js middleware for tenant detection
- Tenant settings table
- Multi-tenant migrations

**Recommendation**: Major project, should be separate phase after MVP launch

---

## Priority 3 Tasks Summary

### UNI-184: SEO & Local Search Optimization (In Progress)
- Already in progress
- Focus: Meta tags, structured data, local SEO, Google Business Profile
- Est: 4-6 hours remaining

### UNI-180: Tax Reporting Dashboard
- Depends on invoicing (UNI-173)
- BAS, PAYG, GST reports
- Est: 6-8 hours

### UNI-174: Workflow Automation
- Agent orchestration enhancements
- Zapier-style workflow builder
- Est: 12-16 hours

---

## Recommended Roadmap (Next 4 Weeks)

### Week 1: Complete UNI-171 Core CRM (8-12 hours)
**Days 1-2: API Routes & Components**
- Complete missing API routes (2-3 hours)
- Build 7 UI components (3-4 hours)

**Days 3-4: Detail Pages & Polish**
- Build company/contact detail pages (2-3 hours)
- Navigation integration (1-2 hours)
- Testing & build verification (1 hour)

**Deliverable**: Fully functional CRM module with Companies, Contacts, Activities, Tasks

---

### Week 2: UNI-183 Property Owner Portal (6-8 hours)
**Days 1-2: Portal UI**
- Property owner dashboard (3-4 hours)
- Report viewing integration (2-3 hours)
- Testing and polish (1 hour)

**Deliverable**: Property owners can log in, view reports, sign forms, track progress

---

### Week 3: UNI-182 Contractor Directory (8-10 hours)
**Days 1-2: Public Directory**
- Search and filter UI (3-4 hours)
- Profile pages with verification badges (3-4 hours)
- Review display and maps (2-3 hours)

**Deliverable**: Public contractor directory with search, profiles, reviews, verification

---

### Week 4: UNI-173 Invoicing Module — Phase 1 (12-16 hours)
**Days 1-3: Core Invoicing**
- Invoice models and CRUD (4-5 hours)
- PDF generation (3-4 hours)
- Stripe integration (3-4 hours)
- Basic dashboard (2-3 hours)

**Deliverable**: Create invoices, send to clients, accept Stripe payments, generate PDFs

---

## Decision Matrix: What to Build Next?

| Task | Priority | Status | Dependencies | Effort | Business Value | Risk | Recommendation |
|------|----------|--------|--------------|--------|----------------|------|----------------|
| UNI-171 CRM | P2 | In Progress | None | 8-12h | High | Low | **START NOW** ✅ |
| UNI-183 Portal | P2 | Todo | None | 6-8h | High | Low | After CRM |
| UNI-182 Directory | P2 | Todo | Partial (models exist) | 8-10h | High | Low | After Portal |
| UNI-173 Invoicing | P2 | Todo | **CRM** | 12-16h | Critical | Medium | After CRM |
| UNI-172 ERP | P2 | Todo | None | 16-20h | Medium | High | Defer to V2 |
| UNI-157 Multi-tenant | P2 | Todo | All V1.x | 40-60h | Critical | High | Defer to V2 |

**Verdict**: Continue UNI-171 CRM → Complete it → Then tackle Portal → Directory → Invoicing

---

## Resource Allocation

**Current Team**: Claude (Full-stack AI)
**Availability**: 24/7
**Velocity**: ~10-15 hours/day (effective)
**Estimated Timeline**:
- UNI-171 completion: 1-2 days
- UNI-183 completion: 1 day
- UNI-182 completion: 1 day
- UNI-173 Phase 1: 1-2 days

**Total**: ~4-6 days to complete all Priority 2 immediate tasks (excluding ERP and Multi-tenant)

---

## Risk Analysis

### Technical Risks
1. **CRM Data Migration** (Low): Client → Contact migration needed
   - Mitigation: Dual-write pattern, gradual migration
   - Plan already exists in glowing-rolling-pumpkin.md

2. **Stripe Integration Complexity** (Medium): Webhooks, idempotency
   - Mitigation: Use Stripe SDK, test webhooks locally with Stripe CLI

3. **Multi-tenant Complexity** (High): Major architecture change
   - Mitigation: Defer to Phase 2, requires dedicated planning

### Business Risks
1. **Feature Creep** (Medium): Scope expanding on each task
   - Mitigation: Strict acceptance criteria, MVP-first approach

2. **Technical Debt** (Low): Moving fast without refactoring
   - Mitigation: V1.5 production hardening already done

---

## Success Metrics

**UNI-171 CRM Success Criteria:**
- [ ] All API routes return correct data
- [ ] All UI components render without errors
- [ ] Company and contact CRUD works end-to-end
- [ ] Activity logging functional
- [ ] Task management operational
- [ ] Build passes with 0 errors
- [ ] Mobile responsive on all pages
- [ ] Dark mode support throughout

**Overall Sprint Success:**
- [ ] UNI-171 moved to "Done" in Linear
- [ ] Documentation created (completion summary)
- [ ] Git commit with clear message
- [ ] No production errors introduced
- [ ] Performance maintained (no regression)

---

## Next Action

**Immediate Next Step:**
✅ **Begin UNI-171 Core CRM Completion — Sub-Task 1: Complete CRM API Routes**

**First Task:**
Create missing API route: `/api/crm/companies/[id]/activities/route.ts`

**Working Branch:** main (or create feature/crm-completion if preferred)

**Estimated Session Time:** 2-3 hours for all API routes

---

## Appendix: File Inventory

### Existing CRM Files

**Schema:**
- `prisma/schema.prisma` — 7 CRM models (lines 659-1100+)

**API Routes (8 files):**
- `app/api/crm/activities/route.ts`
- `app/api/crm/companies/route.ts`
- `app/api/crm/companies/[id]/route.ts`
- `app/api/crm/contacts/route.ts`
- `app/api/crm/contacts/[id]/route.ts`
- `app/api/crm/notes/route.ts`
- `app/api/crm/tags/route.ts`
- `app/api/crm/tasks/route.ts`

**Pages (6 files):**
- `app/dashboard/crm/page.tsx`
- `app/dashboard/crm/loading.tsx`
- `app/dashboard/crm/companies/page.tsx`
- `app/dashboard/crm/companies/loading.tsx`
- `app/dashboard/crm/contacts/page.tsx`
- `app/dashboard/crm/contacts/loading.tsx`

**Components:**
- None yet (to be created)

---

**Analysis Complete**
**Status**: Ready to proceed with UNI-171 CRM completion
**Next Step**: Create todo list and begin implementation
