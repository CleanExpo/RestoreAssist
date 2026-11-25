/**
 * RA-8400 — real-database proof that the signed-record where fragments hold.
 *
 * The route tests mock Prisma, so they only show the shape of the where clause.
 * These run the same fragments the routes use against Postgres and read the
 * row back. They run ONLY when DATABASE_URL is set (CI Quality Checks); they
 * are skipped locally.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  formAcceptsSignatureWhere,
  noSignedSignatureWhere,
  unsignedSlotWhere,
} from "../signed-record-guard";

const HAS_DB = !!process.env.DATABASE_URL;
const S = `ra8400-${Date.now().toString(36)}`;

const ids = {
  user: "",
  report: "",
  template: "",
  signedForm: "",
  signedSlot: "",
  cancelledForm: "",
  cancelledSlot: "",
};
const FIRST_SIGNED_AT = new Date("2026-11-01T01:02:03.000Z");

describe.skipIf(!HAS_DB)("signed authority form stays unchanged (RA-8400)", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `${S}-user@test.local` },
    });
    ids.user = user.id;
    const report = await prisma.report.create({
      data: {
        userId: user.id,
        title: "T",
        clientName: "C",
        propertyAddress: "1 St",
        hazardType: "water",
        insuranceType: "home",
      },
    });
    ids.report = report.id;
    const template = await prisma.authorityFormTemplate.create({
      data: { name: "T", code: `${S}-code`, formContent: "{}" },
    });
    ids.template = template.id;

    const formBase = {
      templateId: template.id,
      reportId: report.id,
      companyName: "Co",
      clientName: "Cl",
      clientAddress: "1 St",
      authorityDescription: "Apply antimicrobial to the lounge carpet",
    };

    // Staff signing leaves the status at PENDING_SIGNATURES, so this is a
    // real shape: an open-looking status with a signed slot.
    const signedForm = await prisma.authorityFormInstance.create({
      data: { ...formBase, status: "PENDING_SIGNATURES" },
    });
    ids.signedForm = signedForm.id;
    const signedSlot = await prisma.authorityFormSignature.create({
      data: {
        instanceId: signedForm.id,
        signatoryName: "Margaret",
        signatoryRole: "CLIENT",
        signatureData: "data:image/png;base64,FIRST",
        signedAt: FIRST_SIGNED_AT,
        ipAddress: "1.1.1.1",
      },
    });
    ids.signedSlot = signedSlot.id;

    const cancelledForm = await prisma.authorityFormInstance.create({
      data: { ...formBase, status: "CANCELLED" },
    });
    ids.cancelledForm = cancelledForm.id;
    const cancelledSlot = await prisma.authorityFormSignature.create({
      data: {
        instanceId: cancelledForm.id,
        signatoryName: "Margaret",
        signatoryRole: "CLIENT",
        signatureRequestToken: `${S}-token`,
      },
    });
    ids.cancelledSlot = cancelledSlot.id;
  });

  afterAll(async () => {
    const swallow = (p: Promise<unknown>) => p.catch(() => {});
    await swallow(
      prisma.authorityFormInstance.deleteMany({
        where: { id: { in: [ids.signedForm, ids.cancelledForm] } },
      }),
    );
    await swallow(
      prisma.authorityFormTemplate.deleteMany({ where: { code: `${S}-code` } }),
    );
    await swallow(prisma.user.deleteMany({ where: { id: ids.user } }));
    await prisma.$disconnect();
  });

  // app/api/authority-forms/[id]/route.ts PUT write
  it("wording and status write matches no row once a signature exists", async () => {
    const result = await prisma.authorityFormInstance.updateMany({
      where: {
        id: ids.signedForm,
        status: "PENDING_SIGNATURES",
        ...noSignedSignatureWhere(),
        report: { OR: [{ userId: ids.user }] },
      },
      data: { authorityDescription: "Dispose of all contents", status: "CANCELLED" },
    });
    expect(result.count).toBe(0);
    const after = await prisma.authorityFormInstance.findUnique({
      where: { id: ids.signedForm },
      select: { authorityDescription: true, status: true },
    });
    expect(after).toEqual({
      authorityDescription: "Apply antimicrobial to the lounge carpet",
      status: "PENDING_SIGNATURES",
    });
  });

  // app/api/authority-forms/[id]/signatures/route.ts sign write
  it("a second staff sign keeps the first image, name, time and IP", async () => {
    const result = await prisma.authorityFormSignature.updateMany({
      where: {
        id: ids.signedSlot,
        instanceId: ids.signedForm,
        ...unsignedSlotWhere(),
        instance: formAcceptsSignatureWhere(),
      },
      data: {
        signatureData: "data:image/png;base64,SECOND",
        signatoryName: "Someone Else",
        signedAt: new Date(),
        ipAddress: "2.2.2.2",
      },
    });
    expect(result.count).toBe(0);
    const after = await prisma.authorityFormSignature.findUnique({
      where: { id: ids.signedSlot },
      select: {
        signatureData: true,
        signatoryName: true,
        signedAt: true,
        ipAddress: true,
      },
    });
    expect(after).toEqual({
      signatureData: "data:image/png;base64,FIRST",
      signatoryName: "Margaret",
      signedAt: FIRST_SIGNED_AT,
      ipAddress: "1.1.1.1",
    });
  });

  // app/api/authority-forms/sign/[token]/route.ts public write
  it("a cancelled form cannot be signed and stays CANCELLED", async () => {
    const result = await prisma.authorityFormSignature.updateMany({
      where: {
        id: ids.cancelledSlot,
        signatureRequestToken: `${S}-token`,
        ...unsignedSlotWhere(),
        instance: formAcceptsSignatureWhere(),
      },
      data: { signatureData: "data:image/png;base64,X", signedAt: new Date() },
    });
    expect(result.count).toBe(0);
    const slot = await prisma.authorityFormSignature.findUnique({
      where: { id: ids.cancelledSlot },
      select: { signedAt: true, signatureData: true },
    });
    expect(slot).toEqual({ signedAt: null, signatureData: null });
    const form = await prisma.authorityFormInstance.findUnique({
      where: { id: ids.cancelledForm },
      select: { status: true },
    });
    expect(form?.status).toBe("CANCELLED");
  });

  // Positive control: the same fragments do let an open, unsigned slot sign.
  it("positive control: an open form's unsigned slot can still be signed", async () => {
    const openSlot = await prisma.authorityFormSignature.create({
      data: {
        instanceId: ids.signedForm,
        signatoryName: "Insurer",
        signatoryRole: "INSURER",
      },
    });
    const result = await prisma.authorityFormSignature.updateMany({
      where: {
        id: openSlot.id,
        instanceId: ids.signedForm,
        ...unsignedSlotWhere(),
        instance: formAcceptsSignatureWhere(),
      },
      data: { signatureData: "data:image/png;base64,OK", signedAt: new Date() },
    });
    expect(result.count).toBe(1);
  });
});
