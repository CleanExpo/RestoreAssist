# RestoreAssist Product Roadmap

**Insurance Restoration Management Platform for Australian Contractors**
**Production**: restoreassist.app
**Last Updated**: 2026-01-26
**PM**: Claude (AI Project Manager via Linear)

---

## Current State Assessment

| Area | Completion | Status |
|------|-----------|--------|
| Auth & Team Management | 95% | COMPLETE |
| Report Creation & Export | 85% | MOSTLY COMPLETE |
| Client Management | 90% | COMPLETE |
| Estimation System | 85% | MOSTLY COMPLETE |
| NIR Inspection | 80% | API complete, NO UI |
| Interview System | 80% | Backend complete, minimal UI |
| Authority Forms | 85% | Working, UX needs polish |
| Claims Analysis | 60% | Functional, UI incomplete |
| Email System | 75% | Transactional only |
| Billing & Stripe | 80% | Core working |
| Third-party Integrations | 30% | Schema only |
| Dashboard & UI | 85% | Functional |
| Search | 80% | Working |
| Property Lookup | 10% | Schema only |
| LiDAR/3D Scanning | 5% | Schema only |
| Voice Notes | 5% | Schema only |

**Overall MVP Readiness: ~78%**

---

## V1 — MVP Launch (Remaining Work)

> **Goal**: Ship a production-ready platform that Australian restoration contractors can use daily for damage assessment reports, client management, and billing.

### V1.1 — NIR Data Entry UI (Priority: URGENT)
The National Inspection Report APIs are complete but have NO frontend UI. This is a core product feature.

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Build moisture readings entry form (multi-point, surface type, location) | P0 | Medium |
| 2 | Build environmental data form (temp, humidity, dew point) | P0 | Small |
| 3 | Build affected areas form (room picker, materials, area calc) | P0 | Medium |
| 4 | Build classification UI (water category 1-3, class 1-4 selector) | P0 | Small |
| 5 | Build scope items entry (restoration items, equipment, duration) | P0 | Medium |
| 6 | Wire NIR photo upload to inspection areas | P0 | Medium |
| 7 | Build NIR summary/review page before PDF generation | P0 | Medium |
| 8 | Add visual moisture mapping (floor plan overlay) | P1 | Large |

### V1.2 — Interview System UI (Priority: HIGH)
Backend interview engine works, but the guided interview UX is missing.

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Build interview start screen (job type, postcode, experience level) | P0 | Small |
| 2 | Build step-by-step question flow UI (one question at a time) | P0 | Medium |
| 3 | Build answer input components (yes/no, multiple choice, text, numeric, measurement) | P0 | Medium |
| 4 | Display standards references inline during interview | P1 | Small |
| 5 | Build interview summary/results page | P0 | Medium |
| 6 | Wire field auto-population from interview answers to report fields | P1 | Large |
| 7 | Add interview progress persistence (resume incomplete interviews) | P1 | Medium |
| 8 | Add tier gating UI (show locked questions, upgrade prompts) | P1 | Small |

### V1.3 — Claims Analysis UI Polish (Priority: HIGH)

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Redesign claims analysis results page (missing elements, severity badges) | P0 | Medium |
| 2 | Add Google Drive folder browser/picker UI | P0 | Medium |
| 3 | Build missing elements detail view with IICRC/NCC references | P1 | Medium |
| 4 | Add batch progress indicator (processing status per document) | P0 | Small |
| 5 | Add export analysis results to PDF/CSV | P1 | Medium |

### V1.4 — Authority Forms UX (Priority: MEDIUM)

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Build signature canvas component (touch/mouse drawing) | P0 | Medium |
| 2 | Build form preview before signing | P0 | Small |
| 3 | Add multi-signatory flow (client → insurer → contractor) | P1 | Medium |
| 4 | Add signed form PDF download | P0 | Small |
| 5 | Add email signed PDF to all parties | P1 | Medium |

### V1.5 — Production Hardening (Priority: CRITICAL)

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Add error boundary components to all pages | P0 | Medium |
| 2 | Add loading skeleton states to all data-fetching pages | P0 | Medium |
| 3 | Audit & fix mobile responsiveness across all pages | P0 | Large |
| 4 | Add rate limiting to all public API routes | P0 | Medium |
| 5 | Add input sanitization for all user-facing forms | P0 | Medium |
| 6 | Add CSRF protection | P0 | Small |
| 7 | Set up error monitoring (Sentry or equivalent) | P0 | Small |
| 8 | Set up uptime monitoring | P1 | Small |
| 9 | Add database connection pooling (PgBouncer or Supabase pooler) | P1 | Small |
| 10 | Performance audit — largest contentful paint, bundle size | P1 | Medium |
| 11 | Add automated backups verification | P1 | Small |
| 12 | SEO meta tags for marketing pages | P1 | Small |

### V1.6 — Billing Polish (Priority: MEDIUM)

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Add invoice PDF generation | P1 | Medium |
| 2 | Add usage metering display (reports used / limit) | P0 | Small |
| 3 | Add subscription management page (change plan, payment method) | P0 | Medium |
| 4 | Add failed payment handling / dunning emails | P1 | Medium |
| 5 | Add trial period handling (14-day free trial) | P1 | Small |
| 6 | Test and validate Stripe webhook reliability | P0 | Small |

### V1.7 — Dashboard Analytics (Priority: LOW)

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Add report completion metrics (avg time to complete, completion rate) | P1 | Medium |
| 2 | Add monthly report volume chart | P1 | Small |
| 3 | Add revenue/billing overview for admin users | P2 | Medium |
| 4 | Add team activity feed | P2 | Medium |

---

## V2 — Integration & Automation

> **Goal**: Connect RestoreAssist to the tools Australian contractors already use. Reduce manual data entry and enable two-way sync with accounting and job management systems.

### V2.1 — Xero Accounting Integration

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Implement Xero OAuth 2.0 connection flow | P0 | Large |
| 2 | Sync clients → Xero contacts (bidirectional) | P0 | Large |
| 3 | Push estimates → Xero invoices | P0 | Large |
| 4 | Pull payment status from Xero | P1 | Medium |
| 5 | Add Xero connection status dashboard widget | P1 | Small |
| 6 | Add sync conflict resolution UI | P2 | Medium |

### V2.2 — MYOB Integration

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | MYOB API OAuth connection | P0 | Large |
| 2 | Client sync (bidirectional) | P0 | Large |
| 3 | Invoice push from estimates | P0 | Large |
| 4 | Payment status sync | P1 | Medium |

### V2.3 — QuickBooks Integration

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | QuickBooks OAuth connection | P0 | Large |
| 2 | Client/contact sync | P0 | Large |
| 3 | Invoice sync from estimates | P0 | Large |
| 4 | Expense tracking sync | P2 | Large |

### V2.4 — ServiceM8 / Ascora Job Management

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | ServiceM8 API connection | P1 | Large |
| 2 | Import jobs from ServiceM8 → reports | P1 | Large |
| 3 | Push report status updates back to ServiceM8 | P1 | Medium |
| 4 | Ascora API connection | P2 | Large |
| 5 | Import Ascora jobs | P2 | Large |

### V2.5 — Email Automation

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Gmail OAuth integration (read/send from user's account) | P1 | Large |
| 2 | Microsoft Outlook OAuth integration | P2 | Large |
| 3 | Email templates builder (drag & drop) | P1 | Large |
| 4 | Scheduled email campaigns (report reminders, follow-ups) | P1 | Medium |
| 5 | Email open/click tracking | P2 | Medium |
| 6 | Auto-send authority forms to clients for signature | P1 | Medium |

### V2.6 — Notification System

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | In-app notification center | P1 | Medium |
| 2 | Push notifications (web) | P2 | Medium |
| 3 | Email digest (daily/weekly summary) | P2 | Medium |
| 4 | Notification preferences (per-channel, per-event) | P2 | Small |

---

## V3 — Advanced Technology

> **Goal**: Differentiate RestoreAssist with cutting-edge field tools. LiDAR 3D scanning, voice-first data capture, and property intelligence give contractors superpowers on-site.

### V3.1 — LiDAR 3D Scanning

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Build LiDAR capture integration (iPhone/iPad LiDAR API) | P0 | XL |
| 2 | Point cloud upload and storage (DigitalOcean Spaces / S3) | P0 | Large |
| 3 | 3D viewer component (Three.js / WebGL) | P0 | XL |
| 4 | Auto-generate 2D floor plan from point cloud | P1 | XL |
| 5 | Overlay moisture readings on 3D model | P1 | Large |
| 6 | Room detection and measurement from scan | P2 | XL |
| 7 | Export 3D model for insurance documentation | P2 | Large |

### V3.2 — Voice Notes & AI Transcription

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Voice recording UI (field-optimized, one-tap record) | P0 | Medium |
| 2 | Deepgram/Whisper transcription pipeline | P0 | Large |
| 3 | AI extraction: pull structured data from transcript | P0 | Large |
| 4 | Auto-populate report fields from voice notes | P1 | Large |
| 5 | Voice note playback with transcript sync | P1 | Medium |
| 6 | Multi-language transcription (for non-English contractors) | P2 | Medium |

### V3.3 — Property Intelligence

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | CoreLogic API integration (property data, valuation) | P0 | Large |
| 2 | Domain.com.au property lookup fallback | P1 | Medium |
| 3 | Auto-fill property details from address | P0 | Medium |
| 4 | Property history (previous claims, building age, materials) | P1 | Large |
| 5 | Local building code auto-detection by postcode/state | P1 | Medium |
| 6 | Property data caching (90-day TTL) | P0 | Small |

### V3.4 — AI Report Enhancement

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Photo AI analysis (damage classification from images) | P0 | XL |
| 2 | Auto-suggest affected materials from photos | P1 | Large |
| 3 | AI-generated executive summary from report data | P1 | Medium |
| 4 | Regulatory compliance checker (auto-flag missing requirements) | P1 | Large |
| 5 | Smart cost estimation from damage photos | P2 | XL |

---

## V4 — Scale & Enterprise

> **Goal**: Support large restoration companies with multiple offices, complex team hierarchies, and enterprise-grade compliance. Win contracts from major insurers by meeting their reporting standards.

### V4.1 — Multi-Office & Org Hierarchy

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Multi-office support (separate locations under one org) | P0 | XL |
| 2 | Office-level permissions and reporting | P0 | Large |
| 3 | Cross-office report sharing and transfer | P1 | Large |
| 4 | Org-wide analytics dashboard | P1 | Large |
| 5 | Custom role creation (beyond Admin/Manager/User) | P2 | Medium |

### V4.2 — Insurer Portal

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Read-only insurer view of reports | P0 | Large |
| 2 | Insurer approval workflow (approve/reject/request changes) | P0 | Large |
| 3 | Automated report submission to insurer | P1 | Large |
| 4 | Insurer-specific report templates | P1 | Medium |
| 5 | SLA tracking (response time commitments) | P2 | Medium |

### V4.3 — Advanced Compliance

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Full IICRC S500 compliance audit trail | P0 | Large |
| 2 | AS/NZS 3999 asbestos awareness integration | P1 | Medium |
| 3 | WHS (Work Health & Safety) checklist system | P1 | Large |
| 4 | Automated compliance report generation | P1 | Large |
| 5 | Compliance score per report | P2 | Medium |
| 6 | Training record management (certifications, expiry) | P2 | Large |

### V4.4 — Enterprise Billing

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Volume pricing / enterprise plans | P0 | Medium |
| 2 | Annual contracts with custom terms | P1 | Medium |
| 3 | Per-seat licensing | P1 | Medium |
| 4 | White-label option for large franchises | P2 | XL |
| 5 | API access for enterprise customers | P1 | Large |

### V4.5 — Mobile App (React Native)

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | React Native app shell with auth | P0 | XL |
| 2 | Offline report creation (sync when online) | P0 | XL |
| 3 | Camera integration (photo capture → report) | P0 | Large |
| 4 | GPS auto-tagging for photos and readings | P1 | Medium |
| 5 | Push notifications (job assignments, approvals) | P1 | Medium |
| 6 | LiDAR capture from iOS app | P2 | XL |
| 7 | Voice note recording in field | P1 | Medium |

---

## V5 — Platform & Marketplace

> **Goal**: Transform RestoreAssist from a tool into a platform. Enable third-party integrations, create a marketplace for templates and cost libraries, and build network effects between contractors, insurers, and suppliers.

### V5.1 — Marketplace

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Template marketplace (buy/sell report templates) | P0 | XL |
| 2 | Cost library marketplace (industry-specific pricing) | P0 | XL |
| 3 | Seller onboarding and payout system (Stripe Connect) | P0 | XL |
| 4 | Template ratings and reviews | P1 | Medium |
| 5 | Featured/promoted templates | P2 | Medium |

### V5.2 — API Platform

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Public REST API with OAuth2 for third parties | P0 | XL |
| 2 | API documentation portal | P0 | Large |
| 3 | Webhook system (events for report creation, status changes) | P0 | Large |
| 4 | Rate limiting and API key management | P0 | Medium |
| 5 | Developer portal with sandbox environment | P1 | XL |

### V5.3 — Contractor Network

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Contractor directory (public profiles) | P1 | Large |
| 2 | Insurer → contractor referral system | P1 | XL |
| 3 | Job board (insurers post jobs, contractors bid) | P2 | XL |
| 4 | Contractor ratings from insurers | P2 | Large |
| 5 | Subcontractor management (assign specialized work) | P2 | Large |

### V5.4 — AI Copilot

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Full conversational AI assistant for report creation | P0 | XL |
| 2 | AI-driven cost estimation from photos + description | P0 | XL |
| 3 | Predictive analytics (claim outcome prediction) | P1 | XL |
| 4 | Automated scope of works from damage description | P1 | Large |
| 5 | Natural language search across all data | P1 | Large |
| 6 | AI training on user's historical reports | P2 | XL |

### V5.5 — Data & Analytics Platform

| # | Task | Priority | Complexity |
|---|------|----------|------------|
| 1 | Industry benchmarking (avg costs by region, damage type) | P1 | XL |
| 2 | Claim trend analysis dashboard | P1 | Large |
| 3 | Regional damage frequency mapping | P2 | Large |
| 4 | Insurance industry reports (aggregated, anonymized) | P2 | XL |
| 5 | Custom report builder (SQL-like queries on data) | P2 | XL |

---

## Version Summary

| Version | Theme | Focus Areas | Dependencies |
|---------|-------|-------------|--------------|
| **V1** | MVP Launch | NIR UI, Interview UI, Claims UI, Production hardening, Billing polish | None |
| **V2** | Integration | Xero, MYOB, QuickBooks, ServiceM8, Email automation, Notifications | V1 complete |
| **V3** | Advanced Tech | LiDAR, Voice AI, Property intelligence, Photo AI | V1 complete |
| **V4** | Enterprise | Multi-office, Insurer portal, Compliance, Mobile app | V2 partial |
| **V5** | Platform | Marketplace, API platform, Contractor network, AI copilot | V3 + V4 |

---

## Linear Project Structure

**Team**: RestoreAssist (RA-)
**Labels**: `v1-mvp`, `v2-integration`, `v3-advanced`, `v4-enterprise`, `v5-platform`
**Priority Levels**: P0 (Urgent), P1 (High), P2 (Medium), P3 (Low)
**Statuses**: Backlog → Todo → In Progress → In Review → Done

---

*Generated by Claude PM — 2026-01-26*
