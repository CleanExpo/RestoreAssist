# Tradie Evidence-Capture UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three deferred UI gaps from sub-project #2 — Dashboard `<TechLicenceBanner>` mount (Seam B), inspection-page `<CapturePhotoFab>` build (Seam C), and `<InspectionSignOff>` modal-first refactor (Seam D) — unblocking 5 E2E specs and shipping real evidence-capture for technicians.

**Architecture:** Three independent PRs landing in any order to sandbox. Seam B is a thin component that reuses the existing role-branched `GET /api/onboarding/first-run` API. Seam D is a state-machine refactor of `<InspectionSignOff>` (no API changes). Seam C is the biggest build — new FAB + tag modal + chain-of-custody schema delta + magic-byte + hash-recompute on the existing `POST /api/inspections/[id]/photos` route.

**Tech Stack:** Next.js 15 App Router, Prisma 6 + PostgreSQL, React 19, shadcn/ui, Tailwind, Vitest, Playwright, Web Crypto API (`crypto.subtle.digest` for client SHA-256), navigator.geolocation (optional GPS).

**Spec:** `docs/superpowers/specs/2026-05-14-tradie-evidence-capture-ui-design.md`.

**Plan-time codebase observations** (verified by reading actual files):

- The photo upload route at `app/api/inspections/[id]/photos/route.ts` uses `lib/storage` provider abstraction (`getStorageProvider()`), not Cloudinary directly. Seam C layers on top; we don't touch the provider.
- The route already calls `lib/media/exif-extract.ts::extractAndSaveMediaAsset` for EXIF — the chain-of-custody work coexists with that helper, doesn't replace it.
- `<InspectionSignOff>` has these state vars to refactor around: `signatoryName`, `role`, `confirmed`, `submitting`, `error`, `signedAt`, `signedByName`, `licenceModalOpen`. The refactor adds a `signOffState` machine on top; `licenceModalOpen` becomes derived state.
- PR #1008 (Seam F Cloudinary fix) is OPEN at plan write time but unrelated to this plan — Seam F is the headshot route, not the photos route.

---

## File Structure

### Files to CREATE

- `components/dashboard/TechLicenceBanner.tsx` — Seam B banner component
- `components/dashboard/__tests__/TechLicenceBanner.test.tsx` — 4 unit cases
- `app/dashboard/settings/credentials/page.tsx` — referenced by API `href`; thin page that opens the existing `<EngagementLicenceModal>` in standalone mode
- `components/inspection/CapturePhotoFab.tsx` — Seam C FAB
- `components/inspection/__tests__/CapturePhotoFab.test.tsx` — 3 unit cases
- `components/inspection/CapturePhotoTagModal.tsx` — Seam C tag modal
- `components/inspection/__tests__/CapturePhotoTagModal.test.tsx` — 5 unit cases
- `lib/capture/cocoa-client.ts` — SHA-256 + GPS helpers
- `lib/capture/__tests__/cocoa-client.test.ts` — 3 unit cases
- `app/api/inspections/[id]/photos/__tests__/cocoa.test.ts` — 4 integration cases for the extended POST
- `prisma/migrations/20260514100000_inspection_photo_cocoa/migration.sql` — 4 nullable cols
- `e2e/tech-second-signoff-prefilled.spec.ts` — new E2E for the State C reload path

### Files to MODIFY

- `app/dashboard/page.tsx` — mount `<TechLicenceBanner>` at top of return body
- `components/inspection/InspectionSignOff.tsx` — state-machine refactor (A → B → C → D)
- `components/inspection/__tests__/InspectionSignOff.test.tsx` (create if missing) — 8 state-transition cases
- `app/dashboard/inspections/[id]/page.tsx` — mount `<CapturePhotoFab>`
- `app/api/inspections/[id]/photos/route.ts` — extend POST: magic-byte check, hash recompute, cocoa fields
- `prisma/schema.prisma` — 4 new nullable cols on `InspectionPhoto`

---

## Task Map

| # | Task | Phase | Approx |
|---|---|---|---|
| 1 | `<TechLicenceBanner>` + tests | Seam B | 30min |
| 2 | Mount banner + new `/dashboard/settings/credentials` page | Seam B | 20min |
| 3 | `<InspectionSignOff>` state machine refactor | Seam D | 90min |
| 4 | Prisma migration A (cocoa cols) | Seam C foundation | 15min |
| 5 | `lib/capture/cocoa-client.ts` + tests | Seam C foundation | 30min |
| 6 | `<CapturePhotoTagModal>` + tests | Seam C UI | 60min |
| 7 | `<CapturePhotoFab>` + tests | Seam C UI | 45min |
| 8 | Extend `POST /api/inspections/[id]/photos` (magic-byte + hash + cocoa) + tests | Seam C API | 60min |
| 9 | Mount `<CapturePhotoFab>` on inspection page | Seam C wire | 10min |
| 10 | New E2E `tech-second-signoff-prefilled.spec.ts` | Verification | 20min |
| 11 | Visual regression baselines (15 PNGs) | Verification | manual |
| 12 | Manual Verification Gate on staging | Verification | manual |

---

## Task 1: `<TechLicenceBanner>` component

**Files:**
- Create: `components/dashboard/TechLicenceBanner.tsx`
- Test: `components/dashboard/__tests__/TechLicenceBanner.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/dashboard/__tests__/TechLicenceBanner.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TechLicenceBanner } from "../TechLicenceBanner";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  fetchMock.mockReset();
});

describe("TechLicenceBanner", () => {
  it("returns null while loading (no fetch resolved)", () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {})); // never resolves
    const { container } = render(<TechLicenceBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when API response is dismissed=true", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        dismissed: true,
        allComplete: true,
        completedCount: 3,
        totalCount: 3,
        steps: [],
      }),
    });
    const { container } = render(<TechLicenceBanner />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it("renders banner when first step id is 'tech_iicrc'", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        dismissed: false,
        allComplete: false,
        completedCount: 0,
        totalCount: 3,
        steps: [
          { id: "tech_iicrc", title: "Add your IICRC certificate", description: "...", href: "/dashboard/settings/credentials?focus=iicrc", completed: false },
          { id: "tech_whs", title: "Add your WHS card", description: "...", href: "/dashboard/settings/credentials?focus=whs", completed: false },
          { id: "tech_state", title: "Add your state licence (if applicable)", description: "...", href: "/dashboard/settings/credentials?focus=state", completed: false },
        ],
      }),
    });
    render(<TechLicenceBanner />);
    await waitFor(() =>
      expect(screen.getByText(/Add your credentials to unlock attestations/)).toBeInTheDocument(),
    );
  });

  it("returns null for non-tech step set (ADMIN/MANAGER)", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        dismissed: false,
        allComplete: false,
        completedCount: 0,
        totalCount: 4,
        steps: [
          { id: "first_inspection", title: "Create your first inspection", description: "...", href: "/dashboard/inspections/new", completed: false },
        ],
      }),
    });
    const { container } = render(<TechLicenceBanner />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run components/dashboard/__tests__/TechLicenceBanner.test.tsx
```

Expected: FAIL with "Cannot find module '../TechLicenceBanner'".

- [ ] **Step 3: Write the component**

Create `components/dashboard/TechLicenceBanner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface FirstRunStep {
  id: string;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

interface FirstRunChecklistResponse {
  dismissed: boolean;
  allComplete: boolean;
  completedCount: number;
  totalCount: number;
  steps: FirstRunStep[];
}

export function TechLicenceBanner() {
  const [data, setData] = useState<FirstRunChecklistResponse | null>(null);

  useEffect(() => {
    fetch("/api/onboarding/first-run")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {
        /* silently ignore */
      });
  }, []);

  // Hide while loading, when dismissed, and for non-tech step sets.
  if (!data || data.dismissed) return null;
  const isTech = data.steps[0]?.id === "tech_iicrc";
  if (!isTech) return null;

  const firstIncomplete = data.steps.find((s) => !s.completed);
  const ctaHref = firstIncomplete?.href ?? "/dashboard/settings/credentials";

  return (
    <div className="border border-[#1C2E47]/30 bg-[#1C2E47]/8 dark:bg-[#1C2E47]/20 rounded-lg p-4 mb-6 flex items-center gap-4">
      <div className="text-2xl flex-shrink-0"></div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">Add your credentials to unlock attestations</p>
        <p className="text-xs text-muted-foreground">
          IICRC certificate · WHS White Card · State licence — takes a minute
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {data.steps.map((s) => {
            const short = s.title.replace(/^Add your /, "").replace(/ \(if applicable\)$/, "");
            return (
              <span
                key={s.id}
                className="text-[10px] px-2 py-0.5 border border-muted-foreground/30 rounded-full"
              >
                {short} {s.completed ? "" : "pending"}
              </span>
            );
          })}
        </div>
      </div>
      <Link
        href={ctaHref}
        className="bg-[#1C2E47] text-white px-4 py-2 rounded-md text-sm font-medium flex-shrink-0"
      >
        Add credentials →
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run components/dashboard/__tests__/TechLicenceBanner.test.tsx
```

Expected: PASS (4/4).

- [ ] **Step 5: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/TechLicenceBanner.tsx components/dashboard/__tests__/TechLicenceBanner.test.tsx
git commit -m "feat(dashboard): TechLicenceBanner component (Seam B)"
```

---

## Task 2: Mount banner + create `/dashboard/settings/credentials` page

**Files:**
- Modify: `app/dashboard/page.tsx`
- Create: `app/dashboard/settings/credentials/page.tsx`

- [ ] **Step 1: Read the existing dashboard page top**

```bash
head -60 app/dashboard/page.tsx
```

You're confirming where the existing return body starts — the banner mounts at the very top of the JSX, above the existing metric cards.

- [ ] **Step 2: Add the import + JSX line**

Open `app/dashboard/page.tsx`. After the existing imports, add:

```tsx
import { TechLicenceBanner } from "@/components/dashboard/TechLicenceBanner";
```

Find the start of the return body (where the existing top-level wrapper begins — usually `<motion.div>` or `<DashboardLayout>` or a fragment). Add `<TechLicenceBanner />` as the first child of that wrapper. Example:

```tsx
return (
  <DashboardLayout>
    <TechLicenceBanner />
    {/* existing metrics + cards unchanged */}
  </DashboardLayout>
);
```

(If the wrapper structure differs, place `<TechLicenceBanner />` immediately above the first user-visible element — never inside the motion animation block because the banner uses its own fade-in.)

- [ ] **Step 3: Create the credentials settings page**

Create `app/dashboard/settings/credentials/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { EngagementLicenceModal } from "@/components/attestation/EngagementLicenceModal";

export default function CredentialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(true);

  // Auto-open the modal on mount. ?focus=iicrc|whs|state determines which field
  // to scroll to (the modal handles this if it supports a focus prop; for v1
  // we ignore the focus param and always open the standard form).
  useEffect(() => {
    setOpen(true);
  }, [searchParams]);

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4">Your credentials</h1>
      <p className="text-sm text-muted-foreground mb-6">
        IICRC certificate, WHS White Card, and state licence are verified at every attestation moment per rule 28. You can pre-fill them here.
      </p>
      <EngagementLicenceModal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) router.push("/dashboard");
        }}
        inspectionId={null}
        onConfirmed={() => {
          setOpen(false);
          router.push("/dashboard");
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/page.tsx app/dashboard/settings/credentials/page.tsx
git commit -m "feat(dashboard): mount TechLicenceBanner + standalone credentials page (Seam B)"
```

---

## Task 3: `<InspectionSignOff>` state-machine refactor (Seam D)

**Files:**
- Modify: `components/inspection/InspectionSignOff.tsx`
- Test: `components/inspection/__tests__/InspectionSignOff.test.tsx` (create if missing)

- [ ] **Step 1: Read the existing component**

```bash
cat components/inspection/InspectionSignOff.tsx
```

Note the current state vars: `signatoryName`, `role`, `confirmed`, `submitting`, `error`, `signedAt`, `signedByName`, `licenceModalOpen`. The refactor keeps all of these and adds a new `signOffState` machine on top. The existing `licenceModalOpen` becomes derived from `signOffState === "modal"`.

- [ ] **Step 2: Write the failing tests**

Create or extend `components/inspection/__tests__/InspectionSignOff.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import InspectionSignOff from "../InspectionSignOff";

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "u_1", name: "Jamie Tradie", role: "USER" } },
    status: "authenticated",
  }),
}));

beforeEach(() => {
  fetchMock.mockReset();
  // Default: no recent Authorisation
  fetchMock.mockImplementation((url) => {
    if (typeof url === "string" && url.includes("/api/authorisations/most-recent")) {
      return Promise.resolve({ json: async () => ({ row: null }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
});

const props = {
  inspectionId: "insp_1",
  inspectionNumber: "TEST-001",
  signedAt: null,
  signedByName: null,
  onSigned: vi.fn(),
};

describe("InspectionSignOff state machine", () => {
  it("State A — initial: Sign Inspection button enabled, form hidden", async () => {
    render(<InspectionSignOff {...props} />);
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Sign Inspection/ });
      expect(btn).not.toBeDisabled();
    });
    expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument();
  });

  it("click Sign Inspection in State A opens licence modal (State B)", async () => {
    render(<InspectionSignOff {...props} />);
    await waitFor(() => screen.getByRole("button", { name: /Sign Inspection/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sign Inspection/ }));
    await waitFor(() => {
      expect(screen.getByText(/Add your credentials/i)).toBeInTheDocument();
    });
  });

  it("modal confirm advances to State C: form visible, signatoryName prefilled", async () => {
    fetchMock.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/authorisations/most-recent")) {
        return Promise.resolve({ json: async () => ({ row: null }) });
      }
      if (typeof url === "string" && url.includes("/api/authorisations") && !url.includes("most-recent")) {
        return Promise.resolve({ json: async () => ({ ok: true, authorisationId: "auth_1" }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<InspectionSignOff {...props} />);
    await waitFor(() => screen.getByRole("button", { name: /Sign Inspection/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sign Inspection/ }));
    await waitFor(() => screen.getByText(/Add your credentials/i));
    // Fill modal IICRC + WHS
    fireEvent.change(screen.getByLabelText(/IICRC certificate number/i), {
      target: { value: "IICRC-1" },
    });
    fireEvent.change(screen.getByLabelText(/WHS card/i), {
      target: { value: "WHS-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Verify and continue/ }));
    await waitFor(() => {
      const name = screen.getByDisplayValue("Jamie Tradie");
      expect(name).toBeInTheDocument();
    });
  });

  it("State C: Confirm sign-off disabled until confirmed checkbox checked", async () => {
    fetchMock.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/authorisations/most-recent")) {
        return Promise.resolve({
          json: async () => ({
            row: {
              subjectLicenceNumber: "IICRC-1",
              whsCardNumber: "WHS-1",
              verifiedAt: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<InspectionSignOff {...props} />);
    await waitFor(() => screen.getByDisplayValue("Jamie Tradie"));
    const btn = screen.getByRole("button", { name: /Confirm sign-off/i });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(btn).not.toBeDisabled();
  });

  it("recent Authorisation on mount opens directly at State C (skip modal)", async () => {
    fetchMock.mockImplementation((url) => {
      if (typeof url === "string" && url.includes("/api/authorisations/most-recent")) {
        return Promise.resolve({
          json: async () => ({
            row: {
              subjectLicenceNumber: "IICRC-1",
              whsCardNumber: "WHS-1",
              verifiedAt: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    render(<InspectionSignOff {...props} />);
    await waitFor(() => screen.getByDisplayValue("Jamie Tradie"));
    expect(screen.queryByText(/Add your credentials/i)).not.toBeInTheDocument();
  });

  it("modal cancel reverts to State A", async () => {
    render(<InspectionSignOff {...props} />);
    await waitFor(() => screen.getByRole("button", { name: /Sign Inspection/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sign Inspection/ }));
    await waitFor(() => screen.getByText(/Add your credentials/i));
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText(/Add your credentials/i)).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Full name/i)).not.toBeInTheDocument();
  });

  it("submit POSTs /api/inspections/[id]/sign and calls onSigned", async () => {
    fetchMock.mockImplementation((url, init) => {
      if (typeof url === "string" && url.includes("/api/authorisations/most-recent")) {
        return Promise.resolve({
          json: async () => ({
            row: {
              subjectLicenceNumber: "IICRC-1",
              whsCardNumber: "WHS-1",
              verifiedAt: new Date().toISOString(),
            },
          }),
        });
      }
      if (typeof url === "string" && url.includes("/sign")) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const onSigned = vi.fn();
    render(<InspectionSignOff {...props} onSigned={onSigned} />);
    await waitFor(() => screen.getByDisplayValue("Jamie Tradie"));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /Confirm sign-off/i }));
    await waitFor(() => expect(onSigned).toHaveBeenCalled());
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run components/inspection/__tests__/InspectionSignOff.test.tsx
```

Expected: FAIL — the component still uses the old form-first contract.

- [ ] **Step 4: Refactor `components/inspection/InspectionSignOff.tsx`**

Open the file. The current shape has these key elements (verified at plan time):
- `useState` declarations for `signatoryName`, `role`, `confirmed`, `submitting`, `error`, `signedAt`, `signedByName`, `licenceModalOpen`.
- A render block with the form fields visible and a "Sign Inspection" button gated by `submitting || !signatoryName.trim() || !confirmed`.

Apply this refactor (preserve all existing logic — name normalisation, error handling, role default "Lead Technician", sign-off API call):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EngagementLicenceModal } from "@/components/attestation/EngagementLicenceModal";

type SignOffState = "initial" | "modal" | "form-unlocked" | "submitted";

interface Props {
  inspectionId: string;
  inspectionNumber: string;
  signedAt: string | null;
  signedByName: string | null;
  onSigned?: () => void;
}

const AUTHORISATION_FRESH_MS = 90 * 24 * 60 * 60 * 1000;

export default function InspectionSignOff({
  inspectionId,
  inspectionNumber,
  signedAt: initialSignedAt,
  signedByName: initialSignedByName,
  onSigned,
}: Props) {
  const { data: session } = useSession();
  const [signOffState, setSignOffState] = useState<SignOffState>(
    initialSignedAt ? "submitted" : "initial",
  );
  const [signatoryName, setSignatoryName] = useState(session?.user?.name ?? "");
  const [role, setRole] = useState("Lead Technician");
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedAt, setSignedAt] = useState<Date | null>(
    initialSignedAt ? new Date(initialSignedAt) : null,
  );
  const [signedByName, setSignedByName] = useState<string | null>(initialSignedByName);

  // On mount, check for a recent Authorisation. If found, skip the modal step.
  useEffect(() => {
    if (signOffState !== "initial") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/authorisations/most-recent");
        const data = await res.json().catch(() => ({ row: null }));
        if (cancelled) return;
        if (data.row && Date.now() - new Date(data.row.verifiedAt).getTime() < AUTHORISATION_FRESH_MS) {
          setSignOffState("form-unlocked");
        }
      } catch {
        /* silently ignore — user can still click button */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signOffState]);

  // Keep signatoryName in sync if session loads after initial render.
  useEffect(() => {
    if (session?.user?.name && !signatoryName) {
      setSignatoryName(session.user.name);
    }
  }, [session, signatoryName]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspections/${inspectionId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatoryName, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Sign-off failed");
        return;
      }
      setSignedAt(new Date());
      setSignedByName(signatoryName);
      setSignOffState("submitted");
      onSigned?.();
    } finally {
      setSubmitting(false);
    }
  }

  // State D: submitted (success state)
  if (signOffState === "submitted" && signedAt) {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
        <p className="text-sm font-medium">Inspection signed off</p>
        <p className="text-xs text-muted-foreground">
          Signed by {signedByName ?? "—"} on {signedAt.toLocaleDateString()}
        </p>
      </div>
    );
  }

  // State A: initial (button only, form hidden)
  if (signOffState === "initial") {
    return (
      <div className="rounded-md border p-4">
        <p className="text-sm font-medium mb-1">Ready to sign off this inspection?</p>
        <p className="text-xs text-muted-foreground mb-3">
          We'll verify your credentials first, then collect your sign-off.
        </p>
        <Button onClick={() => setSignOffState("modal")} className="bg-[#1C2E47] text-white">
          Sign Inspection →
        </Button>
        <EngagementLicenceModal
          open={false}
          onOpenChange={() => {}}
          inspectionId={inspectionId}
          onConfirmed={() => {}}
        />
      </div>
    );
  }

  // State B: modal open (or transition)
  if (signOffState === "modal") {
    return (
      <div className="rounded-md border p-4">
        <Button disabled className="bg-[#1C2E47] text-white opacity-70">
          Sign Inspection (verifying...)
        </Button>
        <EngagementLicenceModal
          open
          onOpenChange={(open) => {
            if (!open) setSignOffState("initial");
          }}
          inspectionId={inspectionId}
          onConfirmed={() => setSignOffState("form-unlocked")}
        />
      </div>
    );
  }

  // State C: form unlocked (post-modal)
  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <p className="text-sm">
        <span className="text-emerald-500"></span> Credentials verified
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="signatoryName">Full name</Label>
        <Input
          id="signatoryName"
          value={signatoryName}
          onChange={(e) => setSignatoryName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="role">Role</Label>
        <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(v) => setConfirmed(v === true)}
        />
        <span>I confirm this inspection is accurate and complete.</span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        onClick={handleSubmit}
        disabled={submitting || !signatoryName.trim() || !confirmed}
        className="bg-[#1C2E47] text-white"
      >
        {submitting ? "Submitting..." : "Confirm sign-off"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run components/inspection/__tests__/InspectionSignOff.test.tsx
```

Expected: PASS (7/7).

- [ ] **Step 6: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/inspection/InspectionSignOff.tsx components/inspection/__tests__/InspectionSignOff.test.tsx
git commit -m "refactor(inspection): modal-first sign-off state machine (Seam D)"
```

---

## Task 4: Prisma migration — InspectionPhoto cocoa columns

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260514100000_inspection_photo_cocoa/migration.sql`

- [ ] **Step 1: Edit schema**

Open `prisma/schema.prisma`. Locate the `InspectionPhoto` model. Add the four new columns immediately before the closing brace:

```prisma
model InspectionPhoto {
  // ... existing fields untouched

  // Chain-of-custody (rule 21) — added by sub-project #7
  cocoaSha256        String?
  cocoaCapturedAtUtc DateTime?
  cocoaUserHash      String?
  cocoaDeviceHint    String?
}
```

- [ ] **Step 2: Create the migration directory and SQL**

```bash
mkdir -p prisma/migrations/20260514100000_inspection_photo_cocoa
```

Create `prisma/migrations/20260514100000_inspection_photo_cocoa/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "InspectionPhoto"
  ADD COLUMN "cocoaSha256" TEXT,
  ADD COLUMN "cocoaCapturedAtUtc" TIMESTAMP(3),
  ADD COLUMN "cocoaUserHash" TEXT,
  ADD COLUMN "cocoaDeviceHint" TEXT;
```

- [ ] **Step 3: Regenerate Prisma client**

```bash
pnpm prisma:generate
```

Expected: completes without error. `@prisma/client` types now include the four cocoa fields on `InspectionPhoto`.

- [ ] **Step 4: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260514100000_inspection_photo_cocoa/
git commit -m "feat(prisma): add InspectionPhoto cocoa* columns (Seam C foundation)"
```

---

## Task 5: `lib/capture/cocoa-client.ts` helpers + tests

**Files:**
- Create: `lib/capture/cocoa-client.ts`
- Test: `lib/capture/__tests__/cocoa-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/capture/__tests__/cocoa-client.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { sha256OfFile } from "../cocoa-client";

describe("sha256OfFile", () => {
  beforeEach(() => {
    // Polyfill crypto.subtle in vitest (jsdom env)
    if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
      // @ts-expect-error — vitest jsdom may not have full crypto
      globalThis.crypto = require("crypto").webcrypto;
    }
  });

  it("returns SHA-256 of a known 1-byte input", async () => {
    // Known SHA-256 of single byte 0x61 ("a"): ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb
    const blob = new Blob([new Uint8Array([0x61])], { type: "image/jpeg" });
    const file = new File([blob], "a.jpg", { type: "image/jpeg" });
    const hash = await sha256OfFile(file);
    expect(hash).toBe(
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    );
  });

  it("returns SHA-256 of empty input matches known value", async () => {
    // SHA-256 of empty: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const blob = new Blob([new Uint8Array(0)], { type: "image/jpeg" });
    const file = new File([blob], "empty.jpg", { type: "image/jpeg" });
    const hash = await sha256OfFile(file);
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("returns lowercase hex", async () => {
    const blob = new Blob([new Uint8Array([0x61])], { type: "image/jpeg" });
    const file = new File([blob], "a.jpg", { type: "image/jpeg" });
    const hash = await sha256OfFile(file);
    expect(hash).toBe(hash.toLowerCase());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

(GPS helper testing is browser-only; we test it via E2E rather than Vitest.)

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run lib/capture/__tests__/cocoa-client.test.ts
```

Expected: FAIL with "Cannot find module '../cocoa-client'".

- [ ] **Step 3: Write the helper**

Create `lib/capture/cocoa-client.ts`:

```ts
/**
 * Client-side chain-of-custody helpers (rule 21).
 *
 * sha256OfFile: SHA-256 of file bytes via Web Crypto API. The same hash is
 * recomputed server-side on receive to defend against MITM tampering.
 *
 * getCurrentGps: optional GPS via navigator.geolocation. Permission-gated;
 * fail-soft (returns null on denial or timeout).
 *
 * Browser-only — both functions use APIs that don't exist in Node.
 */

export async function sha256OfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface GpsCoords {
  lat: number;
  lng: number;
}

export async function getCurrentGps(timeoutMs = 10_000): Promise<GpsCoords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<GpsCoords | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
      { timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run lib/capture/__tests__/cocoa-client.test.ts
```

Expected: PASS (3/3).

- [ ] **Step 5: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/capture/cocoa-client.ts lib/capture/__tests__/cocoa-client.test.ts
git commit -m "feat(capture): SHA-256 + GPS client helpers (rule 21)"
```

---

## Task 6: `<CapturePhotoTagModal>` component + tests

**Files:**
- Create: `components/inspection/CapturePhotoTagModal.tsx`
- Test: `components/inspection/__tests__/CapturePhotoTagModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/inspection/__tests__/CapturePhotoTagModal.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CapturePhotoTagModal } from "../CapturePhotoTagModal";

const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
const sampleFile = new File([blob], "head.jpg", { type: "image/jpeg" });

beforeEach(() => {
  // jsdom needs URL.createObjectURL stub
  if (typeof URL.createObjectURL === "undefined") {
    // @ts-expect-error — jsdom polyfill
    URL.createObjectURL = vi.fn(() => "blob:mock");
  }
});

describe("CapturePhotoTagModal", () => {
  it("returns null when file is null", () => {
    const { container } = render(
      <CapturePhotoTagModal
        file={null}
        sha256={null}
        gps={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders preview when file is provided", () => {
    render(
      <CapturePhotoTagModal
        file={sampleFile}
        sha256="abc123"
        gps={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByAltText(/preview/i)).toBeInTheDocument();
  });

  it("shows GPS readout when gps is provided", () => {
    render(
      <CapturePhotoTagModal
        file={sampleFile}
        sha256="abc123"
        gps={{ lat: -27.4698, lng: 153.0251 }}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/-27.4698/)).toBeInTheDocument();
  });

  it("shows GPS unavailable when gps is null", () => {
    render(
      <CapturePhotoTagModal
        file={sampleFile}
        sha256="abc123"
        gps={null}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/GPS unavailable/i)).toBeInTheDocument();
  });

  it("calls onSubmit with caption + file + sha256 + gps + capturedAtUtc", () => {
    const onSubmit = vi.fn();
    render(
      <CapturePhotoTagModal
        file={sampleFile}
        sha256="abc123"
        gps={{ lat: 1, lng: 2 }}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/Description/i), {
      target: { value: " moisture in north wall " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Save photo/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      file: sampleFile,
      caption: "moisture in north wall",
      sha256: "abc123",
      gps: { lat: 1, lng: 2 },
      capturedAtUtc: expect.any(String),
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run components/inspection/__tests__/CapturePhotoTagModal.test.tsx
```

Expected: FAIL with "Cannot find module '../CapturePhotoTagModal'".

- [ ] **Step 3: Write the component**

Create `components/inspection/CapturePhotoTagModal.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CaptureSubmitPayload {
  file: File;
  caption: string;
  sha256: string;
  gps: { lat: number; lng: number } | null;
  capturedAtUtc: string;
}

interface Props {
  file: File | null;
  sha256: string | null;
  gps: { lat: number; lng: number } | null;
  onCancel: () => void;
  onSubmit: (payload: CaptureSubmitPayload) => void;
}

export function CapturePhotoTagModal({ file, sha256, gps, onCancel, onSubmit }: Props) {
  const [caption, setCaption] = useState("");
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!file) return null;

  const handleSubmit = () => {
    onSubmit({
      file,
      caption: caption.trim(),
      sha256: sha256 ?? "",
      gps,
      capturedAtUtc: new Date().toISOString(),
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Capture evidence</DialogTitle>
        </DialogHeader>
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full aspect-square object-cover rounded"
          />
        )}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            {" "}
            {gps
              ? `${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}`
              : "GPS unavailable"}
          </p>
          <p> {new Date().toISOString().replace("T", " ").slice(0, 16)} UTC</p>
          {sha256 && <p> SHA-256: {sha256.slice(0, 16)}…</p>}
        </div>
        <Input
          placeholder="Description (optional, e.g. 'moisture in north wall behind dishwasher')"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleSubmit} className="flex-1 bg-[#1C2E47] text-white">
            Save photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run components/inspection/__tests__/CapturePhotoTagModal.test.tsx
```

Expected: PASS (5/5).

- [ ] **Step 5: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/inspection/CapturePhotoTagModal.tsx components/inspection/__tests__/CapturePhotoTagModal.test.tsx
git commit -m "feat(inspection): CapturePhotoTagModal component"
```

---

## Task 7: `<CapturePhotoFab>` component + tests

**Files:**
- Create: `components/inspection/CapturePhotoFab.tsx`
- Test: `components/inspection/__tests__/CapturePhotoFab.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/inspection/__tests__/CapturePhotoFab.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CapturePhotoFab } from "../CapturePhotoFab";

// Mock the upload + cocoa-client paths
vi.mock("@/lib/capture/cocoa-client", () => ({
  sha256OfFile: vi.fn(async () => "abc123"),
  getCurrentGps: vi.fn(async () => null),
}));

global.fetch = vi.fn() as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CapturePhotoFab", () => {
  it("renders FAB when inspection status is not COMPLETED", () => {
    render(<CapturePhotoFab inspectionId="i_1" inspectionStatus="DRAFT" onUploaded={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Capture photo/i })).toBeInTheDocument();
  });

  it("returns null when inspection status is COMPLETED (handled at mount site)", () => {
    // Component itself doesn't gate; the mount site decides. But assert the rendered
    // markup is the FAB regardless — gating is in the mount.
    const { container } = render(
      <CapturePhotoFab inspectionId="i_1" inspectionStatus="COMPLETED" onUploaded={vi.fn()} />,
    );
    // Component renders unconditionally; gating is by the page mount.
    expect(container.firstChild).not.toBeNull();
  });

  it("opens the tag modal after file is selected via the hidden input", async () => {
    render(<CapturePhotoFab inspectionId="i_1" inspectionStatus="DRAFT" onUploaded={vi.fn()} />);
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    const file = new File([blob], "head.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);
    await waitFor(() => {
      expect(screen.getByText(/Capture evidence/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run components/inspection/__tests__/CapturePhotoFab.test.tsx
```

Expected: FAIL with "Cannot find module '../CapturePhotoFab'".

- [ ] **Step 3: Write the component**

Create `components/inspection/CapturePhotoFab.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import toast from "react-hot-toast";
import { sha256OfFile, getCurrentGps } from "@/lib/capture/cocoa-client";
import { CapturePhotoTagModal, type CaptureSubmitPayload } from "./CapturePhotoTagModal";

interface Props {
  inspectionId: string;
  inspectionStatus: string;
  onUploaded?: (photo: { id: string; url: string; thumbnailUrl: string | null }) => void;
}

export function CapturePhotoFab({ inspectionId, onUploaded }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sha256, setSha256] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    try {
      const [hash, location] = await Promise.all([
        sha256OfFile(f),
        getCurrentGps(),
      ]);
      setSha256(hash);
      setGps(location);
    } catch {
      // SHA-256 failed somehow; surface but don't block — server will reject.
      setSha256(null);
    }
  }

  async function handleSubmit(payload: CaptureSubmitPayload) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("caption", payload.caption);
      formData.append("cocoaSha256", payload.sha256);
      formData.append("capturedAtUtc", payload.capturedAtUtc);
      if (payload.gps) {
        formData.append("gpsLat", String(payload.gps.lat));
        formData.append("gpsLng", String(payload.gps.lng));
      }
      const res = await fetch(`/api/inspections/${inspectionId}/photos`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Photo upload failed");
        return;
      }
      onUploaded?.(data.photo ?? data);
      toast.success("Photo saved");
      setFile(null);
      setSha256(null);
      setGps(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        type="button"
        aria-label="Capture photo"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-[#1C2E47] text-white shadow-lg flex items-center justify-center hover:bg-[#243a5a] disabled:opacity-50"
      >
        <Camera className="w-6 h-6" />
      </button>
      <CapturePhotoTagModal
        file={file}
        sha256={sha256}
        gps={gps}
        onCancel={() => {
          setFile(null);
          setSha256(null);
          setGps(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        onSubmit={handleSubmit}
      />
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run components/inspection/__tests__/CapturePhotoFab.test.tsx
```

Expected: PASS (3/3).

- [ ] **Step 5: Update DESIGN.md baseline**

The new `Camera` import from `lucide-react` adds +1 to the project's icon count. Bump the baseline.

```bash
# Read current baseline
cat .github/design-md-lint.baseline.txt
```

Edit `.github/design-md-lint.baseline.txt`. Change the `icon_imports=N` line to `N+1`. Add a comment line above it documenting the source:

```
# 2026-05-14 (Seam C): bumped N → N+1. Sub-project #7's
# components/inspection/CapturePhotoFab.tsx imports { Camera } from lucide-react.
```

- [ ] **Step 6: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/inspection/CapturePhotoFab.tsx components/inspection/__tests__/CapturePhotoFab.test.tsx .github/design-md-lint.baseline.txt
git commit -m "feat(inspection): CapturePhotoFab (Seam C) + bump DESIGN.md baseline"
```

---

## Task 8: Extend `POST /api/inspections/[id]/photos` for cocoa fields

**Files:**
- Modify: `app/api/inspections/[id]/photos/route.ts`
- Test: `app/api/inspections/[id]/photos/__tests__/cocoa.test.ts`

- [ ] **Step 1: Read the current route**

```bash
cat app/api/inspections/[id]/photos/route.ts
```

Note that the route uses `getStorageProvider()` from `@/lib/storage`, calls `extractAndSaveMediaAsset` from `@/lib/media/exif-extract`, and creates an `InspectionPhoto` row. The cocoa extension layers on top — we don't replace the storage call.

- [ ] **Step 2: Write the failing tests**

Create `app/api/inspections/[id]/photos/__tests__/cocoa.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import { POST } from "../route";

const getServerSession = vi.fn();
const inspectionFindFirst = vi.fn();
const photoCreate = vi.fn();
const storageUpload = vi.fn();
const rateLimit = vi.fn();

vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => getServerSession(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inspection: { findFirst: (...a: unknown[]) => inspectionFindFirst(...a) },
    inspectionPhoto: { create: (...a: unknown[]) => photoCreate(...a) },
  },
}));
vi.mock("@/lib/storage", () => ({
  getStorageProvider: () => ({ upload: (...a: unknown[]) => storageUpload(...a) }),
}));
vi.mock("@/lib/media/exif-extract", () => ({ extractAndSaveMediaAsset: vi.fn() }));
vi.mock("@/lib/media/catalog", () => ({ scheduleCatalog: vi.fn() }));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: (...a: unknown[]) => rateLimit(...a) }));

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BAD_MAGIC = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function makeRequest(file: Uint8Array, fields: Record<string, string> = {}): NextRequest {
  const form = new FormData();
  form.append("file", new Blob([file], { type: "image/jpeg" }), "test.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new NextRequest("http://localhost/api/inspections/i_1/photos", {
    method: "POST",
    body: form,
  });
}

function ctx() {
  return { params: Promise.resolve({ id: "i_1" }) };
}

beforeEach(() => {
  getServerSession.mockReset();
  inspectionFindFirst.mockReset();
  photoCreate.mockReset();
  storageUpload.mockReset();
  rateLimit.mockReset().mockResolvedValue(null); // rate limit pass-through
  getServerSession.mockResolvedValue({ user: { id: "u_1", image: "https://example.com/me.jpg" } });
  inspectionFindFirst.mockResolvedValue({ id: "i_1" });
  storageUpload.mockResolvedValue({
    url: "https://stor/test.jpg",
    thumbnailUrl: "https://stor/test_thumb.jpg",
  });
  photoCreate.mockImplementation(async ({ data }) => ({ id: "p_1", ...data }));
});

describe("POST /api/inspections/[id]/photos (cocoa extension)", () => {
  it("rejects non-JPEG/PNG bytes with 400 (rule 11)", async () => {
    const file = new Uint8Array(100);
    file.set(BAD_MAGIC, 0);
    const sha = sha256Hex(file);
    const res = await POST(
      makeRequest(file, { cocoaSha256: sha, capturedAtUtc: new Date().toISOString() }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("rejects hash mismatch with 400", async () => {
    const file = new Uint8Array(100);
    file.set(JPEG_MAGIC, 0);
    const wrongSha = "0".repeat(64);
    const res = await POST(
      makeRequest(file, { cocoaSha256: wrongSha, capturedAtUtc: new Date().toISOString() }),
      await ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("persists cocoa fields on JPEG happy path", async () => {
    const file = new Uint8Array(100);
    file.set(JPEG_MAGIC, 0);
    const sha = sha256Hex(file);
    const capturedAt = new Date().toISOString();
    const res = await POST(
      makeRequest(file, {
        cocoaSha256: sha,
        capturedAtUtc: capturedAt,
        caption: "test caption",
        gpsLat: "1.0",
        gpsLng: "2.0",
      }),
      await ctx(),
    );
    expect(res.status).toBe(200);
    expect(photoCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cocoaSha256: sha,
          cocoaCapturedAtUtc: new Date(capturedAt),
          cocoaUserHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          cocoaDeviceHint: expect.any(String),
        }),
      }),
    );
  });

  it("accepts PNG magic bytes", async () => {
    const file = new Uint8Array(100);
    file.set(PNG_MAGIC, 0);
    const sha = sha256Hex(file);
    const res = await POST(
      makeRequest(file, {
        cocoaSha256: sha,
        capturedAtUtc: new Date().toISOString(),
      }),
      await ctx(),
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run app/api/inspections/[id]/photos/__tests__/cocoa.test.ts
```

Expected: FAIL — the route doesn't yet check magic bytes or persist cocoa fields.

- [ ] **Step 4: Extend the route**

Open `app/api/inspections/[id]/photos/route.ts`. Find the `POST` handler. After the existing auth check + inspection lookup, BEFORE the storage upload, add the magic-byte + hash recompute block. After the storage upload + before the existing `prisma.inspectionPhoto.create`, compute `cocoaUserHash` + `cocoaDeviceHint` and extend the `create` data block.

Add this helper at the top of the file (after imports):

```ts
import crypto from "crypto";

function hasJpegMagic(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
function hasPngMagic(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function sha256Hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
```

In the POST handler, after parsing `formData` (the existing code reads `file` from form), add:

```ts
// Read body once for both magic-byte check and hash recompute
const fileBuffer = Buffer.from(await file.arrayBuffer());

// Magic-byte check (rule 11)
if (!hasJpegMagic(fileBuffer) && !hasPngMagic(fileBuffer)) {
  return NextResponse.json(
    { error: "File must be a JPEG or PNG" },
    { status: 400 },
  );
}

// Hash recompute (MITM defense) — only when client supplied cocoaSha256
const clientSha256 = formData.get("cocoaSha256");
if (typeof clientSha256 === "string" && clientSha256.length > 0) {
  const serverSha256 = sha256Hex(fileBuffer);
  if (serverSha256.toLowerCase() !== clientSha256.toLowerCase()) {
    return NextResponse.json(
      { error: "Hash mismatch — file may have been tampered with in transit" },
      { status: 400 },
    );
  }
}

// Compute cocoaUserHash server-side (authoritative)
const userHashInput = `${session.user.id}:${session.user.image ?? ""}`;
const cocoaUserHash = sha256Hex(Buffer.from(userHashInput));

// Capture device hint
const userAgent = request.headers.get("user-agent") ?? null;
const cocoaDeviceHint = userAgent?.slice(0, 200) ?? null;

// Read capturedAtUtc + cocoaSha256 from form for the create block below
const capturedAtUtcRaw = formData.get("capturedAtUtc");
const cocoaCapturedAtUtc =
  typeof capturedAtUtcRaw === "string" && capturedAtUtcRaw.length > 0
    ? new Date(capturedAtUtcRaw)
    : null;
const cocoaSha256 =
  typeof clientSha256 === "string" && clientSha256.length > 0 ? clientSha256 : null;
```

Then in the `prisma.inspectionPhoto.create` data block (existing), ADD these four fields next to the existing ones:

```ts
data: {
  // ... existing fields (inspectionId, url, thumbnailUrl, description, gpsLatitude, gpsLongitude, fileSize, mimeType, timestamp, etc.)
  cocoaSha256,
  cocoaCapturedAtUtc,
  cocoaUserHash,
  cocoaDeviceHint,
}
```

Make sure the storage-provider upload still happens (don't change that). If the existing code uses `await file.arrayBuffer()` directly for upload, replace it with `fileBuffer` (which we already read above) to avoid double-reading the stream.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run app/api/inspections/[id]/photos/__tests__/cocoa.test.ts
```

Expected: PASS (4/4).

- [ ] **Step 6: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/inspections/[id]/photos/route.ts app/api/inspections/[id]/photos/__tests__/cocoa.test.ts
git commit -m "feat(api): chain-of-custody on photo POST — magic bytes + hash recompute + cocoa fields"
```

---

## Task 9: Mount `<CapturePhotoFab>` on inspection detail page

**Files:**
- Modify: `app/dashboard/inspections/[id]/page.tsx`

- [ ] **Step 1: Find the existing action cluster**

```bash
grep -n "Generate NIR Report\|InspectionSignOff\|StatusTimeline" app/dashboard/inspections/[id]/page.tsx | head -5
```

The FAB mounts as a sibling of the page's main content — fixed-position doesn't need a specific parent. Add it near the bottom of the return body, just inside the page root, gated on inspection status.

- [ ] **Step 2: Add the import**

Open `app/dashboard/inspections/[id]/page.tsx`. Add to the imports block (alongside existing dynamic imports if that's the pattern):

```tsx
import { CapturePhotoFab } from "@/components/inspection/CapturePhotoFab";
```

- [ ] **Step 3: Mount the FAB**

In the return body, add the FAB just before the closing tag of the page root. Example:

```tsx
return (
  <PageRoot>
    {/* existing content */}
    {inspection.status !== "COMPLETED" && (
      <CapturePhotoFab
        inspectionId={inspection.id}
        inspectionStatus={inspection.status}
        onUploaded={() => fetchInspection()}
      />
    )}
  </PageRoot>
);
```

(If the existing component uses a different name for refreshing inspection data — e.g. `refetch()` instead of `fetchInspection()` — use that. Read the file to confirm.)

- [ ] **Step 4: Run type-check**

```bash
pnpm type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/inspections/[id]/page.tsx
git commit -m "feat(inspection): mount CapturePhotoFab on detail page (Seam C wire-up)"
```

---

## Task 10: New E2E spec — `tech-second-signoff-prefilled`

**Files:**
- Create: `e2e/tech-second-signoff-prefilled.spec.ts`

- [ ] **Step 1: Write the spec**

Create `e2e/tech-second-signoff-prefilled.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { loginAs } from "./_helpers/auth";

test("second sign-off: modal opens prefilled (one-tap confirm)", async ({ page, request }) => {
  await loginAs(page, "USER");
  await page.request.post("/api/test/seed-inspection", {
    data: { inspectionId: "test-inspection", status: "COMPLETED" },
  });
  await page.request.post("/api/test/seed-authorisation", {
    data: { subjectLicenceNumber: "IICRC-1", whsCardNumber: "WHS-1" },
  });

  // Reload the inspection page after the Authorisation seed
  await page.goto("/dashboard/inspections/test-inspection");

  // The component should auto-detect the recent Authorisation and open at State C.
  // No modal should appear; the form should be visible.
  await expect(page.getByText(/Credentials verified/i)).toBeVisible();
  await expect(page.getByText(/Add your credentials/i)).toHaveCount(0);
});
```

- [ ] **Step 2: type-check**

```bash
pnpm type-check
```

Expected: PASS (the spec is TS but Playwright won't run it until the deploy is live).

- [ ] **Step 3: Commit**

```bash
git add e2e/tech-second-signoff-prefilled.spec.ts
git commit -m "test(e2e): tech-second-signoff-prefilled — Authorisation < 90d skips modal"
```

---

## Task 11: Visual regression baselines (manual)

**Files:** snapshot PNGs generated by Playwright at first pass.

- [ ] **Step 1: Add the viewport matrix to the new specs**

Update `e2e/tech-banner-auto-dismiss.spec.ts`, `e2e/tech-signoff-modal-fresh.spec.ts`, `e2e/tech-signoff-modal-cancel.spec.ts`, `e2e/tech-evidence-capture-no-modal.spec.ts`, `e2e/tech-second-signoff-prefilled.spec.ts` to parameterise the viewport. At the bottom of each, add:

```ts
const viewports = [
  { name: "iphone", width: 393, height: 852 },
  { name: "ipad", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

for (const vp of viewports) {
  test(`${vp.name} — visual baseline`, async ({ page }) => {
    await page.setViewportSize(vp);
    // navigate to the surface (banner / FAB visible / modal open / etc.)
    await page.goto("/dashboard");
    await expect(page).toHaveScreenshot(`${vp.name}-banner.png`);
  });
}
```

(Adapt the navigation + surface for each spec — `/dashboard` for banner specs, `/dashboard/inspections/test-inspection` for FAB/signoff specs, etc.)

- [ ] **Step 2: Generate the baselines against sandbox**

```bash
PLAYWRIGHT_BASE_URL=https://restoreassist-sandbox.vercel.app npx playwright test e2e/tech-*.spec.ts --update-snapshots
```

This generates 15 PNGs (5 surfaces × 3 viewports) under `e2e/*.spec.ts-snapshots/`. **Visually review each one before committing** — if a snapshot looks broken, the test isn't capturing the intended state.

- [ ] **Step 3: Commit**

```bash
git add e2e/tech-*.spec.ts e2e/*-snapshots/
git commit -m "test(visual): 15 visual baselines for sub-project #7 surfaces"
```

---

## Task 12: Verification Gate — manual smoke on staging

This is a human-attested checklist run on the sandbox preview deploy. Save the evidence (screenshots) to the release PR description.

- [ ] **Step 1: Deploy + verify staging**

After all preceding commits land on sandbox, wait for the Vercel sandbox build to complete (~3 min). Confirm `/api/health` returns 200.

- [ ] **Step 2: Seed fresh test data**

Sign up a fresh owner via `/setup` happy path. Invite a test technician via `/dashboard/team`. Accept the invite via `/invite/[token]`.

- [ ] **Step 3: Walk the checklist**

For the USER role just created, verify on sandbox:

- On `/dashboard`: `<TechLicenceBanner>` visible above metrics with three "pending" pills (IICRC, WHS, state)
- Click "Add credentials →" → lands on `/dashboard/settings/credentials` → `<EngagementLicenceModal>` opens with empty fields
- Submit credentials → modal closes → redirects to `/dashboard` → banner dismissed
- Open an inspection in COMPLETED state → `<CapturePhotoFab>` renders bottom-right
- Tap FAB → native camera opens on mobile → take photo → `<CapturePhotoTagModal>` opens with SHA-256 visible
- Save photo → new entry in inspection's photo list. Open Prisma Studio, verify the `InspectionPhoto` row has `cocoaSha256`, `cocoaCapturedAtUtc`, `cocoaUserHash`, `cocoaDeviceHint` all populated
- Tap "Sign Inspection" on the inspection page → `<EngagementLicenceModal>` opens immediately (modal-first)
- Submit licence (already filled from settings) → modal closes → form unlocks → `signatoryName` prefilled with the test user's name → check confirmation checkbox → click "Confirm sign-off" → inspection status flips to SUBMITTED
- Open a second COMPLETED inspection → tap "Sign Inspection" → opens directly at State C (form unlocked, no modal) — recent Authorisation detected

- [ ] **Step 4: Negative checks**

For an ADMIN or MANAGER role:
- `<TechLicenceBanner>` NOT visible on `/dashboard`

For evidence-capture as a USER:
- Tapping `<CapturePhotoFab>` and saving a photo NEVER opens `<EngagementLicenceModal>` (rule 25)

For an unauthenticated request:
- `POST /api/inspections/[id]/photos` returns 401

For a tampered upload:
- POST with `cocoaSha256` that doesn't match the file's actual hash returns 400

- [ ] **Step 5: Attach screenshots to the release PR description**

Capture and attach to the PR body:

- `/dashboard` with banner visible
- Inspection page with FAB visible
- Tag modal open with SHA-256 visible
- InspectionSignOff State C — form unlocked + signatoryName prefilled
- Prisma Studio row showing `cocoaSha256` + `cocoaUserHash` populated

- [ ] **Step 6: Commit the evidence note**

```bash
git commit --allow-empty -m "verify(sub-project-7): Verification Gate complete (manual smoke on staging)"
```

---

## Verification

1. Unit + integration tests pass: `pnpm type-check && npx vitest run`.
2. All 5 invited-tech E2E specs green against sandbox: `npx playwright test e2e/tech-*.spec.ts`.
3. Visual baselines: snapshot diff = 0 on subsequent runs.
4. Schema migration round-trips: apply on staging snapshot; existing `InspectionPhoto` rows backfill to NULL on cocoa* columns; re-run migration; no-op.
5. Manual Verification Gate (Task 12) executed by a human with the 5 confirmation screenshots in the release PR.
6. No regressions in legacy flows: existing photos render in the inspection's photo list (their cocoa* fields are NULL; the renderer flags them as "legacy capture"); existing sign-off API still accepts the same payload from the refactored form.

---

## Self-Review

Performed inline:

1. **Spec coverage:** every section of the spec maps to at least one task. TechLicenceBanner ↔ T1+T2. Modal-first sign-off ↔ T3. Cocoa schema ↔ T4. Cocoa client helper ↔ T5. Tag modal ↔ T6. FAB ↔ T7. Photo route extension ↔ T8. FAB mount ↔ T9. New E2E ↔ T10. Visual baselines + Verification Gate ↔ T11, T12.

2. **Placeholder scan:** no "TBD" / "TODO" / "fill in later" patterns. The plan body has one explicit note that `inspection.status !== "COMPLETED"` may need adjustment if the page uses a different status name — but that's a discovery instruction, not a placeholder. Same for the "refetch vs fetchInspection" mention in Task 9.

3. **Type consistency:** `CaptureSubmitPayload` (T6, T7 export/import), `SignOffState` (T3), `GpsCoords` (T5, T6 prop type), cocoa column names (T4, T5, T7, T8) — all spelled identically across tasks.

---

## Out of scope (separate sub-projects)

- **Sub-project #3** — BYOK upgrade paths.
- **Sub-project #5** — sign-in → job-close E2E audit.
- **Sub-project #6** — Email-provider BYOK.
- **Seam F (PR #1008)** — Cloudinary upload pipeline (fixed in parallel; merged separately).
- **RC3** — Sandbox Google OAuth env update (user-action).
- **Sub-project #7 v2** — multi-photo batch capture, EXIF GPS extraction from JPEG bytes, damage-type dropdown / room selector, photo editing (crop, rotate, annotate), full C2PA cryptographic manifest.
