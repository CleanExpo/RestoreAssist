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
});
