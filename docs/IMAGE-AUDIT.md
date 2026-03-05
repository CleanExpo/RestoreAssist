# Image Audit — `<img>` Tag Usage

Audit of raw `<img>` tags in `apps/web/` that bypass Next.js `<Image>` optimisation
(automatic WebP/AVIF, lazy-loading, srcset generation).

> Most of these use **dynamic URLs** (Cloudinary, base64 signatures, blob URLs)
> where Next.js `<Image>` requires either `remotePatterns` config or `unoptimized`.
> They are listed here so the team can decide case-by-case whether to migrate.

## Dynamic / User-uploaded images (low LCP risk — not above the fold)

| File | Line(s) | Context | Notes |
|------|---------|---------|-------|
| `components/AuthorityFormViewer.tsx` | 291 | Company logo (dynamic URL) | User-uploaded, rendered in modal/print view |
| `components/AuthorityFormViewer.tsx` | 384 | Signature image (base64 data URI) | Cannot use `<Image>` with data URIs without `unoptimized` |
| `components/authority-forms/FormPreviewModal.tsx` | 104 | Company logo (dynamic URL) | Modal preview |
| `components/authority-forms/FormPreviewModal.tsx` | 211 | Signature image (base64 data URI) | Same as above |
| `components/VisualDashboardReport.tsx` | 128 | Business logo (dynamic URL) | Report viewer, below fold |
| `components/VisualDashboardReport.tsx` | 772 | Area photos (dynamic URLs) | Report photo gallery |
| `components/VisualDashboardReport.tsx` | 970 | Report photos (dynamic URLs) | Report photo gallery |
| `components/VisualScopeOfWorksViewer.tsx` | 242 | Business logo (dynamic URL) | Report viewer |
| `components/VisualCostEstimationViewer.tsx` | 266 | Business logo (dynamic URL) | Report viewer |
| `components/RestorationInspectionReportViewer.tsx` | 489 | Business logo (dynamic URL) | Report header |
| `components/RestorationInspectionReportViewer.tsx` | 1601, 1637 | Inspection photos (dynamic URLs) | Photo galleries |
| `components/TechnicianInputForm.tsx` | 361 | Photo preview (blob URL via `URL.createObjectURL`) | Cannot use `<Image>` with blob URLs |
| `components/NIRTechnicianInputForm.tsx` | 1339, 2216 | Photo preview (blob / dynamic URL) | Same as above |
| `components/Tier3Questions.tsx` | 365 | Category photo preview (blob URL) | Same as above |
| `app/sign/[token]/page.tsx` | 207 | Company logo on public signing page | Dynamic URL |
| `app/dashboard/settings/page.tsx` | 584, 618 | Business logo preview in settings | Dynamic URL |
| `app/dashboard/quote/page.tsx` | 316 | Contractor logo in quote result | Dynamic URL, has eslint-disable comment |
| `app/dashboard/inspections/[id]/page.tsx` | 675 | Inspection photo thumbnails | Dynamic URL |

## Summary

- **0 above-fold `<img>` tags** — all above-fold logos already use Next.js `<Image>`.
- **21 `<img>` occurrences** across 13 files, all rendering dynamic content
  (user-uploaded logos, photos, base64 signatures, blob URLs).
- Migration path: add external domains to `next.config.js` `images.remotePatterns`
  and convert to `<Image>` where beneficial. Blob/data-URI images require `unoptimized` prop.
