/**
 * J5 route specs: the create and update routes under attack, each with a
 * valid base body (so a payload reaches the handler's real logic rather than
 * the required-field guard), the fields to attack, how to find the written
 * row, and the GET route that must return the stored value unchanged.
 */
import type { Method } from "../../runner/route-harness";
import type { World } from "../../runner/world";

export interface Ctx {
  w: World;
  /** Firm A records J5 creates for itself so PUTs do not disturb the shared world. */
  client: string;
  invoice: string;
  /** Firm A inspection the case targets (fresh per case where the spec says so). */
  inspection: string;
  run: string;
}

export interface Readback {
  /** prisma delegate name */
  model: string;
  /** row id for this case: created id from the response, or the fixed target */
  rowId: (ctx: Ctx, createdId: string | null) => string | null;
  /** GET route that exposes the row */
  get: { file: string; route: string; params: (ctx: Ctx, rowId: string) => Record<string, string> };
  /** nested field rows (invoice line items) */
  child?: { model: string; where: (rowId: string) => Record<string, unknown> };
}

export interface Spec {
  key: string;
  file: string;
  route: string;
  method: Method;
  params: (ctx: Ctx) => Record<string, string>;
  /** dynamic segment is a firm A record (B_OWNER then attempts an id swap) */
  swap: boolean;
  base: (ctx: Ctx, n: number) => Record<string, unknown>;
  fields: string[];
  headers?: (ctx: Ctx, n: number) => Record<string, string>;
  readback: Readback;
  /** after-call reset for routes that change shared state */
  reset?: (ctx: Ctx) => Promise<void>;
  /** give each case its own firm A record so the GET stays small and cases stay independent */
  fresh?: "inspection" | "invoice";
  /** planted control only */
  planted?: boolean;
}

const insp = (c: Ctx) => ({ id: c.inspection });
const inspGet = { file: "app/api/inspections/[id]/route.ts", route: "/api/inspections/[id]", params: (c: Ctx) => ({ id: c.inspection }) };
const dueDate = () => new Date(Date.now() + 14 * 864e5).toISOString();

export function specs(): Spec[] {
  return [
    {
      key: "clients-create",
      file: "app/api/clients/route.ts",
      route: "/api/clients",
      method: "POST",
      params: () => ({}),
      swap: false,
      base: (c, n) => ({ name: `J5 client ${n}`, email: `${c.run}-c${n}@jev.test`, phone: "0400000001", address: "3 Test St", notes: "note" }),
      fields: ["name", "email", "phone", "address", "company", "notes", "status"],
      readback: { model: "client", rowId: (_c, id) => id, get: { file: "app/api/clients/[id]/route.ts", route: "/api/clients/[id]", params: (_c, id) => ({ id }) } },
    },
    {
      key: "clients-update",
      file: "app/api/clients/[id]/route.ts",
      route: "/api/clients/[id]",
      method: "PUT",
      params: (c) => ({ id: c.client }),
      swap: true,
      base: (c) => ({ name: "J5 client update", email: `${c.run}-cu@jev.test`, phone: "0400000002", address: "4 Test St" }),
      fields: ["name", "email", "phone", "address", "contactPerson", "notes", "status", "brandPrimaryColor"],
      readback: { model: "client", rowId: (c) => c.client, get: { file: "app/api/clients/[id]/route.ts", route: "/api/clients/[id]", params: (c) => ({ id: c.client }) } },
    },
    {
      key: "inspections-create",
      file: "app/api/inspections/route.ts",
      route: "/api/inspections",
      method: "POST",
      params: () => ({}),
      swap: false,
      base: (_c, n) => ({ propertyAddress: `${n} J5 Rd, Brisbane QLD`, propertyPostcode: "4000", lossDescription: "burst pipe", technicianName: "Tech" }),
      fields: ["propertyAddress", "propertyPostcode", "lossDescription", "technicianName", "claimType", "inspectionDate", "clientId"],
      readback: { model: "inspection", rowId: (_c, id) => id, get: { file: "app/api/inspections/[id]/route.ts", route: "/api/inspections/[id]", params: (_c, id) => ({ id }) } },
    },
    {
      key: "inspections-update",
      file: "app/api/inspections/[id]/route.ts",
      route: "/api/inspections/[id]",
      method: "PATCH",
      params: insp,
      swap: true,
      base: () => ({ lossDescription: "updated loss", technicianName: "Tech A" }),
      fields: ["lossDescription", "technicianName", "pulseEnabled"],
      readback: { model: "inspection", rowId: (c) => c.inspection, get: inspGet },
    },
    {
      key: "invoices-create",
      file: "app/api/invoices/route.ts",
      route: "/api/invoices",
      method: "POST",
      params: () => ({}),
      swap: false,
      base: (c) => ({
        customerName: "J5 Customer",
        customerEmail: `${c.run}-inv@jev.test`,
        dueDate: dueDate(),
        lineItems: [{ description: "Drying", quantity: 2, unitPrice: 10000, gstRate: 10 }],
        notes: "n",
      }),
      fields: [
        "customerName",
        "customerEmail",
        "customerABN",
        "notes",
        "lineItems.0.description",
        "lineItems.0.quantity",
        "lineItems.0.unitPrice",
        "discountAmount",
        "shippingAmount",
        "dueDate",
      ],
      readback: {
        model: "invoice",
        rowId: (_c, id) => id,
        get: { file: "app/api/invoices/[id]/route.ts", route: "/api/invoices/[id]", params: (_c, id) => ({ id }) },
        child: { model: "invoiceLineItem", where: (id) => ({ invoiceId: id, sortOrder: 0 }) },
      },
    },
    {
      key: "invoices-update",
      fresh: "invoice",
      file: "app/api/invoices/[id]/route.ts",
      route: "/api/invoices/[id]",
      method: "PUT",
      params: (c) => ({ id: c.invoice }),
      swap: true,
      base: (c) => ({ customerName: "J5 Customer upd", customerEmail: `${c.run}-invu@jev.test`, dueDate: dueDate() }),
      fields: ["customerName", "customerEmail", "customerABN", "notes", "terms", "discountAmount", "shippingAmount", "dueDate"],
      readback: { model: "invoice", rowId: (c) => c.invoice, get: { file: "app/api/invoices/[id]/route.ts", route: "/api/invoices/[id]", params: (c) => ({ id: c.invoice }) } },
    },
    {
      key: "moisture-create",
      fresh: "inspection",
      file: "app/api/inspections/[id]/moisture/route.ts",
      route: "/api/inspections/[id]/moisture",
      method: "POST",
      params: insp,
      swap: true,
      base: () => ({ location: "Kitchen", surfaceType: "plasterboard", moistureLevel: 18.5, depth: "Surface", notes: "r" }),
      fields: ["location", "surfaceType", "moistureLevel", "notes", "depth", "mapX"],
      readback: { model: "moistureReading", rowId: (_c, id) => id, get: inspGet },
    },
    {
      key: "areas-create",
      fresh: "inspection",
      file: "app/api/inspections/[id]/affected-areas/route.ts",
      route: "/api/inspections/[id]/affected-areas",
      method: "POST",
      params: insp,
      swap: true,
      base: () => ({ roomZoneId: "Kitchen", waterSource: "Burst pipe", affectedAreaSqm: 12, description: "wet floor" }),
      fields: ["roomZoneId", "waterSource", "description", "timeSinceLoss", "photos"],
      readback: { model: "affectedArea", rowId: (_c, id) => id, get: inspGet },
    },
    {
      key: "scope-create",
      fresh: "inspection",
      file: "app/api/inspections/[id]/scope-items/route.ts",
      route: "/api/inspections/[id]/scope-items",
      method: "POST",
      params: insp,
      swap: true,
      base: () => ({ itemType: "install_dehumidification", description: "Dehumidify", quantity: 2, unit: "days" }),
      fields: ["itemType", "description", "quantity", "unit", "areaId", "specification"],
      readback: { model: "scopeItem", rowId: (_c, id) => id, get: inspGet },
    },
    {
      key: "sketches-save",
      fresh: "inspection",
      file: "app/api/inspections/[id]/sketches/route.ts",
      route: "/api/inspections/[id]/sketches",
      method: "POST",
      params: insp,
      swap: true,
      base: () => ({ floorNumber: 0, floorLabel: "Ground Floor", sketchType: "structural", sketchData: { objects: [] } }),
      fields: ["floorLabel", "floorNumber", "sketchType", "sketchData"],
      readback: {
        model: "claimSketch",
        rowId: (_c, id) => id,
        get: { file: "app/api/inspections/[id]/sketches/route.ts", route: "/api/inspections/[id]/sketches", params: (c) => ({ id: c.inspection }) },
      },
    },
    {
      key: "team-invite",
      file: "app/api/team/invites/route.ts",
      route: "/api/team/invites",
      method: "POST",
      params: () => ({}),
      swap: false,
      base: (c, n) => ({ email: `${c.run}-inv${n}@jev.test`, role: "USER" }),
      fields: ["email", "role"],
      headers: (c, n) => ({ origin: "http://localhost", host: "localhost", "idempotency-key": `jev-${c.run}-invite-${n}` }),
      readback: { model: "userInvite", rowId: (_c, id) => id, get: { file: "app/api/team/invites/route.ts", route: "/api/team/invites", params: () => ({}) } },
    },
    {
      key: "team-member-role",
      file: "app/api/team/members/[id]/route.ts",
      route: "/api/team/members/[id]",
      method: "PATCH",
      params: (c) => ({ id: c.w.users.A_TECH.id }),
      swap: true,
      base: () => ({ role: "MANAGER" }),
      fields: ["role"],
      readback: { model: "user", rowId: (c) => c.w.users.A_TECH.id, get: { file: "app/api/team/members/route.ts", route: "/api/team/members", params: () => ({}) } },
      reset: async (c) => {
        const { prisma } = await import("@/lib/prisma");
        await prisma.user.update({ where: { id: c.w.users.A_TECH.id }, data: { role: "USER", organizationId: c.w.orgA } });
      },
    },
  ];
}

const P = "tests/eval/jev/families/j5/planted-routes";

/** Planted defects: same runCase, same oracles; each must come back FAIL. */
export function plantedSpecs(): Array<{ id: string; spec: Spec; field: string; payload: string; who: "A_OWNER" | "A_MANAGER" | "B_OWNER" }> {
  const noRead: Readback = { model: "client", rowId: () => null, get: { file: `${P}/mangle.ts`, route: "/api/jev-planted/mangle/[id]", params: (_c, id) => ({ id }) } };
  const mk = (key: string, file: string, route: string, method: Method, extra: Partial<Spec> = {}): Spec => ({
    key,
    file: `${P}/${file}`,
    route,
    method,
    params: () => ({}),
    swap: false,
    base: (c, n) => ({ name: `planted ${n}`, email: `${c.run}-p${n}@jev.test` }),
    fields: ["name"],
    readback: noRead,
    planted: true,
    ...extra,
  });
  return [
    { id: "J5-CTRL-prisma-text", spec: mk("prisma-text", "prisma-text.ts", "/api/jev-planted/prisma-text", "POST"), field: "name", payload: "array", who: "A_OWNER" },
    { id: "J5-CTRL-role-from-body", spec: mk("role", "role-from-body.ts", "/api/jev-planted/role", "POST", { readback: { ...noRead, model: "user", rowId: (c) => c.w.users.A_MANAGER.id } }), field: "mass", payload: "assign", who: "A_MANAGER" },
    { id: "J5-CTRL-long-500", spec: mk("long500", "long-500.ts", "/api/jev-planted/long500", "POST"), field: "name", payload: "long100k", who: "A_OWNER" },
    {
      id: "J5-CTRL-mangle-get",
      spec: mk("mangle", "mangle.ts", "/api/jev-planted/mangle", "POST", { readback: { ...noRead, rowId: (_c, id) => id } }),
      field: "name",
      payload: "xss_script",
      who: "A_OWNER",
    },
    {
      id: "J5-CTRL-leak-b",
      spec: mk("leak", "leak.ts", "/api/jev-planted/leak/[id]", "PUT", { params: (c) => ({ id: c.w.a.client }), swap: true }),
      field: "name",
      payload: "xss_img",
      who: "B_OWNER",
    },
    { id: "J5-CTRL-proto", spec: mk("proto", "proto.ts", "/api/jev-planted/proto", "POST"), field: "name", payload: "proto_obj", who: "A_OWNER" },
  ];
}
