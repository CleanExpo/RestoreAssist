-- Portal content hub — customer-facing help articles for the client portal.
-- Seeds three PLATFORM_DEFAULT / PUBLISHED rows for launch.

CREATE TABLE IF NOT EXISTS "PortalContent" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'customer',
  "category" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "mdxContent" TEXT NOT NULL,
  "videoSlug" TEXT,
  "state" TEXT NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PortalContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PortalContent_scope_slug_key"
  ON "PortalContent"("scope", "slug");

CREATE INDEX IF NOT EXISTS "PortalContent_audience_category_state_idx"
  ON "PortalContent"("audience", "category", "state");

-- Seed platform default customer articles (idempotent on scope+slug unique index).
INSERT INTO "PortalContent" (
  "id", "scope", "audience", "category", "slug", "mdxContent", "state", "publishedAt", "updatedAt"
) VALUES
(
  'pc_faq_water_damage',
  'PLATFORM_DEFAULT',
  'customer',
  'faq',
  'faq-water-damage',
  E'## What is water damage restoration?\n\nWater damage restoration removes standing water, dries affected materials, and documents the process for your insurer.\n\n## How long does drying take?\n\nMost residential jobs take 3–5 days depending on category, class, and equipment deployed.',
  'PUBLISHED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'pc_process_expect',
  'PLATFORM_DEFAULT',
  'customer',
  'process',
  'process-what-to-expect',
  E'## What to expect\n\nYour technician will assess affected areas, set drying equipment, and keep you updated through this portal.\n\n## Your role\n\nPlease keep access clear around equipment and report any new leaks or odours promptly.',
  'PUBLISHED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  'pc_insurance_basics',
  'PLATFORM_DEFAULT',
  'customer',
  'insurance',
  'insurance-claim-basics',
  E'## Making a claim\n\nNotify your insurer as soon as possible and keep receipts for emergency make-safe work.\n\n## Documentation\n\nPhotos, moisture readings, and scope reports from your restoration firm support your claim.',
  'PUBLISHED',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("scope", "slug") DO NOTHING;
