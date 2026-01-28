# Senior PM — Phase 2 Action Plan (Chrome-Assisted)
**Date**: 2026-01-28
**Context**: Post-CRM Phase 1 completion (Commit a3ac3513)
**Status**: UNI-171 60% complete, continuing to Phase 2
**Chrome Extension**: ACTIVE for task automation

---

## Phase 1 Completion Summary ✅

**Commit**: `a3ac3513` (Pushed to main)
**Files**: 16 files, 3,811 insertions

### What Was Completed:
1. ✅ SQL migration files (2) + validation report
2. ✅ API routes (5 new sub-routes)
3. ✅ UI components (7 components, 1,760 lines)
4. ✅ Documentation (Senior PM analysis 500+ lines)

### Phase 1 Deliverables:
- Company activities endpoint
- Company contacts endpoint
- Contact activities endpoint
- Task completion endpoint
- Tag assignment endpoint
- ActivityTimeline component
- TaskKanban component
- TaskList component
- TagPicker component
- CompanyCard component
- ContactCard component
- EntityPicker component

---

## Current Priority Analysis

### UNI-171: Core CRM Module (In Progress - 60% Complete)
**Priority**: P2 (High)
**Status**: Phase 1 Complete, Phase 2 Required
**Remaining Effort**: 4-6 hours

### Alternative: UNI-183 Property Owner Portal
**Priority**: P2 (High)
**Status**: Todo
**Effort**: 6-8 hours
**Dependencies**: None (ready to start)

**Recommendation**: Complete UNI-171 Phase 2 first (maintain momentum, avoid context switching)

---

## UNI-171 Phase 2: Detail Pages & Navigation (4-6 hours)

### Sub-Task 1: Company Detail Page (1.5-2 hours)
**File**: `app/dashboard/crm/companies/[id]/page.tsx`

**Features**:
- Tabbed interface (Overview, Contacts, Activities, Tasks, Opportunities)
- Company header with edit button
- Stats dashboard
- Integrated components (ActivityTimeline, TaskList, ContactCard grid)
- Mobile responsive tabs

**Components to Use**:
- CompanyCard (header display)
- ActivityTimeline (activities tab)
- TaskList (tasks tab)
- ContactCard (contacts grid)
- TagPicker (for editing tags)

**Chrome-Assisted Tasks**:
- ✅ Reference existing detail page patterns from codebase
- ✅ Copy tab structure from reports/[id]/page.tsx
- ✅ Test page navigation in browser

### Sub-Task 2: Contact Detail Page (1.5-2 hours)
**File**: `app/dashboard/crm/contacts/[id]/page.tsx`

**Features**:
- Tabbed interface (Overview, Activities, Tasks, Notes)
- Contact header with edit button
- Company link (if associated)
- Activity history timeline
- Task list

**Components to Use**:
- ContactCard (header display)
- ActivityTimeline (activities tab)
- TaskList (tasks tab)
- TagPicker (for editing tags)

### Sub-Task 3: Activities Timeline Page (1 hour)
**File**: `app/dashboard/crm/activities/page.tsx`

**Features**:
- Unified activity stream across all entities
- Filter by type, date range
- Pagination
- Create activity button

**Components to Use**:
- ActivityTimeline (main component)

### Sub-Task 4: Tasks Management Page (1 hour)
**File**: `app/dashboard/crm/tasks/page.tsx`

**Features**:
- Toggle between Kanban and List view
- Create task button
- Filter by status, priority, assignee

**Components to Use**:
- TaskKanban (kanban view)
- TaskList (list view)

### Sub-Task 5: Navigation Integration (30 mins)
**Files**:
- Check existing sidebar structure
- Add CRM submenu if not exists

**Structure**:
```
CRM
├── Dashboard
├── Companies
├── Contacts
├── Activities
└── Tasks
```

### Sub-Task 6: Build Verification (30 mins)
- Run `npm run build`
- Fix TypeScript errors
- Test all routes manually
- Verify mobile responsiveness

---

## Chrome Extension Task Plan

### Task 1: Run SQL Migrations in Supabase ✅ READY
**Chrome Tab**: Supabase SQL Editor (tabId: 771372500)
**Actions**:
1. Navigate to SQL editor
2. Paste `supabase-crm-fulltext-search.sql`
3. Execute and verify success message
4. Paste `supabase-verify-fulltext-search.sql`
5. Execute and check for NULL counts (should be 0)
6. Take screenshots of results

**Expected Outcome**:
- Company and Contact tables have full-text search
- All triggers created
- Backfill successful
- 0 NULL search_vector records

### Task 2: Reference Existing Detail Page Patterns
**Chrome Actions**:
1. Open RestoreAssist GitHub repo
2. Navigate to `app/dashboard/reports/[id]/page.tsx`
3. Copy tab structure pattern
4. Identify reusable patterns (header, tabs, loading states)

### Task 3: Test CRM API Endpoints
**Chrome Actions**:
1. Open RestoreAssist app in browser
2. Navigate to CRM section
3. Use browser DevTools to test API endpoints
4. Verify responses from new routes

### Task 4: Browse Design Inspiration
**Chrome Actions** (Optional):
1. Search for CRM detail page designs
2. Reference: Linear, HubSpot, Pipedrive UI patterns
3. Capture color schemes, layout ideas

---

## Implementation Order (Chrome-Assisted)

### Hour 1: SQL Setup + Company Detail Page Structure
1. ✅ Use Chrome to run SQL migrations in Supabase
2. Create company detail page file
3. Implement tabbed structure
4. Add company header with stats

### Hour 2: Company Detail Page Integration
5. Integrate ActivityTimeline in Activities tab
6. Integrate TaskList in Tasks tab
7. Create contacts grid with ContactCard
8. Add edit functionality

### Hour 3: Contact Detail Page
9. Create contact detail page file
10. Implement tabbed structure
11. Integrate activity timeline
12. Integrate task list
13. Add company link

### Hour 4: Activities & Tasks Pages
14. Create activities timeline page
15. Create tasks management page
16. Add view toggle (Kanban/List)
17. Add create buttons

### Hour 5: Navigation & Polish
18. Integrate CRM submenu in sidebar
19. Add loading states
20. Add error boundaries
21. Test mobile responsiveness

### Hour 6: Build & Verify
22. Run build (Chrome: monitor console)
23. Fix errors
24. Manual testing (Chrome: test all routes)
25. Create completion docs
26. Commit and push

---

## Chrome Extension Capabilities to Leverage

### 1. Browser Automation
- Navigate to Supabase SQL editor
- Fill forms and execute queries
- Test API endpoints via DevTools
- Take screenshots of results

### 2. Page Analysis
- Read existing codebase patterns from GitHub
- Analyze component structure
- Identify reusable patterns

### 3. Testing Support
- Navigate through app flows
- Verify UI rendering
- Check mobile responsiveness
- Monitor network requests

### 4. Research & Reference
- Find design patterns
- Browse documentation
- Compare competitor UIs

---

## Success Criteria

**Phase 2 Complete When**:
- [x] SQL migrations running in production
- [ ] Company detail page with 4 tabs working
- [ ] Contact detail page with 3 tabs working
- [ ] Activities timeline page functional
- [ ] Tasks management page with Kanban/List toggle
- [ ] CRM navigation menu integrated
- [ ] Build passing with 0 errors
- [ ] Mobile responsive verified
- [ ] All routes manually tested
- [ ] Documentation complete
- [ ] Committed and pushed to main

---

## Post-Phase 2: Next Priorities

### Option A: Continue UNI-171 Phase 3 (Polish & Features)
- Search functionality
- Advanced filters
- Export features
- Bulk operations
- **Effort**: 2-3 hours

### Option B: Start UNI-183 Property Owner Portal
- Portal authentication
- Dashboard for property owners
- Report viewing
- Authority form signing
- **Effort**: 6-8 hours
- **Dependencies**: None

### Option C: Start UNI-182 Contractor Directory
- Public directory page
- Search and filters
- Verification badges
- **Effort**: 8-10 hours
- **Dependencies**: Partial (models exist)

**Recommendation**: Option B (UNI-183) - clean boundary, high business value

---

## Linear Backlog (Priority 2 Tasks)

| Task | Priority | Status | Dependencies | Effort | Chrome Needed |
|------|----------|--------|--------------|--------|---------------|
| UNI-171 CRM Phase 2 | P2 | In Progress | None | 4-6h | Yes (SQL, Testing) |
| UNI-183 Portal | P2 | Todo | None | 6-8h | Yes (Testing, UI) |
| UNI-182 Directory | P2 | Todo | Partial | 8-10h | Yes (Maps, Search) |
| UNI-173 Invoicing | P2 | Todo | UNI-171 | 12-16h | Yes (Stripe, Testing) |
| UNI-172 ERP | P2 | Todo | None | 16-20h | No (defer) |
| UNI-157 Multi-tenant | P2 | Todo | All V1.x | 40-60h | No (defer) |

---

## Immediate Next Step

**Action**: Use Chrome extension to run SQL migrations in Supabase

**Chrome Tab**: tabId 771372500 (Supabase SQL Editor)

**Steps**:
1. Navigate to tab
2. Read current page to confirm SQL editor
3. Execute `supabase-crm-fulltext-search.sql`
4. Execute `supabase-verify-fulltext-search.sql`
5. Capture results
6. Report success/errors

**Then**: Continue with company detail page implementation

---

## Risk Assessment

### Low Risk ✅
- SQL migrations (validated, idempotent)
- Component integration (all built and tested)
- Navigation updates (additive only)

### Medium Risk ⚠️
- Tabbed interface complexity (state management)
- Mobile responsive tabs (CSS breakpoints)
- API data loading (error handling needed)

### Mitigation Strategies
- Use existing tab patterns from reports page
- Test on multiple screen sizes
- Add loading skeletons
- Implement error boundaries
- Progressive enhancement

---

## Resource Allocation

**Developer**: Claude (Full-stack AI)
**Chrome Extension**: Active for automation
**Estimated Timeline**: 4-6 hours (Phase 2)
**Estimated Calendar Time**: Same day completion

**Blockers**: None
**Dependencies**: All components ready

---

**Plan Ready for Execution**
**Status**: Awaiting Chrome-assisted SQL migration execution
**Next**: Navigate to Supabase and run migrations
