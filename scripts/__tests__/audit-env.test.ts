import { describe, expect, it } from "vitest";
import { auditEnv } from "../audit-env";

describe("auditEnv", () => {
  const baseFiles = {
    ".env.example": `
      DATABASE_URL=
      NEXTAUTH_SECRET=
      NEXTAUTH_URL=
      GOOGLE_CLIENT_ID=
      GOOGLE_CLIENT_SECRET=
      STRIPE_WEBHOOK_SECRET=
      SUPABASE_SERVICE_ROLE_KEY=
    `,
  };

  it("fails on executable TLS verification bypass assignments", () => {
    const result = auditEnv({
      files: {
        ...baseFiles,
        "scripts/build.sh": "export NODE_TLS_REJECT_UNAUTHORIZED=0",
      },
    });

    expect(result.errorCount).toBe(1);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "scripts/build.sh",
          rule: "forbidden-env-assignment",
          severity: "error",
        }),
      ]),
    );
  });

  it("warns on comment-only TLS bypass references", () => {
    const result = auditEnv({
      files: {
        ...baseFiles,
        "app/api/ascora/connect/route.ts":
          "// Set NODE_TLS_REJECT_UNAUTHORIZED=0 for local debugging only",
      },
    });

    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(1);
    expect(result.findings[0]).toEqual(
      expect.objectContaining({
        rule: "forbidden-env-documentation",
        severity: "warning",
      }),
    );
  });

  it("fails when required env vars are missing from .env.example", () => {
    const result = auditEnv({
      files: {
        ".env.example": "DATABASE_URL=\nNEXTAUTH_SECRET=\n",
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "missing-required-env-example",
          file: ".env.example",
          severity: "error",
          reason: expect.stringContaining("STRIPE_WEBHOOK_SECRET"),
        }),
      ]),
    );
  });

  it("fails when service-role credentials use public env names", () => {
    const result = auditEnv({
      files: {
        ...baseFiles,
        ".env.example": `${baseFiles[".env.example"]}\nNEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=`,
      },
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "public-service-role-env",
          file: ".env.example",
          severity: "error",
        }),
      ]),
    );
  });
});
