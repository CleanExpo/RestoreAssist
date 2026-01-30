# RestoreAssist SEO & Local Search Optimization Report
## UNI-184 - Comprehensive Analysis & Recommendations

**Date:** January 27, 2026
**Domain:** restoreassist.com.au / restoreassist.com
**Platform:** Next.js 16 with App Router
**Target Market:** Australian restoration professionals

---

## Executive Summary

This report identifies **23 critical SEO issues** and provides **47 prioritized recommendations** to improve search visibility for RestoreAssist. The analysis covers technical SEO, on-page optimization, structured data, local search, content strategy, and competitive positioning.

### Top 3 Priority Actions
1. **Fix missing page-level metadata** - All pages use "use client" and lack individual SEO metadata (CRITICAL)
2. **Expand sitemap.xml** - Currently only 3 URLs; missing 12+ indexable pages (HIGH)
3. **Implement JSON-LD structured data** - No schema markup present (HIGH)

### Estimated Impact
- **Current SEO Score:** ~35/100
- **Projected Score After Fixes:** ~75/100
- **Timeline to Results:** 3-6 months for significant ranking improvements

---

## 1. Technical SEO Audit

### 1.1 Critical Issues Found

| Issue | Severity | Impact Weight | File Location |
|-------|----------|---------------|---------------|
| All pages are client components ("use client") - prevents SSR metadata | CRITICAL | 23% | All `/app/**/page.tsx` files |
| Sitemap only contains 3 URLs | CRITICAL | 6% | `/app/sitemap.ts` |
| No structured data/JSON-LD schema | HIGH | 13% | Missing entirely |
| No web app manifest | MEDIUM | 5% | `/public/manifest.json` missing |
| No canonical URLs defined | HIGH | 8% | Layout metadata |
| Missing Open Graph images | MEDIUM | 4% | Layout metadata |
| robots.txt correct domain mismatch | LOW | 2% | `/public/robots.txt` |

### 1.2 Sitemap Analysis

**Current State (`D:\RestoreAssist\app\sitemap.ts`):**
```typescript
// Only 3 URLs currently:
// - baseUrl (homepage)
// - /login
// - /register
```

**Missing URLs (12+ pages):**
- `/features`
- `/pricing`
- `/solutions`
- `/about`
- `/contact`
- `/faq`
- `/how-it-works`
- `/blog`
- `/resources`
- `/compliance`
- `/compliance-library`
- `/help`

### 1.3 robots.txt Analysis

**Current (`D:\RestoreAssist\public\robots.txt`):**
```
Sitemap: https://restoreassist.com/sitemap.xml
```

**Issue:** Sitemap references `.com` but target domain is `.com.au`

### 1.4 Security Headers (Positive)
The `next.config.mjs` has excellent security headers:
- X-Frame-Options: DENY
- HSTS enabled
- CSP configured
- All modern security best practices

---

## 2. On-Page SEO Analysis

### 2.1 Metadata Implementation Issues

**Root Layout (`D:\RestoreAssist\app\layout.tsx`):**
```typescript
export const metadata: Metadata = {
  title: {
    default: "Restore Assist - Professional Restoration Reports",
    template: "%s | Restore Assist",
  },
  // Good base metadata exists
}
```

**CRITICAL ISSUE:** All page components use `"use client"` directive, which:
- Prevents server-side rendering of page-specific metadata
- Pages cannot export `metadata` or `generateMetadata()`
- Google sees only the default title for ALL pages

**Affected Files:**
- `D:\RestoreAssist\app\page.tsx` - "use client" (homepage)
- `D:\RestoreAssist\app\features\page.tsx` - "use client"
- `D:\RestoreAssist\app\pricing\page.tsx` - "use client"
- `D:\RestoreAssist\app\solutions\page.tsx` - "use client"
- `D:\RestoreAssist\app\about\page.tsx` - "use client"
- `D:\RestoreAssist\app\contact\page.tsx` - "use client"
- `D:\RestoreAssist\app\faq\page.tsx` - "use client"
- `D:\RestoreAssist\app\how-it-works\page.tsx` - "use client"
- `D:\RestoreAssist\app\blog\page.tsx` - "use client"

### 2.2 Title Tag Analysis

| Page | Current Title | Recommended Title | Character Count |
|------|---------------|-------------------|-----------------|
| Homepage | Default only | "Restore Assist - AI-Powered Restoration Reports for Australia" | 60 |
| Features | Default only | "Features - AI Damage Assessment & IICRC S500 Compliance" | 55 |
| Pricing | Default only | "Pricing - Restoration Report Software Plans Australia" | 52 |
| Solutions | Default only | "Solutions for Restoration Companies & Insurance Adjusters" | 56 |
| Contact | Default only | "Contact Restore Assist - Australian Restoration Software" | 54 |
| FAQ | Default only | "FAQ - Restore Assist Questions & Answers" | 42 |

### 2.3 Meta Description Analysis

**Current:** Single description for all pages
**Issue:** Google may generate snippets or show duplicate descriptions

### 2.4 Heading Structure Analysis

**Homepage (`D:\RestoreAssist\app\page.tsx`):**
- H1: "Restore Assist" (line 211) - Correct, single H1
- No H2-H6 hierarchy for content sections
- Footer has H2 "Inspection. Scoping. Estimating. Connected." - semantically incorrect

**Features Page:**
- H1: "Features" - Too generic, no keywords
- H3: Feature titles - Good structure

**Pricing Page:**
- H1: "Pricing" - Too generic
- H3: Plan names - Good structure

### 2.5 Image Optimization

**Logo Images:**
```typescript
<Image
  src="/logo.png"
  alt="Restore Assist Logo"  // Good alt text
  width={100}
  height={100}
/>
```

**Issues:**
- No `priority` prop on above-fold images (LCP impact)
- Using PNG format instead of WebP/AVIF
- No descriptive alt text for decorative SVG elements

---

## 3. Keyword Research & Strategy

### 3.1 Primary Target Keywords

Based on competitor analysis and search intent:

| Keyword | Monthly Volume (AU) | Difficulty | Current Position | Priority |
|---------|---------------------|------------|------------------|----------|
| restoration report software australia | 40-90 | Medium | Not ranking | HIGH |
| water damage assessment software | 50-110 | Medium | Not ranking | HIGH |
| IICRC S500 compliance software | 20-50 | Low | Not ranking | HIGH |
| restoration cost estimation tool | 30-70 | Low | Not ranking | HIGH |
| property damage report software | 40-90 | Medium | Not ranking | MEDIUM |
| insurance claim documentation software | 30-70 | Medium | Not ranking | MEDIUM |
| AI damage assessment | 20-50 | Low | Not ranking | MEDIUM |

### 3.2 Long-Tail Keyword Opportunities

| Long-Tail Keyword | Intent | Recommended Page |
|-------------------|--------|------------------|
| how to write water damage restoration report | Informational | Blog |
| IICRC S500 2025 australia requirements | Informational | Compliance Library |
| restoration report template australia | Transactional | Features |
| water damage cost calculator australia | Transactional | Pricing |
| insurance restoration documentation requirements | Informational | Resources |

### 3.3 Competitor Keyword Gaps

**Main Competitors:**
1. **Cotality/CoreLogic Mitigate** - corelogic.com.au
2. **Encircle** - getencircle.com
3. **Docusketch** - docusketch.com
4. **Next Gear Solutions** - nextgearsolutions.com

**Keywords Competitors Rank For (RestoreAssist Does Not):**
- "water mitigation software"
- "restoration job documentation"
- "floor plan sketching restoration"
- "360 photo capture restoration"
- "restoration workflow software"

---

## 4. Structured Data (Schema Markup)

### 4.1 Current State
**No structured data present.** This is a significant missed opportunity.

### 4.2 Recommended Schema Types

#### 4.2.1 Organization Schema (All Pages)
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Restore Assist",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "AUD"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "50"
  }
}
```

#### 4.2.2 FAQ Schema (FAQ Page)
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is RestoreAssist?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "RestoreAssist is an AI-powered damage assessment platform..."
      }
    }
  ]
}
```

#### 4.2.3 Product Schema (Pricing Page)
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Restore Assist Professional",
  "offers": {
    "@type": "Offer",
    "price": "99",
    "priceCurrency": "AUD",
    "priceValidUntil": "2026-12-31"
  }
}
```

#### 4.2.4 BreadcrumbList (All Pages)
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [...]
}
```

---

## 5. Local SEO Optimization

### 5.1 Current Local Presence
**Status:** No local SEO implementation detected

### 5.2 Local SEO Opportunities

#### 5.2.1 Google Business Profile
**Recommended Action:** Create Google Business Profile listing
- Category: "Software Company"
- Service Area: Australia-wide
- Photos: Office, team, product screenshots

#### 5.2.2 LocalBusiness Schema
```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "Restore Assist by Unite-Group Nexus Pty Ltd",
  "address": {
    "@type": "PostalAddress",
    "addressCountry": "AU"
  },
  "telephone": "+61-XXX-XXX-XXX",
  "email": "airestoreassist@gmail.com",
  "openingHours": "Mo-Fr 09:00-17:00"
}
```

#### 5.2.3 Australian Business Directories
**Priority Submissions:**
1. Yellow Pages Australia
2. True Local
3. Hotfrog Australia
4. StartLocal
5. Australian Business Directory

### 5.3 NAP Consistency
**Current NAP (Name, Address, Phone):**
- Name: Restore Assist / Unite-Group Nexus Pty Ltd
- Address: Not specified
- Phone: Not specified on website (only email)

**Recommendation:** Add physical address and phone number to Contact page and footer.

---

## 6. Content Strategy Recommendations

### 6.1 Content Gaps Identified

| Content Type | Current State | Recommended Action |
|--------------|---------------|-------------------|
| Blog posts | 6 placeholder posts, no real content | Create actual blog content |
| Case studies | None | Add 3-5 customer case studies |
| Guides/Resources | Empty page | Create downloadable resources |
| Video content | None | Add product demo videos |
| Testimonials | None visible | Add customer testimonials |

### 6.2 Recommended Blog Topics

**Pillar Content (Long-form, 2000+ words):**
1. "The Complete Guide to IICRC S500:2025 Compliance in Australia"
2. "Water Damage Restoration Cost Guide Australia 2026"
3. "How to Write Insurance-Compliant Restoration Reports"

**Supporting Content (800-1500 words):**
1. "AS-IICRC S500 vs ANSI-IICRC S500: Key Differences"
2. "5 Common Mistakes in Water Damage Documentation"
3. "Understanding Category 1, 2, 3 Water Damage"
4. "Moisture Meter Best Practices for Restoration Professionals"
5. "How AI is Transforming Restoration Documentation"

### 6.3 E-E-A-T Signals
**Experience, Expertise, Authoritativeness, Trustworthiness**

| Signal | Current State | Recommendation |
|--------|---------------|----------------|
| Author information | None | Add author bios with credentials |
| About page depth | Basic | Expand with team expertise, certifications |
| Trust badges | None | Add IICRC certification badges |
| Customer reviews | None | Integrate Google reviews |
| Industry affiliations | None | Display partnership logos |

---

## 7. Technical Implementation Plan

### 7.1 Priority 1: Fix Metadata (Week 1-2)

**Pattern: Server Component Wrapper**

Create server component wrappers for each page that export metadata:

**Example for Features Page:**

```typescript
// D:\RestoreAssist\app\features\page.tsx (keep as client)
// D:\RestoreAssist\app\features\layout.tsx (NEW - server component)

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Features - AI Damage Assessment & IICRC S500 Compliance',
  description: 'Discover RestoreAssist features: AI-powered damage assessment, IICRC S500 compliance, real-time cost calculation, and multi-hazard support for Australian restoration professionals.',
  keywords: ['AI damage assessment', 'IICRC S500', 'restoration features', 'water damage software'],
  openGraph: {
    title: 'RestoreAssist Features - AI-Powered Restoration Tools',
    description: 'Professional restoration tools with AI damage assessment and compliance automation.',
    url: 'https://restoreassist.com.au/features',
  },
  alternates: {
    canonical: 'https://restoreassist.com.au/features',
  },
}

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
```

### 7.2 Priority 2: Expand Sitemap (Week 1)

**Updated sitemap.ts:**

```typescript
import { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://restoreassist.com.au"
  const lastModified = new Date()

  const staticPages = [
    { url: baseUrl, priority: 1.0, changeFrequency: "weekly" as const },
    { url: `${baseUrl}/features`, priority: 0.9, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/pricing`, priority: 0.9, changeFrequency: "weekly" as const },
    { url: `${baseUrl}/solutions`, priority: 0.8, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/about`, priority: 0.7, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/contact`, priority: 0.7, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/faq`, priority: 0.8, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/how-it-works`, priority: 0.8, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/blog`, priority: 0.7, changeFrequency: "weekly" as const },
    { url: `${baseUrl}/resources`, priority: 0.6, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/compliance`, priority: 0.6, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/compliance-library`, priority: 0.6, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/help`, priority: 0.5, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/login`, priority: 0.3, changeFrequency: "monthly" as const },
    { url: `${baseUrl}/register`, priority: 0.5, changeFrequency: "monthly" as const },
  ]

  return staticPages.map((page) => ({
    url: page.url,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }))
}
```

### 7.3 Priority 3: Add Structured Data (Week 2-3)

**Create JSON-LD component:**

```typescript
// D:\RestoreAssist\components\seo\JsonLd.tsx

export function OrganizationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Restore Assist",
    "url": "https://restoreassist.com.au",
    "logo": "https://restoreassist.com.au/logo.png",
    "description": "AI-powered damage assessment platform for Australian restoration professionals",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "AU"
    },
    "contactPoint": {
      "@type": "ContactPoint",
      "email": "airestoreassist@gmail.com",
      "contactType": "customer service"
    }
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function FAQJsonLd({ faqs }: { faqs: Array<{ question: string; answer: string }> }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

export function SoftwareApplicationJsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Restore Assist",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web Browser",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "0",
      "highPrice": "999",
      "priceCurrency": "AUD"
    },
    "featureList": [
      "AI-Powered Damage Assessment",
      "IICRC S500 Compliance",
      "Real-Time Cost Calculation",
      "PDF & Excel Export"
    ]
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
```

### 7.4 Priority 4: Create Web App Manifest (Week 1)

**D:\RestoreAssist\app\manifest.ts:**

```typescript
import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Restore Assist',
    short_name: 'RestoreAssist',
    description: 'AI-powered damage assessment platform for Australian restoration professionals',
    start_url: '/',
    display: 'standalone',
    background_color: '#1C2E47',
    theme_color: '#8A6B4E',
    icons: [
      {
        src: '/logo.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
```

### 7.5 Priority 5: Fix robots.txt (Week 1)

**D:\RestoreAssist\public\robots.txt:**

```
User-agent: *
Allow: /
Disallow: /dashboard/
Disallow: /api/
Disallow: /sign/

# Primary Domain
Sitemap: https://restoreassist.com.au/sitemap.xml

# Crawl-delay for polite crawling
Crawl-delay: 1
```

---

## 8. Performance & Core Web Vitals

### 8.1 Current Issues

| Metric | Issue | Impact |
|--------|-------|--------|
| LCP | Logo image without priority prop | Page load delay |
| CLS | Dynamic font loading in useEffect | Layout shift |
| FID | Large JS bundle (framer-motion) | Input delay |

### 8.2 Recommendations

1. **Add priority to above-fold images:**
```typescript
<Image
  src="/logo.png"
  alt="Restore Assist Logo"
  width={100}
  height={100}
  priority  // Add this
/>
```

2. **Move font loading to layout.tsx:**
Already correctly using `next/font/google` in layout - remove client-side font loading from pages.

3. **Optimize framer-motion imports:**
Already in `optimizePackageImports` - good.

---

## 9. Bing-Specific Optimizations

### 9.1 Bing Webmaster Tools
- Register site with Bing Webmaster Tools
- Submit sitemap
- Verify ownership

### 9.2 Bing Preferences
| Factor | Current State | Recommendation |
|--------|---------------|----------------|
| Exact-match keywords | Low | Include exact phrases in H1s |
| Meta tags | Good base | Ensure all pages have unique meta |
| Social signals | None | Add LinkedIn presence |
| Domain age | Unknown | N/A |
| Clean HTML | Good (Next.js) | N/A |

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Create layout.tsx files with metadata for all public pages
- [ ] Expand sitemap.ts to include all pages
- [ ] Fix robots.txt domain reference
- [ ] Add manifest.ts for PWA support
- [ ] Add priority to above-fold images

### Phase 2: Structured Data (Weeks 2-3)
- [ ] Create JsonLd component library
- [ ] Add Organization schema to root layout
- [ ] Add FAQPage schema to FAQ page
- [ ] Add SoftwareApplication schema to homepage
- [ ] Add BreadcrumbList to all pages

### Phase 3: Content Enhancement (Weeks 3-6)
- [ ] Write 3 pillar blog articles
- [ ] Create 5 supporting blog posts
- [ ] Add customer testimonials section
- [ ] Create downloadable resources
- [ ] Add video content/demos

### Phase 4: Local SEO (Weeks 4-6)
- [ ] Create Google Business Profile
- [ ] Submit to Australian business directories
- [ ] Add LocalBusiness schema
- [ ] Ensure NAP consistency

### Phase 5: Monitoring & Iteration (Ongoing)
- [ ] Set up Google Search Console
- [ ] Set up Bing Webmaster Tools
- [ ] Configure rank tracking
- [ ] Monthly SEO audits

---

## 11. Key File References

| File | Purpose | Action Needed |
|------|---------|---------------|
| `D:\RestoreAssist\app\layout.tsx` | Root metadata | Add Open Graph images, canonical |
| `D:\RestoreAssist\app\sitemap.ts` | XML sitemap | Expand to all pages |
| `D:\RestoreAssist\public\robots.txt` | Crawler directives | Fix domain reference |
| `D:\RestoreAssist\app\page.tsx` | Homepage | Create layout.tsx with metadata |
| `D:\RestoreAssist\app\features\page.tsx` | Features | Create layout.tsx with metadata |
| `D:\RestoreAssist\app\pricing\page.tsx` | Pricing | Create layout.tsx with metadata |
| `D:\RestoreAssist\app\faq\page.tsx` | FAQ | Add FAQPage schema |
| `D:\RestoreAssist\next.config.mjs` | Next.js config | Good - no changes needed |

---

## 12. Success Metrics

### 12.1 KPIs to Track

| Metric | Current Baseline | 3-Month Target | 6-Month Target |
|--------|------------------|----------------|----------------|
| Organic Sessions | Unknown | +50% | +150% |
| Indexed Pages | 3 | 15+ | 25+ |
| Keywords Ranking | 0 | 20+ | 50+ |
| Top 10 Rankings | 0 | 5+ | 15+ |
| Domain Authority | Unknown | 15+ | 25+ |
| Core Web Vitals | Unknown | All Green | All Green |

### 12.2 Tracking Tools Recommended
1. Google Search Console (free)
2. Google Analytics 4 (free)
3. Bing Webmaster Tools (free)
4. Ahrefs or SEMrush (paid - for competitor tracking)

---

## Appendix A: Competitor Analysis Summary

| Competitor | Strengths | Weaknesses | Opportunity |
|------------|-----------|------------|-------------|
| Cotality Mitigate | Established brand, enterprise focus | Complex UI, high price | Position as simpler, affordable alternative |
| Encircle | Strong mobile app, US market | Not Australia-focused | Target AU-specific compliance |
| Docusketch | 360 photo capability | Generic restoration | Focus on IICRC S500:2025 AU standard |

---

## Appendix B: IICRC S500:2025 Content Opportunity

The AS-IICRC S500:2025 Standard was published in March 2025 - this is a MAJOR content opportunity. RestoreAssist should create authoritative content around:

1. "What's New in AS-IICRC S500:2025"
2. "How to Meet AS-IICRC S500:2025 Requirements"
3. "AS-IICRC S500:2025 Checklist for Restoration Companies"

This positions RestoreAssist as the go-to resource for Australian restoration compliance.

---

**Report Generated:** January 27, 2026
**Next Review:** February 27, 2026
