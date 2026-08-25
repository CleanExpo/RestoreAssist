import { describe, expect, it } from "vitest";

import { verifyRlsRows, type LiveRlsPolicy, type LiveRlsRow } from "../verify-live-rls";

const models = new Map([
  ["Client", "Client"],
  ["PortalContent", "PortalContent"],
  ["PilotBudgetReservation", "PilotBudgetReservation"],
  ["DatabaseInstanceSentinel", "DatabaseInstanceSentinel"],
  ["WebhookEvent", "WebhookEvent"],
]);

function rows(overrides: Partial<Record<string, Partial<LiveRlsRow>>> = {}): LiveRlsRow[] {
  const scoped = (command: string): LiveRlsPolicy => ({
    name: `ra4956_${command.toLowerCase()}`,
    command,
    permissive: "PERMISSIVE",
    roles: ["authenticated"],
    using_expression: command === "INSERT" ? null : `("userId" = (auth.uid())::text)`,
    check_expression: ["INSERT", "UPDATE"].includes(command)
      ? `("userId" = (auth.uid())::text)`
      : null,
  });
  return [
    {
      table_name: "Client",
      rls_enabled: true,
      policies: ["SELECT", "INSERT", "UPDATE", "DELETE"].map(scoped),
    },
    {
      table_name: "PilotBudgetReservation",
      rls_enabled: true,
      policies: [],
    },
    {
      table_name: "DatabaseInstanceSentinel",
      rls_enabled: true,
      policies: [],
    },
    { table_name: "WebhookEvent", rls_enabled: true, policies: [] },
  ].map((row) => ({ ...row, ...(overrides[row.table_name] ?? {}) }));
}

describe("live RLS parity", () => {
  it("accepts protected tenant tables and deliberate service-only default deny", () => {
    expect(verifyRlsRows(models, rows())).toEqual([]);
  });

  it("accepts the pilot budget ledger with RLS enabled and zero client policies", () => {
    expect(
      verifyRlsRows(
        new Map([["PilotBudgetReservation", "PilotBudgetReservation"]]),
        [{
          table_name: "PilotBudgetReservation",
          rls_enabled: true,
          policies: [],
        }],
      ),
    ).toEqual([]);
  });

  it("accepts only the intentional database identity sentinel as service-only default deny", () => {
    expect(
      verifyRlsRows(
        new Map([["DatabaseInstanceSentinel", "DatabaseInstanceSentinel"]]),
        [{
          table_name: "DatabaseInstanceSentinel",
          rls_enabled: true,
          policies: [],
        }],
      ),
    ).toEqual([]);

    expect(
      verifyRlsRows(
        new Map([["DatabaseInstanceSentinel", "DatabaseInstanceSentinel"]]),
        [{
          table_name: "DatabaseInstanceSentinel",
          rls_enabled: true,
          policies: [{
            name: "opened",
            command: "SELECT",
            permissive: "PERMISSIVE",
            roles: ["authenticated"],
            using_expression: "true",
            check_expression: null,
          }],
        }],
      ),
    ).toContain("DatabaseInstanceSentinel: default-deny table unexpectedly has a live policy");
  });

  it("enforces zero live policies on every new service-only security boundary", () => {
    const serviceOnlyTables = [
      "UserInvite",
      "EmailConnection",
      "EmailAudit",
      "OAuthStateNonce",
      "OutboundEmailDelivery",
      "MediaCleanupTask",
      "NativeAuthNonce",
      "PilotGenerationReceipt",
      "PilotNoChargeApproval",
    ];

    for (const table of serviceOnlyTables) {
      const tableModels = new Map([[table, table]]);
      expect(
        verifyRlsRows(tableModels, [{
          table_name: table,
          rls_enabled: true,
          policies: [],
        }]),
        `${table} should accept RLS-on with zero policies`,
      ).toEqual([]);

      expect(
        verifyRlsRows(tableModels, [{
          table_name: table,
          rls_enabled: true,
          policies: [{
            name: "opened",
            command: "SELECT",
            permissive: "PERMISSIVE",
            roles: ["authenticated"],
            using_expression: "true",
            check_expression: null,
          }],
        }]),
        `${table} must reject every client policy`,
      ).toContain(`${table}: default-deny table unexpectedly has a live policy`);
    }
  });

  it("rejects a tenant-scoped table with RLS enabled but zero policies", () => {
    expect(
      verifyRlsRows(
        new Map([["Client", "Client"]]),
        [{ table_name: "Client", rls_enabled: true, policies: [] }],
      ).join("\n"),
    ).toMatch(/Client: required SELECT policy arm is missing/);
  });

  it("rejects a dropped live tenant policy", () => {
    const liveRows = rows();
    liveRows[0].policies = liveRows[0].policies.filter((policy) => policy.command !== "DELETE");
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /Client: required DELETE policy arm is missing/,
    );
  });

  it("rejects four permissive policies with semantically unscoped predicates", () => {
    const liveRows = rows();
    liveRows[0].policies = liveRows[0].policies.map((policy) => ({
      ...policy,
      using_expression: policy.command === "INSERT" ? null : "(auth.uid() IS NOT NULL)",
      check_expression: ["INSERT", "UPDATE"].includes(policy.command)
        ? "(auth.uid() IS NOT NULL)"
        : null,
    }));
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /no recognised tenant-scoped/,
    );
  });

  it("rejects auth.uid compared only with itself", () => {
    const liveRows = rows();
    liveRows[0].policies = liveRows[0].policies.map((policy) => ({
      ...policy,
      using_expression: policy.command === "INSERT" ? null : "auth.uid() = auth.uid()",
      check_expression: ["INSERT", "UPDATE"].includes(policy.command)
        ? "auth.uid() = auth.uid()"
        : null,
    }));
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /no recognised tenant-scoped/,
    );
  });

  it("rejects a tenant comparison widened by OR true", () => {
    const liveRows = rows();
    liveRows[0].policies = liveRows[0].policies.map((policy) => ({
      ...policy,
      using_expression: policy.command === "INSERT"
        ? null
        : `("userId" = auth.uid()::text OR true)`,
      check_expression: ["INSERT", "UPDATE"].includes(policy.command)
        ? `("userId" = auth.uid()::text OR true)`
        : null,
    }));
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /no recognised tenant-scoped/,
    );
  });

  it("rejects a safe tenant arm widened by an unscoped OR arm", () => {
    const liveRows = rows();
    liveRows[0].policies = liveRows[0].policies.map((policy) => ({
      ...policy,
      using_expression: policy.command === "INSERT"
        ? null
        : `("userId" = auth.uid()::text OR "userId" IS NOT NULL)`,
      check_expression: ["INSERT", "UPDATE"].includes(policy.command)
        ? `("userId" = auth.uid()::text OR "userId" IS NOT NULL)`
        : null,
    }));
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /no recognised tenant-scoped/,
    );
  });

  it("rejects a scoped comparison laundered through COALESCE true", () => {
    const liveRows = rows();
    liveRows[0].policies = liveRows[0].policies.map((policy) => ({
      ...policy,
      using_expression: policy.command === "INSERT"
        ? null
        : `COALESCE("userId" = auth.uid()::text, true)`,
      check_expression: ["INSERT", "UPDATE"].includes(policy.command)
        ? `COALESCE("userId" = auth.uid()::text, true)`
        : null,
    }));
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /no recognised tenant-scoped/,
    );
  });

  it("rejects a scoped comparison whose Boolean result is wrapped in IS NOT NULL", () => {
    const liveRows = rows();
    liveRows[0].policies = liveRows[0].policies.map((policy) => ({
      ...policy,
      using_expression: policy.command === "INSERT"
        ? null
        : `("userId" = auth.uid()::text) IS NOT NULL`,
      check_expression: ["INSERT", "UPDATE"].includes(policy.command)
        ? `("userId" = auth.uid()::text) IS NOT NULL`
        : null,
    }));
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /no recognised tenant-scoped/,
    );
  });

  it("rejects a policy that opens a service-only default-deny table", () => {
    expect(
      verifyRlsRows(models, rows({ WebhookEvent: { policies: [{
        name: "opened",
        command: "SELECT",
        permissive: "PERMISSIVE",
        roles: ["authenticated"],
        using_expression: "true",
        check_expression: null,
      }] } })),
    ).toContain("WebhookEvent: default-deny table unexpectedly has a live policy");
  });

  it("rejects disabled live RLS", () => {
    expect(verifyRlsRows(models, rows({ Client: { rls_enabled: false } }))).toContain(
      "Client: row-level security is disabled",
    );
  });

  it("rejects a missing live table instead of treating absence as zero", () => {
    expect(verifyRlsRows(new Map([["Client", "Client"]]), [])).toContain(
      "Client: live table is missing",
    );
  });

  it("rejects an unexpected live public table outside the explicit inventory", () => {
    const liveRows = rows();
    liveRows.push({
      table_name: "UnmanagedSecrets",
      rls_enabled: false,
      policies: [],
    });
    expect(verifyRlsRows(models, liveRows)).toContain(
      "UnmanagedSecrets: unexpected live public table is absent from the explicit RLS inventory",
    );
  });

  it("rejects duplicate discovered table rows instead of allowing Map overwrite", () => {
    const liveRows = rows();
    liveRows.push({ ...liveRows[0], policies: [...liveRows[0].policies] });
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /Client: live table inventory contains 2 duplicate rows/,
    );
  });

  it("rejects an authenticated policy that also grants anon", () => {
    const liveRows = rows();
    liveRows[0].policies[0].roles = ["anon", "authenticated"];
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /not restricted to role authenticated/,
    );
  });

  it("rejects FOR ALL because separate semantic arms are required", () => {
    const liveRows = rows();
    liveRows[0].policies = [{
      name: "open_all",
      command: "ALL",
      permissive: "PERMISSIVE",
      roles: ["authenticated"],
      using_expression: `("userId" = (auth.uid())::text)`,
      check_expression: `("userId" = (auth.uid())::text)`,
    }];
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(/unexpected ALL policy/);
  });

  it("rejects UPDATE without a scoped WITH CHECK arm", () => {
    const liveRows = rows();
    const update = liveRows[0].policies.find((policy) => policy.command === "UPDATE")!;
    update.check_expression = "true";
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /UPDATE policy .* has no recognised tenant-scoped WITH CHECK predicate/,
    );
  });

  it("fails closed on a malformed policy object instead of treating absence as safe", () => {
    const liveRows = rows();
    liveRows[0].policies = [{} as LiveRlsPolicy];
    expect(verifyRlsRows(models, liveRows).join("\n")).toMatch(
      /malformed policy/,
    );
  });

  it("accepts only a read-only true SELECT policy for public reference data", () => {
    const publicModels = new Map([["BuildingCode", "BuildingCode"]]);
    const publicRows: LiveRlsRow[] = [{
      table_name: "BuildingCode",
      rls_enabled: true,
      policies: [{
        name: "anon_select",
        command: "SELECT",
        permissive: "PERMISSIVE",
        roles: ["anon"],
        using_expression: "true",
        check_expression: null,
      }],
    }];
    expect(verifyRlsRows(publicModels, publicRows)).toEqual([]);
    publicRows[0].policies[0].command = "UPDATE";
    expect(verifyRlsRows(publicModels, publicRows).join("\n")).toMatch(
      /violates the read-only contract/,
    );
  });
});
