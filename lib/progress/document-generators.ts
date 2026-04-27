/**
 * Progress framework document generators — RA-1705.
 *
 * One canonical loader, then four PDF generators that pull from the
 * already-linked schema graph (Report ↔ Inspection ↔ ClaimProgress ↔
 * ProgressTransition ↔ ProgressAttestation). Eliminates re-entry —
 * pilot users sign once, the data flows into every downstream doc.
 *
 * Each generator returns a `Uint8Array` of the PDF bytes so callers
 * (route handlers, ZIP packers) can stream or attach as they like.
 *
 * Pi-Sign signatures are embedded inline via pdf-lib `embedPng()` from
 * the base64 data URL stored on `ProgressAttestation.signatureDataUrl`.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getGate } from "./gate-policy";

// ─── canonical data loader ───────────────────────────────────────────────────

export interface ClaimDataGraph {
  claimProgress: {
    id: string;
    reportId: string;
    currentState: string;
    version: number;
    closedAt: Date | null;
    createdAt: Date;
  };
  report: {
    id: string;
    title: string;
    clientName: string;
    propertyAddress: string;
    hazardType: string;
    insuranceType: string;
  };
  transitions: Array<{
    id: string;
    transitionKey: string;
    fromState: string;
    toState: string;
    actorName: string;
    actorRole: string;
    transitionedAt: Date;
    integrityHash: string;
    softGaps: string[];
    auditGaps: string[];
  }>;
  attestations: Array<{
    id: string;
    attestationType: string;
    attestorName: string;
    attestorRole: string;
    attestorEmail: string;
    attestedAt: Date;
    integrityHash: string;
    signatureDataUrl: string | null;
    /** Labour-hire fields (M-13). */
    labourHireHours: number | null;
    labourHireAwardClass: string | null;
    labourHireSuperRate: number | null;
    labourHirePortableLslState: string | null;
    labourHireInductionEvidenceId: string | null;
    transitionId: string | null;
  }>;
}

export type LoadResult =
  | { ok: true; data: ClaimDataGraph }
  | { ok: false; error: string };

export async function loadClaimDataGraph(
  reportId: string,
): Promise<LoadResult> {
  const cp = await prisma.claimProgress.findUnique({
    where: { reportId },
    select: {
      id: true,
      reportId: true,
      currentState: true,
      version: true,
      closedAt: true,
      createdAt: true,
      report: {
        select: {
          id: true,
          title: true,
          clientName: true,
          propertyAddress: true,
          hazardType: true,
          insuranceType: true,
        },
      },
    },
  });
  if (!cp) return { ok: false, error: "ClaimProgress not found" };

  const [transitions, attestations] = await Promise.all([
    prisma.progressTransition.findMany({
      where: { claimProgressId: cp.id },
      orderBy: { transitionedAt: "asc" },
      select: {
        id: true,
        transitionKey: true,
        fromState: true,
        toState: true,
        actorName: true,
        actorRole: true,
        transitionedAt: true,
        integrityHash: true,
        softGaps: true,
        auditGaps: true,
      },
    }),
    prisma.progressAttestation.findMany({
      where: { claimProgressId: cp.id },
      orderBy: { attestedAt: "asc" },
      select: {
        id: true,
        attestationType: true,
        attestorName: true,
        attestorRole: true,
        attestorEmail: true,
        attestedAt: true,
        integrityHash: true,
        signatureDataUrl: true,
        labourHireHours: true,
        labourHireAwardClass: true,
        labourHireSuperRate: true,
        labourHirePortableLslState: true,
        labourHireInductionEvidenceId: true,
        transitionId: true,
      },
    }),
  ]);

  return {
    ok: true,
    data: {
      claimProgress: {
        id: cp.id,
        reportId: cp.reportId,
        currentState: cp.currentState,
        version: cp.version,
        closedAt: cp.closedAt,
        createdAt: cp.createdAt,
      },
      report: cp.report,
      transitions: transitions.map((t) => ({
        ...t,
        softGaps: jsonStrings(t.softGaps),
        auditGaps: jsonStrings(t.auditGaps),
      })),
      attestations: attestations.map((a) => ({
        ...a,
        labourHireHours:
          a.labourHireHours == null ? null : Number(a.labourHireHours),
        labourHireSuperRate:
          a.labourHireSuperRate == null ? null : Number(a.labourHireSuperRate),
      })),
    },
  };
}

function jsonStrings(v: unknown): string[] {
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === "string");
  return [];
}

// ─── PDF helpers ─────────────────────────────────────────────────────────────

interface PdfCtx {
  doc: PDFDocument;
  page: PDFPage;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  cursorY: number;
  /** Remaining vertical pixels. Recomputed on page break. */
  margin: number;
}

const PAGE_MARGIN = 56;
const PAGE_WIDTH = 595; // A4
const PAGE_HEIGHT = 842;

async function newDoc(): Promise<PdfCtx> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return {
    doc,
    page,
    font,
    bold,
    cursorY: PAGE_HEIGHT - PAGE_MARGIN,
    margin: PAGE_MARGIN,
  };
}

function ensureSpace(ctx: PdfCtx, required: number): void {
  if (ctx.cursorY - required < ctx.margin) {
    ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    ctx.cursorY = PAGE_HEIGHT - PAGE_MARGIN;
  }
}

function drawText(
  ctx: PdfCtx,
  text: string,
  opts: {
    size?: number;
    bold?: boolean;
    indent?: number;
    color?: [number, number, number];
  } = {},
): void {
  const size = opts.size ?? 11;
  const indent = opts.indent ?? 0;
  ensureSpace(ctx, size + 4);
  const f = opts.bold ? ctx.bold : ctx.font;
  const color = opts.color ?? [0.1, 0.1, 0.1];
  ctx.page.drawText(text, {
    x: ctx.margin + indent,
    y: ctx.cursorY - size,
    size,
    font: f,
    color: rgb(color[0], color[1], color[2]),
    maxWidth: PAGE_WIDTH - 2 * ctx.margin - indent,
  });
  ctx.cursorY -= size + 4;
}

function drawDivider(ctx: PdfCtx): void {
  ensureSpace(ctx, 12);
  ctx.page.drawLine({
    start: { x: ctx.margin, y: ctx.cursorY - 4 },
    end: { x: PAGE_WIDTH - ctx.margin, y: ctx.cursorY - 4 },
    thickness: 0.5,
    color: rgb(0.7, 0.7, 0.7),
  });
  ctx.cursorY -= 12;
}

function drawHeading(ctx: PdfCtx, text: string): void {
  drawText(ctx, text, { size: 16, bold: true });
  drawDivider(ctx);
}

function drawKv(ctx: PdfCtx, key: string, value: string): void {
  drawText(ctx, `${key}: ${value}`, { size: 10 });
}

async function drawSignature(
  ctx: PdfCtx,
  signatureDataUrl: string | null,
  caption: string,
): Promise<void> {
  if (!signatureDataUrl) {
    drawText(ctx, `${caption}: (no signature on file)`, { size: 10 });
    return;
  }
  const m = /^data:image\/(png|svg\+xml);base64,(.+)$/.exec(signatureDataUrl);
  if (!m) {
    drawText(ctx, `${caption}: (signature not embeddable)`, { size: 10 });
    return;
  }
  if (m[1] !== "png") {
    // pdf-lib only embeds PNG and JPEG. SVG signatures fall back to caption.
    drawText(ctx, `${caption}: (signed - SVG not embeddable in PDF)`, {
      size: 10,
    });
    return;
  }
  const bytes = Buffer.from(m[2], "base64");
  try {
    const png = await ctx.doc.embedPng(bytes);
    const w = 160;
    const ratio = png.height / png.width;
    const h = Math.min(60, w * ratio);
    ensureSpace(ctx, h + 18);
    ctx.page.drawImage(png, {
      x: ctx.margin,
      y: ctx.cursorY - h,
      width: w,
      height: h,
    });
    ctx.cursorY -= h + 4;
    drawText(ctx, caption, { size: 9, color: [0.4, 0.4, 0.4] });
  } catch {
    drawText(ctx, `${caption}: (signature embed failed)`, { size: 10 });
  }
}

// ─── 1. Stabilisation Completion Certificate ─────────────────────────────────

export async function generateStabilisationCertificate(
  graph: ClaimDataGraph,
): Promise<Uint8Array> {
  const ctx = await newDoc();

  // The relevant attestation is the most recent TECHNICIAN_SIGN_OFF on the
  // attest_stabilisation transition (if any).
  const stabilisation = [...graph.transitions]
    .reverse()
    .find((t) => t.transitionKey === "attest_stabilisation");
  const sigAttestation = graph.attestations
    .filter((a) => a.attestationType === "TECHNICIAN_SIGN_OFF")
    .filter((a) =>
      stabilisation ? a.transitionId === stabilisation.id : true,
    )
    .at(-1);

  drawText(ctx, "STABILISATION COMPLETION CERTIFICATE", {
    size: 18,
    bold: true,
  });
  drawText(ctx, "AS-IICRC S500:2025 - Section 12 Stabilisation", {
    size: 10,
    color: [0.4, 0.4, 0.4],
  });
  drawDivider(ctx);

  drawHeading(ctx, "Property");
  drawKv(ctx, "Address", graph.report.propertyAddress);
  drawKv(ctx, "Client", graph.report.clientName);
  drawKv(ctx, "Hazard", graph.report.hazardType);
  drawKv(ctx, "Insurer", graph.report.insuranceType);
  drawKv(ctx, "Report ID", graph.report.id);
  drawKv(ctx, "Claim version", `v${graph.claimProgress.version}`);

  drawHeading(ctx, "Stabilisation event");
  if (stabilisation) {
    drawKv(ctx, "Attested at", stabilisation.transitionedAt.toISOString());
    drawKv(
      ctx,
      "Transition",
      `${stabilisation.fromState} -> ${stabilisation.toState}`,
    );
    drawKv(
      ctx,
      "Actor",
      `${stabilisation.actorName} (${stabilisation.actorRole})`,
    );
    drawKv(ctx, "Integrity hash", short(stabilisation.integrityHash));
    if (stabilisation.softGaps.length > 0) {
      drawKv(
        ctx,
        "Soft gaps recorded",
        stabilisation.softGaps.map((k) => labelFor(k)).join(", "),
      );
    }
  } else {
    drawText(
      ctx,
      "(No stabilisation attestation has been recorded for this claim yet.)",
      { size: 10, color: [0.6, 0.2, 0.2] },
    );
  }

  drawHeading(ctx, "Attestor signature");
  if (sigAttestation) {
    drawKv(
      ctx,
      "Attestor",
      `${sigAttestation.attestorName} <${sigAttestation.attestorEmail}>`,
    );
    drawKv(ctx, "Role", sigAttestation.attestorRole);
    drawKv(ctx, "Signed at", sigAttestation.attestedAt.toISOString());
    drawKv(ctx, "Integrity hash", short(sigAttestation.integrityHash));
    await drawSignature(
      ctx,
      sigAttestation.signatureDataUrl,
      "- signed by attestor",
    );
  } else {
    drawText(ctx, "(No signed attestation found.)", {
      size: 10,
      color: [0.6, 0.2, 0.2],
    });
  }

  drawDivider(ctx);
  drawText(
    ctx,
    `Generated ${new Date().toISOString()} from RestoreAssist (Pi-Sign).`,
    { size: 8, color: [0.5, 0.5, 0.5] },
  );

  return ctx.doc.save();
}

// ─── 2. Labour-Hire Engagement Summary ───────────────────────────────────────

export async function generateLabourHireSummary(
  graph: ClaimDataGraph,
): Promise<Uint8Array> {
  const ctx = await newDoc();
  const labourRows = graph.attestations.filter(
    (a) => a.attestationType === "LABOUR_HIRE_SELF",
  );

  drawText(ctx, "LABOUR-HIRE ENGAGEMENT SUMMARY", { size: 18, bold: true });
  drawText(ctx, "Fair Work + SG 12% + Portable LSL evidence (M-13)", {
    size: 10,
    color: [0.4, 0.4, 0.4],
  });
  drawDivider(ctx);

  drawHeading(ctx, "Claim");
  drawKv(ctx, "Property", graph.report.propertyAddress);
  drawKv(ctx, "Client", graph.report.clientName);
  drawKv(ctx, "Report ID", graph.report.id);

  if (labourRows.length === 0) {
    drawHeading(ctx, "Engagements");
    drawText(ctx, "(No LABOUR_HIRE_SELF attestations recorded.)", {
      size: 10,
      color: [0.6, 0.2, 0.2],
    });
  } else {
    for (const a of labourRows) {
      drawHeading(ctx, `Engagement - ${a.attestorName}`);
      drawKv(ctx, "Attested at", a.attestedAt.toISOString());
      drawKv(ctx, "Email", a.attestorEmail);
      drawKv(ctx, "Role", a.attestorRole);
      drawKv(
        ctx,
        "Hours",
        a.labourHireHours == null ? "-" : a.labourHireHours.toFixed(2),
      );
      drawKv(ctx, "Award class", a.labourHireAwardClass ?? "-");
      drawKv(
        ctx,
        "Super rate",
        a.labourHireSuperRate == null
          ? "-"
          : `${(a.labourHireSuperRate * 100).toFixed(1)}%`,
      );
      drawKv(
        ctx,
        "Portable LSL state",
        a.labourHirePortableLslState ?? "(N/A)",
      );
      drawKv(
        ctx,
        "Induction evidence",
        a.labourHireInductionEvidenceId ?? "(missing)",
      );
      drawKv(ctx, "Integrity hash", short(a.integrityHash));
      await drawSignature(ctx, a.signatureDataUrl, "- signed by labour-hire");
    }
  }

  drawDivider(ctx);
  drawText(
    ctx,
    `Generated ${new Date().toISOString()} from RestoreAssist.`,
    { size: 8, color: [0.5, 0.5, 0.5] },
  );

  return ctx.doc.save();
}

// ─── 3. Carrier Authority Packet PDF ─────────────────────────────────────────

export async function generateCarrierPacketPdf(
  graph: ClaimDataGraph,
): Promise<Uint8Array> {
  const ctx = await newDoc();
  const stabilisation = [...graph.transitions]
    .reverse()
    .find((t) => t.transitionKey === "attest_stabilisation");

  drawText(ctx, "CARRIER AUTHORITY PACKET", { size: 18, bold: true });
  drawText(ctx, "Stabilisation submission - human-readable mirror", {
    size: 10,
    color: [0.4, 0.4, 0.4],
  });
  drawDivider(ctx);

  drawHeading(ctx, "Claim identity");
  drawKv(ctx, "Property", graph.report.propertyAddress);
  drawKv(ctx, "Client", graph.report.clientName);
  drawKv(ctx, "Hazard", graph.report.hazardType);
  drawKv(ctx, "Insurer", graph.report.insuranceType);
  drawKv(ctx, "Report ID", graph.report.id);
  drawKv(ctx, "ClaimProgress ID", graph.claimProgress.id);
  drawKv(ctx, "Current state", graph.claimProgress.currentState);

  if (!stabilisation) {
    drawHeading(ctx, "Status");
    drawText(
      ctx,
      "Stabilisation has not been attested. This packet is incomplete.",
      { size: 10, color: [0.6, 0.2, 0.2] },
    );
  } else {
    drawHeading(ctx, "Stabilisation event");
    drawKv(ctx, "Attested at", stabilisation.transitionedAt.toISOString());
    drawKv(
      ctx,
      "Actor",
      `${stabilisation.actorName} (${stabilisation.actorRole})`,
    );
    drawKv(ctx, "Integrity hash", stabilisation.integrityHash);
    if (stabilisation.softGaps.length > 0) {
      drawKv(
        ctx,
        "Soft gaps",
        stabilisation.softGaps.map(labelFor).join(", "),
      );
    }
    if (stabilisation.auditGaps.length > 0) {
      drawKv(
        ctx,
        "Audit observations",
        stabilisation.auditGaps.map(labelFor).join(", "),
      );
    }

    drawHeading(ctx, "Evidence manifest");
    if (graph.attestations.length === 0) {
      drawText(ctx, "(No attestations linked.)", { size: 10 });
    } else {
      for (const a of graph.attestations) {
        drawText(
          ctx,
          `* ${a.attestationType} - ${a.attestorName} @ ${a.attestedAt.toISOString()}  (hash ${short(a.integrityHash)})`,
          { size: 10 },
        );
      }
    }
  }

  drawDivider(ctx);
  drawText(
    ctx,
    `Generated ${new Date().toISOString()} from RestoreAssist.`,
    { size: 8, color: [0.5, 0.5, 0.5] },
  );

  return ctx.doc.save();
}

// ─── 4. Closeout Pack ────────────────────────────────────────────────────────

export async function generateCloseoutPack(
  graph: ClaimDataGraph,
): Promise<Uint8Array> {
  const ctx = await newDoc();

  drawText(ctx, "CLOSEOUT PACK", { size: 18, bold: true });
  drawText(
    ctx,
    "Full lifecycle audit - every transition, every attestation, every gap",
    { size: 10, color: [0.4, 0.4, 0.4] },
  );
  drawDivider(ctx);

  drawHeading(ctx, "Claim");
  drawKv(ctx, "Property", graph.report.propertyAddress);
  drawKv(ctx, "Client", graph.report.clientName);
  drawKv(ctx, "Hazard", graph.report.hazardType);
  drawKv(ctx, "Insurer", graph.report.insuranceType);
  drawKv(ctx, "Final state", graph.claimProgress.currentState);
  drawKv(
    ctx,
    "Closed at",
    graph.claimProgress.closedAt?.toISOString() ?? "(open)",
  );
  drawKv(ctx, "Total transitions", String(graph.transitions.length));
  drawKv(ctx, "Total attestations", String(graph.attestations.length));

  drawHeading(ctx, "Lifecycle (chronological)");
  if (graph.transitions.length === 0) {
    drawText(ctx, "(none)", { size: 10 });
  } else {
    for (const t of graph.transitions) {
      drawText(
        ctx,
        `${t.transitionedAt.toISOString().slice(0, 16).replace("T", " ")} | ${t.transitionKey} | ${t.fromState} -> ${t.toState} | ${t.actorName} (${t.actorRole})`,
        { size: 10 },
      );
      if (t.softGaps.length > 0 || t.auditGaps.length > 0) {
        const tags = [
          ...t.softGaps.map((k) => `soft:${labelFor(k)}`),
          ...t.auditGaps.map((k) => `audit:${labelFor(k)}`),
        ].join("  ");
        drawText(ctx, tags, { size: 9, indent: 12, color: [0.5, 0.4, 0.1] });
      }
    }
  }

  drawHeading(ctx, "Attestations");
  if (graph.attestations.length === 0) {
    drawText(ctx, "(none)", { size: 10 });
  } else {
    for (const a of graph.attestations) {
      drawText(
        ctx,
        `${a.attestedAt.toISOString().slice(0, 16).replace("T", " ")} · ${a.attestationType} · ${a.attestorName} (${a.attestorRole})`,
        { size: 10, bold: true },
      );
      drawKv(ctx, "  email", a.attestorEmail);
      drawKv(ctx, "  hash", short(a.integrityHash));
      if (a.attestationType === "LABOUR_HIRE_SELF") {
        drawKv(
          ctx,
          "  hours",
          a.labourHireHours == null ? "-" : a.labourHireHours.toFixed(2),
        );
        drawKv(ctx, "  award", a.labourHireAwardClass ?? "-");
        drawKv(
          ctx,
          "  super",
          a.labourHireSuperRate == null
            ? "-"
            : `${(a.labourHireSuperRate * 100).toFixed(1)}%`,
        );
      }
      await drawSignature(ctx, a.signatureDataUrl, `signature`);
    }
  }

  drawDivider(ctx);
  drawText(
    ctx,
    `Generated ${new Date().toISOString()} from RestoreAssist.`,
    { size: 8, color: [0.5, 0.5, 0.5] },
  );

  return ctx.doc.save();
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function short(s: string): string {
  return s.length <= 16 ? s : `${s.slice(0, 8)}…${s.slice(-8)}`;
}

function labelFor(gateKey: string): string {
  return getGate(gateKey)?.label ?? gateKey;
}
