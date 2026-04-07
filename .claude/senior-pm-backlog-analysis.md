# Senior Project Manager — Backlog Analysis & Prioritization

**Date**: 2026-01-28 (Post UNI-171 Completion)
**Analyst**: Claude (Senior PM Mode)
**Context**: Post-UNI-171 Core CRM Module Completion
**Status**: Analyzing Linear backlog for next priority

---

## Executive Summary

**Current State:**

- ✅ UNI-171 Core CRM Module: **COMPLETE** (Commit 96694a28)
- ✅ UNI-173 Invoicing Module: **COMPLETE** (Commits 6ceca473, bef20471)
- ✅ V1.4 Authority Forms UX: **COMPLETE**
- 📋 4 Priority 2 (High) tasks remaining in backlog

**Latest Completion:**

- **UNI-171 Core CRM Module** — Just completed (2026-01-28):
  - ✅ 7 CRM models in database (Company, Contact, Activity, CrmTask, CrmNote, Tag, Opportunity)
  - ✅ 13 API endpoints operational
  - ✅ 7 UI components (ActivityTimeline, TaskKanban, TaskList, TagPicker, CompanyCard, ContactCard, EntityPicker)
  - ✅ 7 pages (dashboard, company/contact list, company/contact detail, activities, tasks)
  - ✅ Form modals for create/edit
  - ✅ Full CRUD operations functional
  - ✅ Build verification: 0 errors

**Recommendation:**
Start **UNI-183 Property Owner Portal** → High business value, extends existing portal infrastructure, 6-8 hour effort.

---

## Priority Analysis — Updated

### Priority 1 (Urgent) — Status: ✅ ALL COMPLETE

- 20/20 tasks completed
- Latest: UNI-185 (V1.5 Production Hardening)

### Priority 2 (High) — Status: 🔄 IN PROGRESS

**Recently Completed:**

- ✅ **UNI-171: Core CRM Module** (Just completed 2026-01-28)
  - Full contact and company management
  - Activity tracking with timeline
  - Task management with Kanban board
  - Tag system for categorization
  - 7 UI components built
  - 7 pages operational
  - 13 API endpoints
  - Build verification passed
- ✅ **UNI-173: Invoicing & Financial Module** (Completed 2026-01-28)
  - Accounting sync to Xero, QuickBooks, MYOB
  - Invoice templates with 40+ customization fields
  - Invoice variations (change orders)
- ✅ UNI-187: Migrate password reset to database
- ✅ UNI-186: Remove debug console.log
- ✅ UNI-181: Service Pages (27 sub-services)
- ✅ UNI-179: ABN/TFN Verification
- ✅ UNI-178: STP Phase 2 Compliance
- ✅ UNI-155: V1.4 Authority Forms UX
- ✅ UNI-154: V1.3 Claims Management
- ✅ UNI-153: V1.2 Interview Module
- ✅ UNI-152: V1.1 NIR Inspection

**Todo - Remaining Priority 2 (4):**

1. **🔄 UNI-183: Property Owner Portal** ← **RECOMMENDED NEXT**
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

## UNI-171: Core CRM Module — Completion Summary ✅

### Final Status: 100% COMPLETE

**What Was Delivered:**

**1. Database Schema (100% Complete):**

- ✅ Company model with lifecycle stages, relationship scoring
- ✅ Contact model with company relationships, primary contact flag
- ✅ Activity model for interaction tracking (calls, emails, meetings, site visits)
- ✅ CrmTask model with assignees, priorities, due dates
- ✅ CrmNote model for notes
- ✅ Tag model with color-coding and many-to-many relationships
- ✅ Opportunity model for sales pipeline tracking
- ✅ 9 enums (CompanySize, CompanyStatus, ContactStatus, ActivityType, TaskPriority, etc.)

**2. API Routes (13 endpoints — 100% Complete):**

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

**3. UI Components (7 — 100% Complete):**

- ✅ **ActivityTimeline** — Timeline with expandable details, date/type filtering
- ✅ **TaskKanban** — 4-column board (TODO, IN_PROGRESS, WAITING, COMPLETED) with drag-drop
- ✅ **TaskList** — List view with priority badges, assignee avatars, inline actions
- ✅ **TagPicker** — Multi-select with color picker, create-on-fly, search
- ✅ **CompanyCard** — Display card with stats, tags, lifecycle badges
- ✅ **ContactCard** — Contact card with company link, primary indicator
- ✅ **EntityPicker** — Universal selector with search, type guards

**4. Pages (7 — 100% Complete):**

- ✅ `/dashboard/crm` — Dashboard with stats, recent activities, upcoming tasks
- ✅ `/dashboard/crm/companies` — Company list with search, filters
- ✅ `/dashboard/crm/companies/[id]` — Company detail with tabs (overview, contacts, activities, tasks)
- ✅ `/dashboard/crm/contacts` — Contact list with search, filters
- ✅ `/dashboard/crm/contacts/[id]` — Contact detail with tabs (overview, activities, tasks)
- ✅ `/dashboard/crm/activities` — Activity timeline page
- ✅ `/dashboard/crm/tasks` — Task management page

**5. Additional Features:**

- ✅ Create/edit modals (CompanyFormModal, ContactFormModal)
- ✅ Full CRUD operations for companies, contacts, activities, tasks
- ✅ Tag assignment and management
- ✅ Note creation and display
- ✅ Dark mode support across all pages
- ✅ Mobile responsive design
- ✅ Loading states and error handling

**Build Verification:**

- ✅ Production build successful (0 errors)
- ✅ All routes compile correctly
- ✅ TypeScript type checking passed

**Git Commits:**

- 96694a28: feat(UNI-171): Complete Core CRM Module UI Components

---

## Next Priority: UNI-183 Property Owner Portal

### Why This Task Is Next Priority

**Decision Factors:**

1. **Business Value**: High — Direct client engagement, transparency, self-service
2. **Complexity**: Low-Medium — Extends existing portal infrastructure
3. **Dependencies**: None — Portal authentication system exists, can reuse components
4. **Effort**: 6-8 hours — Manageable sprint scope
5. **Risk**: Low — Well-defined scope, proven patterns

**Comparison with Other P2 Tasks:**

| Task                 | Effort | Complexity | Dependencies | Business Value | Risk      | Score       |
| -------------------- | ------ | ---------- | ------------ | -------------- | --------- | ----------- |
| **UNI-183 Portal**   | 6-8h   | Low-Med    | None         | High           | Low       | **9/10** ✅ |
| UNI-182 Directory    | 8-10h  | Medium     | Models exist | High           | Medium    | 7/10        |
| UNI-172 ERP          | 16-20h | Very High  | None         | Medium         | High      | 4/10        |
| UNI-157 Multi-tenant | 40-60h | Very High  | All V1.x     | Critical       | Very High | 3/10        |

**Verdict**: UNI-183 Property Owner Portal is the clear next priority.

---

## UNI-183: Property Owner Portal — Implementation Plan

### Overview

**Objective**: Enable property owners to access portal, view reports, sign authority forms, track job progress

**Current State:**

- ✅ Portal authentication system exists (`/portal/login`, `/portal/signup`)
- ✅ ClientUser model exists with authentication
- ✅ Authority form signing component exists
- ✅ Report model has portal-related fields
- ⚠️ Portal functionality is minimal (only signup/basic report viewing)

**Target State:**

- Property owners can log in with email/password
- Dashboard shows all their reports with status
- Can view full report details
- Can sign authority forms digitally
- Can track job progress with timeline
- Can download documents
- Mobile-optimized for on-site access

### Architecture

**Existing Infrastructure to Leverage:**

1. `ClientUser` model with authentication
2. `/portal/*` routes already configured
3. Authority form signing system (reuse from contractor)
4. Report viewing components
5. PDF generation system

**New Components Needed:**

1. Portal dashboard with report cards
2. Report detail page (portal version)
3. Progress tracking timeline
4. Document download section
5. Notification preferences page

### Implementation Phases

#### Phase 1: Portal Dashboard (3 hours)

**Priority**: P0 (Critical path)

**Files to Create/Modify:**

1. **`app/portal/dashboard/page.tsx`** (300 lines)
   - Portal dashboard layout
   - Report cards grid
   - Status badges (Draft, In Progress, Completed)
   - Quick actions (View Report, Sign Forms)
   - Stats summary (Total Jobs, Pending Forms, Documents)
   - Mobile responsive

2. **`components/portal/ReportCard.tsx`** (150 lines)
   - Report summary card
   - Property address
   - Job status badge
   - Date created
   - Quick actions (View, Download)
   - Progress indicator

3. **`components/portal/PortalStats.tsx`** (100 lines)
   - Stats widget
   - Total reports count
   - Pending authority forms count
   - Completed jobs count
   - Icons and colors

**API Endpoints Needed:**

- ✅ GET `/api/portal/reports` — Already exists
- ❌ GET `/api/portal/stats` — Create new endpoint for dashboard stats

**Acceptance Criteria:**

- [ ] Portal dashboard loads with all reports
- [ ] Report cards display correctly
- [ ] Status badges show correct colors
- [ ] Quick actions navigate correctly
- [ ] Stats widget shows accurate counts
- [ ] Mobile responsive
- [ ] Dark mode supported

#### Phase 2: Enhanced Report Viewing (2 hours)

**Priority**: P0 (Critical path)

**Files to Modify:**

1. **`app/portal/reports/[id]/page.tsx`** (modify existing — add 200 lines)
   - Add tabs: Overview, Authority Forms, Progress, Documents
   - Overview tab: report summary, scope of works
   - Authority Forms tab: list of forms with sign buttons
   - Progress tab: timeline of job milestones
   - Documents tab: downloadable PDFs

2. **`components/portal/ProgressTimeline.tsx`** (200 lines)
   - Timeline component
   - Milestones: Report Created → Forms Signed → Work Started → Inspection → Completed
   - Status indicators (completed, current, upcoming)
   - Date stamps
   - Icons per milestone

3. **`components/portal/DocumentList.tsx`** (100 lines)
   - List of downloadable documents
   - Document type icons (PDF, Excel, Images)
   - Download buttons
   - File size display
   - Generated date

**API Endpoints Needed:**

- ✅ GET `/api/portal/reports/[id]` — Already exists
- ✅ GET `/api/portal/reports/[id]/approvals` — Already exists
- ❌ GET `/api/portal/reports/[id]/documents` — Create new endpoint

**Acceptance Criteria:**

- [ ] Report detail tabs work correctly
- [ ] Progress timeline displays milestones
- [ ] Authority forms show correct status
- [ ] Documents are downloadable
- [ ] Mobile responsive
- [ ] Loading states show during fetch

#### Phase 3: Settings & Notifications (1 hour)

**Priority**: P1 (Important)

**Files to Create:**

1. **`app/portal/settings/page.tsx`** (200 lines)
   - Notification preferences
   - Email notifications toggle
   - SMS notifications toggle (future)
   - Password change form
   - Contact information update

2. **`components/portal/NotificationSettings.tsx`** (150 lines)
   - Toggle switches
   - Email notification types (Job updates, Forms ready, Completion)
   - Save settings button
   - Success toast

**API Endpoints Needed:**

- ❌ GET `/api/portal/settings` — Create new endpoint
- ❌ PUT `/api/portal/settings` — Create new endpoint

**Acceptance Criteria:**

- [ ] Settings page loads
- [ ] Notification toggles work
- [ ] Password change works
- [ ] Settings save successfully
- [ ] Toast notifications show

#### Phase 4: Polish & Testing (1-2 hours)

**Priority**: P1 (Important)

**Tasks:**

1. Mobile responsiveness testing
2. Dark mode verification
3. Error state handling
4. Loading states
5. Empty states (no reports yet)
6. Build verification
7. End-to-end testing
8. Documentation

**Acceptance Criteria:**

- [ ] Mobile responsive on all pages
- [ ] Dark mode fully supported
- [ ] Error messages user-friendly
- [ ] Build passes with 0 errors
- [ ] All links work
- [ ] No console errors

---

## Task Breakdown: UNI-183 Property Owner Portal

### Sub-Task 1: Portal Dashboard (P0)

**Effort**: 3 hours
**Files**: 4 new/modified
**Priority**: Critical path

**Deliverables:**

- Portal dashboard page
- Report cards component
- Stats widget
- GET /api/portal/stats endpoint

### Sub-Task 2: Enhanced Report Viewing (P0)

**Effort**: 2 hours
**Files**: 4 new/modified
**Priority**: Critical path

**Deliverables:**

- Tabbed report detail page
- Progress timeline component
- Document list component
- GET /api/portal/reports/[id]/documents endpoint

### Sub-Task 3: Settings & Notifications (P1)

**Effort**: 1 hour
**Files**: 3 new
**Priority**: Important

**Deliverables:**

- Settings page
- Notification preferences
- Settings API endpoints

### Sub-Task 4: Polish & Testing (P1)

**Effort**: 1-2 hours
**Priority**: Important

**Deliverables:**

- Mobile responsive design
- End-to-end testing
- Build verification
- Documentation

**Total Effort**: 6-8 hours

---

## File Summary: UNI-183 Property Owner Portal

### New Files to Create (8):

1. `app/portal/dashboard/page.tsx` (300 lines)
2. `app/portal/settings/page.tsx` (200 lines)
3. `components/portal/ReportCard.tsx` (150 lines)
4. `components/portal/PortalStats.tsx` (100 lines)
5. `components/portal/ProgressTimeline.tsx` (200 lines)
6. `components/portal/DocumentList.tsx` (100 lines)
7. `components/portal/NotificationSettings.tsx` (150 lines)
8. `app/api/portal/stats/route.ts` (100 lines)
9. `app/api/portal/reports/[id]/documents/route.ts` (100 lines)
10. `app/api/portal/settings/route.ts` (100 lines)

### Files to Modify (2):

1. `app/portal/reports/[id]/page.tsx` — Add tabs (+200 lines)
2. `app/portal/layout.tsx` — Add navigation menu (+50 lines)

**Total New Lines**: ~1,650 lines
**Total Modified Lines**: ~250 lines

---

## Success Metrics

### UNI-183 Completion Criteria:

- [ ] Portal dashboard displays all reports
- [ ] Report detail page has 4 tabs
- [ ] Progress timeline shows job milestones
- [ ] Authority form signing works
- [ ] Documents are downloadable
- [ ] Settings page functional
- [ ] Notification preferences save
- [ ] Build passes with 0 errors
- [ ] Mobile responsive on all pages
- [ ] Dark mode fully supported
- [ ] No console errors or warnings

### Sprint Success Criteria:

- [ ] UNI-183 moved to "Done" in Linear
- [ ] All acceptance criteria met
- [ ] Documentation created
- [ ] Git commits pushed
- [ ] No production errors
- [ ] Property owners can access portal successfully

---

## Recommended Roadmap (Next 2 Weeks)

### This Week: UNI-183 Property Owner Portal (6-8 hours)

**Day 1: Portal Dashboard (3 hours)**

- Portal dashboard page with report cards
- Stats widgets
- API endpoint for stats
- Mobile responsive layout

**Day 2: Report Viewing Enhancement (2 hours)**

- Add tabs to report detail page
- Progress timeline component
- Document list and downloads
- API endpoint for documents

**Day 3: Settings & Polish (2 hours)**

- Settings page with notification preferences
- End-to-end testing
- Mobile responsiveness verification
- Build verification
- Documentation

**Deliverable**: Property owners can access portal, view reports, sign forms, track progress

---

### Next Week: UNI-182 Contractor Directory (8-10 hours)

**Day 1-2: Directory Structure (5 hours)**

- Public contractor directory page
- Search and filtering
- Contractor profile pages
- Verification badge system

**Day 3: Features & Polish (3-5 hours)**

- Review display and management
- Service area mapping (Google Maps)
- Advanced filters
- Testing and documentation

**Deliverable**: Public contractor directory with search, profiles, reviews, verification

---

## Decision Matrix: What to Build Next?

| Task                 | Priority | Status | Effort | Dependencies | Business Value | Complexity | Recommendation   |
| -------------------- | -------- | ------ | ------ | ------------ | -------------- | ---------- | ---------------- |
| UNI-183 Portal       | P2       | Todo   | 6-8h   | None         | High           | Low-Med    | **START NOW** ✅ |
| UNI-182 Directory    | P2       | Todo   | 8-10h  | Models exist | High           | Medium     | Next (Week 2)    |
| UNI-172 ERP          | P2       | Todo   | 16-20h | None         | Medium         | Very High  | Defer to Phase 2 |
| UNI-157 Multi-tenant | P2       | Todo   | 40-60h | All V1.x     | Critical       | Very High  | Defer to Phase 2 |

**Verdict**:

1. ✅ **Start UNI-183 Property Owner Portal** (6-8 hours) — Highest value, lowest risk
2. 🔄 **Follow with UNI-182 Contractor Directory** (8-10 hours) — After portal
3. 📋 **Defer UNI-172 ERP and UNI-157 Multi-tenant** — Too large for immediate sprint

---

## Next Action

**Immediate Next Step:**
✅ **Begin UNI-183 Property Owner Portal — Sub-Task 1: Portal Dashboard**

**First Component to Build:**
`app/portal/dashboard/page.tsx`

**Session Goals:**

1. Build portal dashboard with report cards (3 hours)
2. Enhance report viewing with tabs and timeline (2 hours)
3. Add settings page and polish (2 hours)

**Estimated Total Time:** 6-8 hours

---

**Analysis Complete**
**Status**: Ready to start UNI-183 Property Owner Portal
**Updated**: 2026-01-28 post-UNI-171 completion
**Next Task**: Build portal dashboard with report cards
**Commit**: 96694a28 (UNI-171 Complete)
