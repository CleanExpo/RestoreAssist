// @vitest-environment jsdom
/**
 * RA-8533 — the Contents form's submitted body must satisfy the
 * contents-pack-out route's schema.
 *
 * The test drives the real form, captures the body it POSTs, and hands that
 * exact body to the real route handler (auth, idempotency and the database
 * are mocked). Before RA-8533 the form sent `itemName` / `condition`, the
 * route required `itemDescription`, and this test got a 400 instead of a 201.
 *
 * Selectors are deliberately generic (first text box, every select set to its
 * first real option) so the same test runs against the old form and fails
 * there for the contract reason, not for a missing label.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextRequest } from "next/server";

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

// ── Route dependencies ───────────────────────────────────────────────────────
const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
  id: "item-1",
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  ...data,
}));
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "user-1" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: async () => ({
        role: "ADMIN",
        organizationId: null,
        organizationLeftAt: null,
        organizationLeftId: null,
        organization: null,
      }),
    },
  },
}));
vi.mock("@/lib/idempotency", () => ({
  withIdempotency: (req: NextRequest, _u: string, fn: (b: string) => unknown) =>
    req.text().then((b) => fn(b)),
}));
vi.mock("@/lib/auth/assert-tenancy", () => ({
  assertInspectionTenancy: vi.fn(async () => ({ ok: true })),
  resolveInspectionWrite: vi.fn(async () => ({
    ok: true,
    data: { inspectionManyWhere: { id: "insp_1" } },
  })),
  writeWithinInspectionScope: (
    _w: unknown,
    _d: unknown,
    fn: (tx: unknown) => unknown,
  ) => fn({ contentsPackOutItem: { create } }),
}));

import { POST } from "@/app/api/inspections/[id]/contents-pack-out/route";
import NIRClaimAssessmentPanel from "../NIRClaimAssessmentPanel";

async function postToRoute(body: string) {
  const req = new NextRequest(
    "http://localhost/api/inspections/insp_1/contents-pack-out",
    { method: "POST", body, headers: { "Content-Type": "application/json" } },
  );
  return POST(req, { params: Promise.resolve({ id: "insp_1" }) });
}

describe("Contents form → contents-pack-out route contract (RA-8533)", () => {
  let posted: string[];

  beforeEach(() => {
    posted = [];
    create.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST" && url.endsWith("/contents-pack-out")) {
          posted.push(init.body as string);
          // Answer with whatever the real route answers for this body.
          const res = await postToRoute(init.body as string);
          return res;
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function fillAndSubmit() {
    render(
      <NIRClaimAssessmentPanel
        inspectionId="insp_1"
        lockedClaimType="CONTENTS"
      />,
    );
    const heading = await screen.findByText(/Add Pack-Out Item/i);
    const form = heading.parentElement as HTMLElement;
    const [description] = within(form).getAllByRole("textbox");
    fireEvent.change(description, {
      target: { value: "Samsung front-loader washing machine" },
    });
    for (const select of within(form).getAllByRole("combobox")) {
      const first = (select as HTMLSelectElement).options[1];
      fireEvent.change(select, { target: { value: first.value } });
    }
    fireEvent.click(within(form).getByRole("button", { name: /add item/i }));
    await waitFor(() => expect(posted).toHaveLength(1));
    return JSON.parse(posted[0]) as Record<string, unknown>;
  }

  it("the body the form submits is accepted by the route with 201", async () => {
    const body = await fillAndSubmit();
    const res = await postToRoute(JSON.stringify(body));
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalled();
    const saved = create.mock.calls[0][0].data;
    expect(saved.itemDescription).toBe("Samsung front-loader washing machine");
  });

  it("sends only fields the route's schema defines", async () => {
    const body = await fillAndSubmit();
    const { packOutItemSchema } =
      await import("@/lib/contents/pack-out-item-schema");
    const known = Object.keys(packOutItemSchema.shape);
    expect(Object.keys(body).filter((k) => !known.includes(k))).toEqual([]);
    expect(packOutItemSchema.strict().safeParse(body).success).toBe(true);
  });

  it("shows the saved record's real fields in the item list", async () => {
    await fillAndSubmit();
    expect(
      await screen.findByText("Samsung front-loader washing machine"),
    ).toBeInTheDocument();
  });
});
