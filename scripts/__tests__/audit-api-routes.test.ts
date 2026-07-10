import { describe, expect, it } from "vitest";
import { auditApiRoute } from "../audit-api-routes";

describe("auditApiRoute", () => {
  it("flags non-exempt routes without session auth", () => {
    const findings = auditApiRoute(
      "app/api/reports/route.ts",
      "export async function GET() { return Response.json({ ok: true }); }",
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "api-auth-required",
          severity: "error",
        }),
      ]),
    );
  });

  it("requires database role revalidation on admin routes", () => {
    const findings = auditApiRoute(
      "app/api/admin/users/route.ts",
      "const session = await getServerSession(authOptions);",
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "admin-db-role-revalidation",
          severity: "error",
        }),
      ]),
    );
  });

  it("accepts auth, bounded findMany, and Prisma.sql tagged raw SQL", () => {
    const findings = auditApiRoute(
      "app/api/clients/search/route.ts",
      `
        const session = await getServerSession(authOptions);
        await prisma.client.findMany({
          where: { userId: session.user.id },
          select: { id: true },
          take: 20
        });
        await prisma.$queryRaw(Prisma.sql\`SELECT 1\`);
      `,
    );

    expect(findings).toHaveLength(0);
  });

  it("accepts bounded findMany calls with large select/include blocks", () => {
    const findings = auditApiRoute(
      "app/api/contractors/route.ts",
      `
        const session = await getServerSession(authOptions);
        await prisma.contractorProfile.findMany({
          where: { isPubliclyVisible: true },
          include: {
            user: {
              select: {
                businessName: true,
                businessLogo: true,
                businessAddress: true,
              },
            },
            certifications: {
              where: { verificationStatus: "VERIFIED" },
              select: {
                certificationType: true,
                certificationName: true,
              },
            },
            serviceAreas: {
              where: { isActive: true },
              select: {
                postcode: true,
                suburb: true,
                state: true,
              },
              take: 5,
            },
          },
          orderBy: [
            { isVerified: "desc" },
            { averageRating: "desc" },
            { totalReviews: "desc" },
          ],
          skip: 0,
          take: 20,
        });
      `,
    );

    expect(findings).toHaveLength(0);
  });

  it("flags an unbounded findMany (no take) as prisma-findmany-take", () => {
    const findings = auditApiRoute(
      "app/api/reports/list/route.ts",
      `
        const session = await getServerSession(authOptions);
        await prisma.report.findMany({
          where: { userId: session.user.id },
          select: { id: true },
        });
      `,
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "prisma-findmany-take",
          severity: "warning",
        }),
      ]),
    );
  });

  it("exempts an unbounded findMany annotated with // ra-query-ok", () => {
    const findings = auditApiRoute(
      "app/api/reports/list/route.ts",
      `
        const session = await getServerSession(authOptions);
        // ra-query-ok: fixed small set of jurisdiction codes
        await prisma.jurisdiction.findMany({
          where: { active: true },
          select: { code: true },
        });
      `,
    );

    expect(
      findings.some((finding) => finding.rule === "prisma-findmany-take"),
    ).toBe(false);
  });

  it("flags error.message JSON responses", () => {
    const findings = auditApiRoute(
      "app/api/clients/route.ts",
      `
        const session = await getServerSession(authOptions);
        catch (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      `,
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "generic-500-body",
          severity: "error",
        }),
      ]),
    );
  });

  it("accepts generic 500 fallback with non-500 service messages", () => {
    const findings = auditApiRoute(
      "app/api/progress/[reportId]/route.ts",
      `
        const session = await getServerSession(authOptions);
        const status = result.code === "NOT_FOUND" ? 404 : 500;
        return NextResponse.json(
          { error: status === 500 ? "Internal server error" : result.message },
          { status },
        );
      `,
    );

    expect(findings).toHaveLength(0);
  });

  it("marks public token routes as exception candidates", () => {
    const findings = auditApiRoute(
      "app/api/portal/[token]/route.ts",
      "export async function GET() { return Response.json({ ok: true }); }",
    );

    expect(findings).toEqual([
      expect.objectContaining({
        rule: "public-token-route-review",
        exception: true,
        severity: "warning",
      }),
    ]);
  });

  it("exempts headless internal bearer-token routes from api-auth-required", () => {
    const findings = auditApiRoute(
      "app/api/internal/send-reengagement/route.ts",
      "export async function POST() { return Response.json({ ok: true }); }",
    );

    expect(findings.some((f) => f.rule === "api-auth-required")).toBe(false);
  });

  it("classifies capture token routes as public-token (not api-auth-required)", () => {
    const findings = auditApiRoute(
      "app/api/capture/[token]/sketch/route.ts",
      "export async function POST() { return Response.json({ ok: true }); }",
    );

    expect(findings.some((f) => f.rule === "api-auth-required")).toBe(false);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "public-token-route-review",
          exception: true,
          severity: "warning",
        }),
      ]),
    );
  });

  it("accepts test helpers with an explicit ALLOW_TEST_HELPERS hard guard", () => {
    const findings = auditApiRoute(
      "app/api/test/sign-in-as/route.ts",
      `
        export async function POST() {
          if (process.env.ALLOW_TEST_HELPERS !== "true") {
            return Response.json({ error: "disabled" }, { status: 404 });
          }
          return Response.json({ ok: true });
        }
      `,
    );

    expect(findings).toHaveLength(0);
  });
});
