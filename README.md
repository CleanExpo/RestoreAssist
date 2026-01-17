# RestoreAssist

**Insurance Restoration Management Platform for Australian Contractors**

Production: https://restoreassist.app

---

## January 2026 Readme Update

### Reason for Update

This update documents significant platform enhancements completed over the past 48 hours, focusing on security hardening, developer experience improvements through Storybook implementation, design system standardization, and CI/CD pipeline automation.

---

### What Has Been Accomplished

#### 1. Security Enhancements

**Secure Password Reset Flow**
- Implemented cryptographically secure password reset tokens with 1-hour expiry
- Added token verification endpoint (`/api/auth/verify-reset-token`)
- Created dedicated reset password page with improved UX
- Built professional HTML email templates for password reset notifications

**Role-Based Access Control (RBAC)**
- New authorization library (`lib/auth/authorization.ts`) with permission checking
- RBAC configuration file defining roles: `admin`, `manager`, `technician`, `client`
- Enhanced middleware with route-level authorization
- Granular permissions for reports, claims, users, and settings

**Files Added:**
- `lib/auth/authorization.ts` - Core authorization logic
- `lib/auth/rbac-config.ts` - Role and permission definitions
- `lib/auth/password-reset-tokens.ts` - Secure token management
- `lib/email/password-reset-email.ts` - Email templates
- `app/api/auth/verify-reset-token/route.ts` - Token verification API
- `app/reset-password/page.tsx` - New reset password page

---

#### 2. Storybook Implementation (Phase 6 Week 3)

**Complete Storybook Setup**
- Configured Storybook 8.x with Next.js 15 compatibility
- Added Vitest integration for component testing
- Created comprehensive component documentation

**Component Stories Created:**
- **UI Components**: Button, Card, Input, Checkbox, Label, Textarea, Alert, Badge, Dialog
- **Design System**: Colors, Typography, Spacing documentation
- **Accessibility**: Button A11Y, Form A11Y, WCAG Guidelines reference
- **Forms**: Complete form example with validation patterns

**Documentation Added:**
- `.storybook/README.md` - Complete Storybook guide
- `.storybook/A11Y_TESTING.md` - Accessibility testing procedures
- `.storybook/AUTOMATION_GUIDE.md` - CI/CD automation guide
- `STORYBOOK_CLIENT_QUICKSTART.md` - Client-friendly quickstart

**Automation Scripts:**
- `scripts/setup-storybook.sh` / `setup-storybook.bat` - Setup automation
- `scripts/generate-story.ts` - Story file generator

---

#### 3. CI/CD Pipeline

**GitHub Actions Workflow** (`.github/workflows/storybook-deploy.yml`)
- Automated Storybook builds on push to main
- Chromatic visual regression testing integration
- Vercel deployment for Storybook hosting
- Proper handling of package-lock.json for `npm ci`

**Setup Documentation:**
- `.github/CI_CD_SETUP.md` - Complete CI/CD configuration guide
- Environment secrets configuration for GitHub Actions

---

#### 4. Design System Adoption (Phase 6 Week 2)

**Components Refactored to Design System:**
- `InitialDataEntryForm.tsx` - Complete design system colors
- `NIRTechnicianInputForm.tsx` - Consistent styling
- `BulkOperationModal.tsx` - Updated button and layout styles
- `OnboardingModal.tsx` - Design system compliance
- `TechnicianInputForm.tsx` - Form styling standardization
- `FormDropdownMenu.tsx` - Dropdown consistency
- `FormField.tsx` - Field renderer updates
- `Chatbot.tsx` - Chat interface styling
- `BulkActionsToolbar.tsx` - Toolbar design system
- Landing feature components - Homepage consistency

**Design System Foundation:**
- Dark mode implementation with CSS custom properties
- Consistent color palette across all components
- Typography and spacing standardization

---

#### 5. Bug Fixes and Improvements

| Issue | Resolution |
|-------|------------|
| TypeScript compilation errors | Excluded mobile directory from tsconfig |
| Duplicate darkMode in Tailwind | Removed duplicate declaration |
| Stripe API version mismatch | Updated to correct API version |
| Property scraper timeouts | Added proper fetch timeout handling with AbortController |
| Vercel deployment issues | Fixed CLI commands for CI/CD |
| Chromatic git history | Added fetch-depth: 0 to checkout action |

---

### Technical Summary

**Commits in Last 48 Hours:** 50+

**Files Changed:** 100+ files across security, UI, and infrastructure

**New Features:**
- Secure password reset flow
- Role-based access control
- Storybook component library
- CI/CD automation pipeline
- Design system standardization

**Dependencies Added:**
- `@storybook/addon-a11y` - Accessibility testing
- `@storybook/addon-interactions` - Interaction testing
- `@storybook/test` - Component testing
- `chromatic` - Visual regression testing

---

### Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start Storybook
npm run storybook

# Run tests
npm test

# Build for production
npm run build
```

---

### Project Stack

- **Framework**: Next.js 15.0.0 + React 19.2.0
- **Database**: Prisma ORM + Supabase PostgreSQL
- **Authentication**: NextAuth with RBAC
- **Payments**: Stripe subscriptions
- **AI**: Claude API integration
- **Component Docs**: Storybook 8.x
- **Deployment**: Vercel (Sydney region)

---

### Documentation

| Document | Description |
|----------|-------------|
| `CLAUDE.md` | Quick reference hub |
| `docs/COMMANDS.md` | All CLI commands |
| `docs/ENVIRONMENT.md` | Environment variables |
| `docs/TROUBLESHOOTING.md` | Common issues |
| `.storybook/README.md` | Storybook guide |
| `.github/CI_CD_SETUP.md` | CI/CD configuration |

---

### DigitalOcean (Optional)

- Set `DIGITALOCEAN_ACCESS_TOKEN` (or `DO_API_TOKEN`) to enable server-side DigitalOcean API calls.
- Admin-only endpoint: `GET /api/digitalocean/account`
- Deployment options: `docs/DIGITALOCEAN.md`

---

### Status

**Production Ready** | **Last Updated:** 2026-01-12
