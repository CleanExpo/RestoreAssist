# Senior Project Manager — Backlog Analysis & Prioritization
**Date**: 2026-01-28 (Updated)
**Analyst**: Claude (Senior PM Mode)
**Context**: Post-UNI-173 Invoicing Module Completion
**Status**: Analyzing Linear backlog for next priority

---

## Executive Summary

**Current State:**
- ✅ UNI-173 Invoicing Module: **COMPLETE** (Commits 6ceca473, bef20471)
- ✅ V1.4 Authority Forms UX: **COMPLETE**
- 🔄 UNI-171 Core CRM Module: **PARTIAL** (schema + APIs exist, needs UI completion)
- 📋 9 Priority 2 (High) tasks remaining in backlog

**Latest Completion:**
- **UNI-173 Invoicing & Financial Module** — Just completed (3 features):
  1. ✅ Accounting Sync (Xero, QuickBooks, MYOB)
  2. ✅ Invoice Templates (customizable PDF templates)
  3. ✅ Invoice Variations (change orders)

**Recommendation:**
Continue **UNI-171 Core CRM Module** → Complete remaining UI components and detail pages before starting new Priority 2 tasks.

---

## Priority Analysis — Updated

### Priority 1 (Urgent) — Status: ✅ ALL COMPLETE
- 20/20 tasks completed
- Latest: UNI-185 (V1.5 Production Hardening)

### Priority 2 (High) — Status: 🔄 IN PROGRESS

**Recently Completed:**
- ✅ **UNI-173: Invoicing & Financial Module** (Just completed 2026-01-28)
  - Accounting sync to Xero, QuickBooks, MYOB
  - Invoice templates with 40+ customization fields
  - Invoice variations (change orders)
  - 3 integration libraries created
  - 7 new API routes
  - UI enhancements for sync status
- ✅ UNI-187: Migrate password reset to database
- ✅ UNI-186: Remove debug console.log
- ✅ UNI-181: Service Pages (27 sub-services)
- ✅ UNI-179: ABN/TFN Verification
- ✅ UNI-178: STP Phase 2 Compliance
- ✅ UNI-155: V1.4 Authority Forms UX
- ✅ UNI-154: V1.3 Claims Management
- ✅ UNI-153: V1.2 Interview Module
- ✅ UNI-152: V1.1 NIR Inspection

**In Progress (1):**
- **🔄 UNI-171: Core CRM Module — Contacts & Companies**
  - Status: Backend 100% complete, Frontend 40% complete
  - What's Done: Schema, API routes, list pages
  - What's Missing: Detail pages, UI components
  - Blockers: None
  - Dependencies: None
  - Assignee: Claude
  - Est. Completion: 6-8 hours remaining

**Todo - Remaining Priority 2 (4):**
1. UNI-183: Property Owner Portal
2. UNI-182: Contractor Directory & Verification
3. UNI-172: ERP — Inventory & Stock Management
4. UNI-157: V2.0 — Multi-tenant SaaS Conversion

### Priority 3 (Normal) — Status: 📋 BACKLOG
- UNI-184: SEO & Local Search (In Progress)
- UNI-180: Tax Reporting Dashboard (Todo)
- UNI-174: Workflow Automation (Todo)
- UNI-163: Client Dashboard White-label (Todo)
- UNI-162: AI Campaign Builder (Todo)

---

## UNI-171: Core CRM Module — Updated Status Analysis

### What's Already Complete ✅

**Database Schema (100% Complete):**
- ✅ Company model with all fields and relations
- ✅ Contact model with CRM integration
- ✅ Activity model for interaction tracking
- ✅ CrmTask model for task management
- ✅ CrmNote model for notes
- ✅ Tag model with many-to-many relationships
- ✅ Opportunity model for sales pipeline
- ✅ All 9 enums configured
- ✅ User relationships established

**API Routes (100% Complete):**
- ✅ GET/POST /api/crm/companies
- ✅ GET/PUT/DELETE /api/crm/companies/[id]
- ✅ GET /api/crm/companies/[id]/activities
- ✅ GET /api/crm/companies/[id]/contacts
- ✅ GET/POST /api/crm/contacts
- ✅ GET/PUT/DELETE /api/crm/contacts/[id]
- ✅ GET /api/crm/contacts/[id]/activities
- ✅ GET/POST /api/crm/activities
- ✅ GET/POST /api/crm/tasks
- ✅ PATCH /api/crm/tasks/[id]/complete
- ✅ GET/POST /api/crm/notes
- ✅ GET/POST /api/crm/tags
- ✅ POST /api/crm/tags/assign

**UI Pages (40% Complete):**
- ✅ /dashboard/crm — Dashboard page
- ✅ /dashboard/crm/companies — Company list page
- ✅ /dashboard/crm/contacts — Contact list page
- ✅ /dashboard/crm/activities — Activities timeline page
- ✅ /dashboard/crm/tasks — Task management page
- ❌ Missing: Company detail page (/companies/[id])
- ❌ Missing: Contact detail page (/contacts/[id])
- ❌ Missing: Create/edit forms and modals

**UI Components (0% Complete):**
- ❌ Missing: ActivityTimeline component
- ❌ Missing: TaskKanban component
- ❌ Missing: TaskList component
- ❌ Missing: TagPicker component
- ❌ Missing: CompanyCard component (basic exists, needs enhancement)
- ❌ Missing: ContactCard component (basic exists, needs enhancement)
- ❌ Missing: EntityPicker component

**Navigation (100% Complete):**
- ✅ CRM menu item with full submenu configured

### What Needs to Be Built (60% Remaining)

**Phase 1: Build UI Components (3-4 hours)**
Priority: P0 (Critical path)
- ActivityTimeline.tsx — Timeline component for activities (250 lines)
- TaskKanban.tsx — Kanban board for tasks (350 lines)
- TaskList.tsx — List view for tasks (200 lines)
- TagPicker.tsx — Multi-select tag picker (150 lines)
- CompanyCard.tsx — Enhanced company display card (150 lines)
- ContactCard.tsx — Enhanced contact display card (150 lines)
- EntityPicker.tsx — Universal entity selector (150 lines)

**Phase 2: Build Detail Pages (2-3 hours)**
Priority: P0 (Critical path)
- /companies/[id]/page.tsx — Company detail with tabs (400 lines)
- /contacts/[id]/page.tsx — Contact detail with tabs (400 lines)
- Create/edit modals for companies and contacts (300 lines)

**Phase 3: Polish & Integration (1-2 hours)**
Priority: P1 (Important)
- Enhance dashboard with real-time stats
- Add quick action buttons
- Test all CRUD flows
- Mobile responsiveness verification
- Dark mode verification
- Build verification

**Total Remaining Effort: 6-8 hours**

---

## Task Breakdown: UNI-171 Core CRM Completion

### Epic: UNI-171 Core CRM Module
**Status**: In Progress (Backend 100%, Frontend 40%)
**Priority**: P2 (High)
**Effort**: 6-8 hours remaining
**Dependencies**: None
**Blockers**: None

#### Sub-Task 1: Build CRM UI Components (P0)
**Effort**: 3-4 hours
**Status**: Not Started
**Priority**: Critical Path

**Files to Create (7):**
1. `components/crm/ActivityTimeline.tsx` (250 lines)
   - Display chronological activity list
   - Activity icons per type (call, email, meeting, etc.)
   - Expandable details
   - Filter by type, date range
   - Dark mode support

2. `components/crm/TaskKanban.tsx` (350 lines)
   - 4 columns: TODO, IN_PROGRESS, WAITING, COMPLETED
   - Drag-and-drop between columns
   - Task cards with priority colors
   - Filter by assignee, due date
   - Quick edit modal

3. `components/crm/TaskList.tsx` (200 lines)
   - Table view of tasks
   - Sort by priority, due date, status
   - Inline status toggle
   - Priority badges
   - Assignee avatars

4. `components/crm/TagPicker.tsx` (150 lines)
   - Multi-select dropdown
   - Color-coded tag display
   - Create new tags inline
   - Search/filter tags
   - Used in company/contact forms

5. `components/crm/CompanyCard.tsx` (150 lines)
   - Company logo/icon
   - Key metrics (contacts, revenue, tasks)
   - Stage/status badge
   - Quick actions (view, edit, delete)
   - Click to navigate to detail

6. `components/crm/ContactCard.tsx` (150 lines)
   - Contact avatar/initials
   - Company affiliation
   - Contact methods (email, phone)
   - Recent activity indicator
   - Quick actions

7. `components/crm/EntityPicker.tsx` (150 lines)
   - Universal selector for companies/contacts
   - Search with debounce
   - Create new entity inline
   - Used in activity/task creation
   - Keyboard navigation

**Design Requirements:**
- Follow V1.4 design system (cyan primary, emerald success)
- Use Tailwind CSS with dark mode classes
- Mobile responsive (breakpoints: sm:640px, md:768px, lg:1024px)
- Lucide React icons
- Smooth transitions and animations
- Loading states for async operations

**Acceptance Criteria:**
- [ ] All 7 components render without errors
- [ ] Components integrate with existing API routes
- [ ] Mobile responsive on all screen sizes
- [ ] Dark mode fully supported
- [ ] Accessibility (ARIA labels, keyboard nav)
- [ ] No console errors or warnings
- [ ] TypeScript types properly defined

#### Sub-Task 2: Build CRM Detail Pages (P0)
**Effort**: 2-3 hours
**Status**: Not Started
**Priority**: Critical Path

**Files to Create (5):**
1. `app/dashboard/crm/companies/[id]/page.tsx` (400 lines)
   - Company overview tab (header, details, stats)
   - Contacts tab (list of contacts at company)
   - Activities tab (timeline of activities)
   - Tasks tab (tasks related to company)
   - Opportunities tab (sales pipeline)
   - Notes tab (company notes)
   - Edit company modal
   - Delete confirmation

2. `app/dashboard/crm/companies/[id]/loading.tsx` (50 lines)
   - Skeleton loader for company detail
   - Shimmer effects
   - Layout matches final page

3. `app/dashboard/crm/contacts/[id]/page.tsx` (400 lines)
   - Contact overview tab (header, details, company)
   - Activities tab (timeline)
   - Tasks tab (contact tasks)
   - Notes tab (contact notes)
   - Edit contact modal
   - Delete confirmation

4. `app/dashboard/crm/contacts/[id]/loading.tsx` (50 lines)
   - Skeleton loader for contact detail

5. `components/crm/CreateCompanyModal.tsx` (200 lines)
   - Form for creating new company
   - Validation
   - API integration
   - Success toast

6. `components/crm/CreateContactModal.tsx` (200 lines)
   - Form for creating new contact
   - Company selector
   - Validation
   - API integration

**Tab Structure:**
Company Detail:
- Overview (header, key info, stats)
- Contacts (list of contacts)
- Activities (timeline)
- Tasks (kanban or list)
- Opportunities (pipeline view)
- Notes (note list)

Contact Detail:
- Overview (header, company link, contact info)
- Activities (timeline)
- Tasks (list)
- Notes (note list)

**Acceptance Criteria:**
- [ ] Company detail page loads and displays data
- [ ] Contact detail page loads and displays data
- [ ] All tabs functional and switch correctly
- [ ] Edit modals work for companies and contacts
- [ ] Create modals work from list pages
- [ ] Delete confirmations work
- [ ] Loading states show during data fetch
- [ ] Error states display user-friendly messages
- [ ] Navigation between related entities works
- [ ] Mobile responsive layout

#### Sub-Task 3: Dashboard Enhancement & Polish (P1)
**Effort**: 1-2 hours
**Status**: Not Started
**Priority**: Important

**Files to Modify:**
1. `app/dashboard/crm/page.tsx` — Enhance dashboard
   - Add real-time stats (not mocks)
   - Quick action buttons (New Company, New Contact, New Task)
   - Recent activities widget
   - Upcoming tasks widget
   - Pipeline value chart
   - Contact/company growth chart

**Enhancements:**
- Replace mock data with real API calls
- Add charts (Recharts or similar)
- Add quick filters (This Week, This Month, All Time)
- Add export functionality
- Improve layout responsiveness

**Acceptance Criteria:**
- [ ] Dashboard displays real data from API
- [ ] Quick actions work (modals open)
- [ ] Stats update in real-time
- [ ] Charts render correctly
- [ ] Mobile responsive
- [ ] Dark mode supported

#### Sub-Task 4: Testing & Documentation (P1)
**Effort**: 1 hour
**Status**: Not Started

**Deliverables:**
1. Manual testing checklist
2. Build verification (`npm run build`)
3. Completion summary document (`.claude/uni-171-completion.md`)

**Testing Checklist:**
- [ ] Company CRUD (Create, Read, Update, Delete)
- [ ] Contact CRUD
- [ ] Activity logging
- [ ] Task management (create, update, complete)
- [ ] Tag assignment
- [ ] Note creation
- [ ] Navigation between pages
- [ ] Mobile responsiveness (iPhone, iPad, Desktop)
- [ ] Dark mode (all pages)
- [ ] Error handling (404, 500)
- [ ] Loading states

**Acceptance Criteria:**
- [ ] Build passes with 0 errors
- [ ] All manual tests pass
- [ ] No console errors in browser
- [ ] Performance acceptable (<3s page loads)
- [ ] Documentation created

---

## Next Priority Tasks Analysis (Updated)

### UNI-183: Property Owner Portal
**Priority**: P2 (High)
**Status**: Todo
**Dependencies**: None (client portal system exists)
**Effort Estimate**: 6-8 hours
**Description**: Portal for property owners to view reports, sign forms, track progress
**Business Value**: High (client engagement, transparency)

**Why Next:**
- Extends existing portal infrastructure
- High client-facing value
- Lower complexity than directory
- No major technical dependencies

**Scope:**
- Property owner dashboard with report list
- Read-only report viewing
- Authority form signing (reuse existing component)
- Job progress tracking timeline
- Document downloads
- Notification preferences
- Mobile-optimized layout

---

### UNI-182: Contractor Directory & Verification
**Priority**: P2 (High)
**Status**: Todo
**Dependencies**: ContractorProfile model (exists)
**Effort Estimate**: 8-10 hours
**Description**: Public contractor directory with verification, reviews, search
**Business Value**: High (marketplace, trust)

**Why After Portal:**
- More complex (search, mapping, verification)
- Public-facing feature (needs polish)
- Requires integration work (maps, search)

**Scope:**
- Public directory page with search
- Contractor profile pages
- Verification badge system
- Review display and management
- Service area mapping (Google Maps)
- Advanced filters (location, rating, services)

---

### UNI-172: ERP — Inventory & Stock Management
**Priority**: P2 (High)
**Status**: Todo
**Effort Estimate**: 16-20 hours
**Recommendation**: ⚠️ **Defer to Phase 2+** (too large for immediate sprint)

---

### UNI-157: V2.0 — Multi-tenant SaaS
**Priority**: P2 (High)
**Status**: Todo
**Effort Estimate**: 40-60 hours
**Recommendation**: ⚠️ **Defer to Phase 2+** (major epic, requires planning)

---

## Recommended Roadmap (Next 2 Weeks)

### This Week: Complete UNI-171 Core CRM (6-8 hours)

**Day 1: UI Components (3-4 hours)**
- Build 7 core CRM components
- Integrate with APIs
- Test in isolation

**Day 2: Detail Pages (2-3 hours)**
- Company detail page with tabs
- Contact detail page with tabs
- Create/edit modals

**Day 3: Polish & Testing (1-2 hours)**
- Dashboard enhancement
- End-to-end testing
- Build verification
- Documentation

**Deliverable**: Fully functional CRM module ready for production

---

### Next Week: UNI-183 Property Owner Portal (6-8 hours)

**Day 1: Portal Structure (3-4 hours)**
- Property owner authentication
- Dashboard layout
- Report list and viewing

**Day 2: Features & Polish (2-3 hours)**
- Authority form integration
- Progress tracking
- Document downloads
- Testing and documentation

**Day 3: UNI-182 Start (1 hour)**
- Begin contractor directory planning
- Design mockups
- API planning

**Deliverable**: Property owners can access portal, view reports, sign forms

---

## Decision Matrix: What to Build Next?

| Task | Priority | Status | Effort | Dependencies | Business Value | Complexity | Recommendation |
|------|----------|--------|--------|--------------|----------------|------------|----------------|
| UNI-171 CRM | P2 | 40% Done | 6-8h | None | High | Medium | **START NOW** ✅ |
| UNI-183 Portal | P2 | Todo | 6-8h | None | High | Low | Next (Week 2) |
| UNI-182 Directory | P2 | Todo | 8-10h | Models exist | High | Medium | After Portal |
| UNI-172 ERP | P2 | Todo | 16-20h | None | Medium | Very High | Defer |
| UNI-157 Multi-tenant | P2 | Todo | 40-60h | All V1.x | Critical | Very High | Defer |

**Verdict**:
1. ✅ **Complete UNI-171 CRM** (6-8 hours) — In progress, needs UI completion
2. 🔄 **Start UNI-183 Property Owner Portal** (6-8 hours) — Next priority
3. 📋 **Start UNI-182 Contractor Directory** (8-10 hours) — After portal

---

## Success Metrics

**UNI-171 CRM Completion Criteria:**
- [ ] All 7 UI components built and functional
- [ ] Company detail page with 5 tabs working
- [ ] Contact detail page with 4 tabs working
- [ ] CRUD operations work end-to-end
- [ ] Activity logging and display functional
- [ ] Task management operational (create, update, complete)
- [ ] Tag assignment working
- [ ] Build passes with 0 errors
- [ ] Mobile responsive on all devices
- [ ] Dark mode fully supported
- [ ] No console errors or warnings

**Sprint Success Criteria:**
- [ ] UNI-171 moved to "Done" in Linear
- [ ] All acceptance criteria met
- [ ] Documentation created
- [ ] Git commits pushed
- [ ] No production errors
- [ ] Performance maintained

---

## Updated File Inventory

### Existing CRM Files (Total: 14 files)

**Schema:**
- `prisma/schema.prisma` — 7 CRM models

**API Routes (13 files):**
- `app/api/crm/activities/route.ts` ✅
- `app/api/crm/companies/route.ts` ✅
- `app/api/crm/companies/[id]/route.ts` ✅
- `app/api/crm/companies/[id]/activities/route.ts` ✅
- `app/api/crm/companies/[id]/contacts/route.ts` ✅
- `app/api/crm/contacts/route.ts` ✅
- `app/api/crm/contacts/[id]/route.ts` ✅
- `app/api/crm/contacts/[id]/activities/route.ts` ✅
- `app/api/crm/notes/route.ts` ✅
- `app/api/crm/tags/route.ts` ✅
- `app/api/crm/tags/assign/route.ts` ✅
- `app/api/crm/tasks/route.ts` ✅
- `app/api/crm/tasks/[id]/complete/route.ts` ✅

**Pages (10 files):**
- `app/dashboard/crm/page.tsx` ✅
- `app/dashboard/crm/loading.tsx` ✅
- `app/dashboard/crm/layout.tsx` ✅
- `app/dashboard/crm/companies/page.tsx` ✅
- `app/dashboard/crm/companies/loading.tsx` ✅
- `app/dashboard/crm/contacts/page.tsx` ✅
- `app/dashboard/crm/contacts/loading.tsx` ✅
- `app/dashboard/crm/activities/page.tsx` ✅
- `app/dashboard/crm/tasks/page.tsx` ✅
- `app/dashboard/crm/tasks/loading.tsx` ✅

**Components:**
- None yet (all 7 to be created)

---

## Next Action

**Immediate Next Step:**
✅ **Begin UNI-171 Core CRM Completion — Sub-Task 1: Build UI Components**

**First Component to Build:**
`components/crm/ActivityTimeline.tsx`

**Session Goals:**
1. Build all 7 CRM UI components (3-4 hours)
2. Create company and contact detail pages (2-3 hours)
3. Polish and test (1-2 hours)

**Estimated Total Time:** 6-8 hours

---

**Analysis Complete**
**Status**: Ready to complete UNI-171 CRM
**Updated**: 2026-01-28 post-UNI-173 completion
**Next Task**: Build CRM UI components starting with ActivityTimeline
