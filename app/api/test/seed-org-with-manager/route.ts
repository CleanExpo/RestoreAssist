/**
 * TEST-ONLY route — seeds an Organization + manager User and, by default, a
 * UserInvite for the invited-technician E2E specs. Returns the invite token so
 * Playwright can navigate to /invite/<token>.
 *
 * HARD GUARD — returns 404 while testHelpersBlocked() (see ../_helpers).
 *
 * Body: a JSON object, every key optional. Anything else answers 400
 * {error, field} before any database call: an unparseable or non-object body,
 * an unknown key, or a value of the wrong type.
 *   - managerEmail    (non-empty string) — manager User.email. Defaults to a
 *                      unique value. An existing email is refused (500 P2002):
 *                      the seed never grants seats to an existing account.
 *   - expiresInDays   (finite number)    — invite TTL. Use -1 to test the expired branch.
 *   - markUsed        (boolean)          — sets usedAt to now to test the already-used branch.
 *   - technicianSeats (integer 0-50)     — when present, also creates a READY
 *                      Workspace owned by the manager plus an active
 *                      TECHNICIAN_SEATS FeatureEntitlement with that many seats.
 *                      Absent means no Workspace at all.
 *   - createInvite    (boolean)          — false skips the invite. The default
 *                      invite is a live USER invite, so it uses one seat.
 *
 * Every write runs in one transaction; a failure answers 500 {error, code}
 * and commits nothing.
 *
 * Returns: { token: string | null, inviteeEmail: string | null,
 *            managerEmail: string, organizationId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { PG_POOL_CONNECTION_TIMEOUT_MS } from "@/lib/prisma-pool-config";
import { testHelpersBlocked } from "../_helpers";

interface SeedBody {
  managerEmail?: string;
  expiresInDays?: number;
  markUsed?: boolean;
  technicianSeats?: number;
  createInvite?: boolean;
}

const MAX_TECHNICIAN_SEATS = 50;

const VALIDATORS: Record<keyof SeedBody, (v: unknown) => boolean> = {
  managerEmail: (v) => typeof v === "string" && v.length > 0,
  expiresInDays: (v) => typeof v === "number" && Number.isFinite(v),
  markUsed: (v) => typeof v === "boolean",
  technicianSeats: (v) =>
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= 0 &&
    v <= MAX_TECHNICIAN_SEATS,
  createInvite: (v) => typeof v === "boolean",
};

function badRequest(error: string, field: string) {
  return NextResponse.json({ error, field }, { status: 400 });
}

export async function POST(req: NextRequest) {
  // ALLOW_TEST_HELPERS=true is required everywhere. The second key,
  // ALLOW_TEST_HELPERS_IN_PROD_ENV=true, is only consulted when
  // VERCEL_ENV=production (see testHelpersBlocked in ../_helpers). A host that
  // does not set VERCEL_ENV, such as DigitalOcean, is therefore guarded by the
  // single key ALLOW_TEST_HELPERS being absent.
  if (testHelpersBlocked()) {
    return NextResponse.json(
      { error: "Test helpers are not enabled in this environment" },
      { status: 404 },
    );
  }

  // Validate the whole body before any database call. A malformed body used to
  // fall back to {} and seed default rows.
  let parsed: unknown;
  try {
    parsed = JSON.parse(await req.text());
  } catch {
    return badRequest("Body must be valid JSON", "body");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return badRequest("Body must be a JSON object", "body");
  }
  for (const [key, value] of Object.entries(parsed)) {
    // Own-property check, so a key such as "toString" cannot reach an
    // inherited Object.prototype member and pass as a validator.
    if (!Object.hasOwn(VALIDATORS, key)) {
      return badRequest(`Unknown key: ${key}`, key);
    }
    if (!VALIDATORS[key as keyof SeedBody](value))
      return badRequest(`Invalid value for ${key}`, key);
  }
  const body = parsed as SeedBody;

  const stamp = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const managerEmail = body.managerEmail ?? `mgr-${stamp}@test.local`;
  const createInvite = body.createInvite !== false;
  const inviteeEmail = createInvite ? `tech-${stamp}@test.local` : null;
  const token = createInvite ? crypto.randomBytes(24).toString("hex") : null;
  const expiresInDays = body.expiresInDays ?? 7;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const usedAt = body.markUsed === true ? new Date() : null;
  const technicianSeats = body.technicianSeats;

  try {
    const organizationId = await prisma.$transaction(
      async (tx) => {
        // create, never upsert: a reused managerEmail must fail (P2002), so a
        // seed can never grant seats to an account that already exists.
        const manager = await tx.user.create({
          data: {
            name: `Test Manager ${stamp}`,
            email: managerEmail,
            role: "ADMIN",
          },
          select: { id: true },
        });

        const org = await tx.organization.create({
          data: {
            name: `Test Org ${stamp}`,
            ownerId: manager.id,
            setupCompletedAt: new Date(),
          },
          select: { id: true },
        });

        await tx.user.update({
          where: { id: manager.id },
          data: { organizationId: org.id },
        });

        // 0 is a real value here: a READY workspace with 0 seats.
        if (technicianSeats !== undefined) {
          const workspace = await tx.workspace.create({
            data: {
              ownerId: manager.id,
              status: "READY",
              name: `Test Workspace ${stamp}`,
              slug: `e2e-${stamp}`,
            },
            select: { id: true },
          });
          await tx.featureEntitlement.create({
            data: {
              workspaceId: workspace.id,
              sku: "TECHNICIAN_SEATS",
              active: true,
              seats: technicianSeats,
            },
          });
        }

        if (token !== null && inviteeEmail !== null) {
          await tx.userInvite.create({
            data: {
              token,
              email: inviteeEmail,
              role: "USER",
              organizationId: org.id,
              createdById: manager.id,
              managedById: manager.id,
              expiresAt,
              usedAt,
            },
          });
        }

        return org.id;
      },
      { maxWait: PG_POOL_CONNECTION_TIMEOUT_MS, timeout: 30_000 },
    );

    return NextResponse.json({
      token,
      inviteeEmail,
      managerEmail,
      organizationId,
    });
  } catch (err) {
    const e = err as {
      code?: unknown;
      message?: unknown;
      meta?: { target?: unknown };
    };
    const code = typeof e?.code === "string" ? e.code : "UNKNOWN";
    console.error(
      "[test-helper] seed-org transaction failed",
      code,
      e?.message,
      e?.meta?.target,
    );
    return NextResponse.json(
      { error: "Seed transaction did not commit", code },
      { status: 500 },
    );
  }
}
