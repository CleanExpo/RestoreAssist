"use client";

/**
 * RA-1460 — Damage Report v1 view.
 *
 * Property-owner-facing layout. Plain-English, Grade-8, addresses reader as "you".
 * Print-optimised CSS (via `@media print` classes) — users can use browser
 * "Save as PDF" for a deterministic document, or click "Download PDF" to get
 * the server-generated IICRC PDF (secondary, via /api/reports/[id]/pdf).
 */

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Printer,
  Download,
  AlertTriangle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";

interface ReportViewData {
  id: string;
  reportNumber: string | null;
  title: string;
  status: string;
  clientName: string;
  propertyAddress: string;
  propertyPostcode: string | null;
  hazardType: string;
  incidentDate: Date | null;
  inspectionDate: Date | null;
  completionDate: Date | null;
  waterCategory: string | null;
  waterClass: string | null;
  sourceOfWater: string | null;
  affectedArea: number | null;
  technicianName: string | null;
  technicianFieldReport: string | null;
  accessNotes: string | null;
  structureType: string | null;
  buildingAge: number | null;
  scopeOfWorksDocument: string | null;
  scopeAreas: string | null;
  detailedReport: string | null;
  totalCost: number | null;
  createdAt: Date;
  user: {
    name: string | null;
    email: string | null;
    businessName: string | null;
    businessAddress: string | null;
    businessABN: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
  };
  client: {
    name: string;
    email: string;
    phone: string | null;
  } | null;
}

interface ScopeArea {
  name?: string;
  room?: string;
  length?: number;
  width?: number;
  height?: number;
  wetPercentage?: number;
  notes?: string;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "Not recorded";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "Not recorded";
  return d.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatAUD(amount: number | null): string {
  if (amount == null) return "To be confirmed";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function plainWaterCategory(category: string | null): string {
  if (!category) return "Not classified";
  const key = category.toUpperCase();
  if (key.includes("1")) return "Clean water — lowest risk to your health";
  if (key.includes("2"))
    return "Greywater — can make people sick if not treated";
  if (key.includes("3"))
    return "Blackwater — grossly contaminated and a health hazard";
  return category;
}

function plainWaterClass(waterClass: string | null): string {
  if (!waterClass) return "Not classified";
  const key = waterClass.toUpperCase();
  if (key.includes("1")) return "Small area of damp, easy to dry out";
  if (key.includes("2")) return "Whole room affected — drying the carpet and walls";
  if (key.includes("3"))
    return "Water came from above — ceilings, walls and floors all wet";
  if (key.includes("4"))
    return "Deep saturation of materials like stone or hardwood — slower to dry";
  return waterClass;
}

function parseScopeAreas(raw: string | null): ScopeArea[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function DamageReportView({
  report,
  shareToken,
}: {
  report: ReportViewData;
  shareToken?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const scopeAreas = parseScopeAreas(report.scopeAreas);
  const restorer =
    report.user.businessName ?? report.user.name ?? "Your restoration company";

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    setDownloading(true);
    setPdfError(null);
    try {
      const url = shareToken
        ? `/api/reports/${report.id}/pdf?token=${encodeURIComponent(shareToken)}`
        : `/api/reports/${report.id}/pdf`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `PDF generation failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `damage-report-${report.reportNumber ?? report.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "PDF download failed";
      // RA-1109: surface explicit error with actionable next step — no silent success.
      setPdfError(message);
      toast.error(`${message}. Try "Print / Save as PDF" instead.`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F6] print:bg-white">
      {/* Action bar — hidden on print */}
      <div className="sticky top-0 z-10 border-b bg-white shadow-sm print:hidden">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#5A6A7B]">
              Damage Report
            </p>
            <p className="text-sm font-semibold text-[#1C2E47]">
              {report.reportNumber ?? report.id.slice(0, 8)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Print / Save as PDF
            </Button>
            <Button
              size="sm"
              onClick={handleDownloadPdf}
              disabled={downloading}
              className="gap-2 bg-[#1C2E47] hover:bg-[#1C2E47]/90"
            >
              {downloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download PDF
                </>
              )}
            </Button>
          </div>
        </div>
        {pdfError && (
          <div className="mx-auto max-w-4xl px-4 pb-3 sm:px-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>PDF download failed</AlertTitle>
              <AlertDescription>
                {pdfError}. As a fallback, use &quot;Print / Save as PDF&quot; — your
                browser will save the page as a PDF file.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:px-0 print:py-0 sm:px-6">
        {/* 1. Cover */}
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="border-b">
            <p className="text-xs uppercase tracking-widest text-[#8A6B4E]">
              Damage Assessment Report
            </p>
            <CardTitle className="text-3xl text-[#1C2E47]">
              {report.propertyAddress}
            </CardTitle>
            <p className="text-sm text-[#5A6A7B]">
              Prepared for {report.client?.name ?? report.clientName}
            </p>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase text-[#5A6A7B]">Restorer</p>
                <p className="font-medium text-[#1C2E47]">{restorer}</p>
                {report.user.businessABN && (
                  <p className="text-sm text-[#5A6A7B]">
                    ABN {report.user.businessABN} · GST registered
                  </p>
                )}
                {report.user.businessAddress && (
                  <p className="text-sm text-[#5A6A7B]">
                    {report.user.businessAddress}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase text-[#5A6A7B]">Technician</p>
                <p className="font-medium text-[#1C2E47]">
                  {report.technicianName ?? report.user.name ?? "Not recorded"}
                </p>
                <p className="text-sm text-[#5A6A7B]">
                  IICRC credentials verified at engagement
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[#5A6A7B]">Inspection date</p>
                <p className="font-medium text-[#1C2E47]">
                  {formatDate(report.inspectionDate ?? report.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[#5A6A7B]">
                  Report reference
                </p>
                <p className="font-medium text-[#1C2E47]">
                  {report.reportNumber ?? report.id.slice(0, 10)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. What happened */}
        <Section title="What happened" number={2}>
          <p>
            {report.detailedReport
              ? firstParagraph(report.detailedReport)
              : defaultSummary(report.hazardType, report.sourceOfWater)}
          </p>
          <p className="mt-4 font-semibold text-[#1C2E47]">
            What this means for you:
          </p>
          <p>
            The affected parts of your home need professional drying and
            cleaning before any repairs happen. The sections below explain what
            we found, what we plan to do, and what decisions we need from you.
          </p>
        </Section>

        {/* 3. Your property */}
        <Section title="Your property" number={3}>
          <DetailRow label="Address">{report.propertyAddress}</DetailRow>
          {report.propertyPostcode && (
            <DetailRow label="Postcode">{report.propertyPostcode}</DetailRow>
          )}
          {report.structureType && (
            <DetailRow label="Building type">{report.structureType}</DetailRow>
          )}
          {report.buildingAge && (
            <DetailRow label="Year built">{report.buildingAge}</DetailRow>
          )}
          <DetailRow label="Inspected on">
            {formatDate(report.inspectionDate ?? report.createdAt)}
          </DetailRow>
          {report.accessNotes && (
            <DetailRow label="Access notes">{report.accessNotes}</DetailRow>
          )}
        </Section>

        {/* 4. What we found */}
        <Section title="What we found" number={4}>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBadge label="Water category">
              {plainWaterCategory(report.waterCategory)}
            </InfoBadge>
            <InfoBadge label="Water class">
              {plainWaterClass(report.waterClass)}
            </InfoBadge>
            {report.sourceOfWater && (
              <InfoBadge label="Source of water">
                {report.sourceOfWater}
              </InfoBadge>
            )}
            {report.affectedArea && (
              <InfoBadge label="Affected floor area">
                {report.affectedArea.toLocaleString("en-AU")} m²
              </InfoBadge>
            )}
          </div>
          {scopeAreas.length > 0 && (
            <>
              <p className="mt-6 font-medium text-[#1C2E47]">Affected rooms</p>
              <ul className="mt-2 space-y-1">
                {scopeAreas.map((area, i) => (
                  <li key={i} className="text-sm text-[#5A6A7B]">
                    <span className="font-medium text-[#1C2E47]">
                      {area.name ?? area.room ?? `Area ${i + 1}`}
                    </span>
                    {area.wetPercentage != null &&
                      ` — ${area.wetPercentage}% of the room is wet`}
                    {area.notes && ` · ${area.notes}`}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        {/* 5. Evidence */}
        <Section title="Evidence" number={5}>
          <p>
            Every photo taken during the inspection is time-stamped and
            GPS-tagged at the moment of capture. This means the evidence in this
            report can be verified by your insurer without any doubt about when
            or where it was taken.
          </p>
          <p className="mt-3 text-sm text-[#5A6A7B]">
            Full photo evidence is attached to the server-generated PDF. If you
            need the raw files, ask your restorer.
          </p>
        </Section>

        {/* 6. What we're going to do */}
        <Section title="What we're going to do" number={6}>
          {report.scopeOfWorksDocument ? (
            <div className="whitespace-pre-wrap rounded border border-[#8A6B4E]/20 bg-white p-4 text-sm leading-relaxed text-[#1C2E47]">
              {report.scopeOfWorksDocument}
            </div>
          ) : (
            <p>
              Scope of works is being finalised. Your restorer will share the
              detailed task list with prices before work begins.
            </p>
          )}
          {report.totalCost != null && (
            <div className="mt-4 rounded bg-[#1C2E47] p-4 text-white">
              <p className="text-xs uppercase tracking-wide opacity-75">
                Estimated total (inc. GST)
              </p>
              <p className="text-2xl font-bold">
                {formatAUD(report.totalCost)}
              </p>
              <p className="text-xs opacity-75">
                Ex. GST: {formatAUD(report.totalCost / 1.1)}
              </p>
            </div>
          )}
        </Section>

        {/* 7. What we need from you */}
        <Section title="What we need from you" number={7}>
          <Checklist
            items={[
              "Approve (or discuss) the scope of works above",
              "Confirm your preferred contact method and times",
              "Let your insurer know this report is available",
              "Keep pets and children out of the affected rooms until drying is complete",
            ]}
          />
        </Section>

        {/* 8. Standards */}
        <Section title="Standards we're working to" number={8}>
          <p>
            Your property is being assessed and dried to the IICRC S500:2025
            Standard §7.1 for professional water damage restoration. This is
            the same standard that every licensed restorer in Australia works
            to, and it is the standard your insurer expects.
          </p>
          <p className="mt-3">
            Australian Consumer Law and the applicable state building code
            apply to any structural or electrical repair work that follows.
          </p>
        </Section>

        {/* 9. Contacts + next steps */}
        <Section title="Your contacts and next steps" number={9}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-[#5A6A7B]">Restorer</p>
              <p className="font-medium text-[#1C2E47]">{restorer}</p>
              {report.user.businessPhone && (
                <p className="text-sm">{report.user.businessPhone}</p>
              )}
              {report.user.businessEmail && (
                <p className="text-sm">{report.user.businessEmail}</p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase text-[#5A6A7B]">Property owner</p>
              <p className="font-medium text-[#1C2E47]">
                {report.client?.name ?? report.clientName}
              </p>
              {report.client?.phone && (
                <p className="text-sm">{report.client.phone}</p>
              )}
              {report.client?.email && (
                <p className="text-sm">{report.client.email}</p>
              )}
            </div>
          </div>
          <p className="mt-4">
            Your restorer will be in touch within one business day to confirm
            the start date for drying equipment installation.
          </p>
        </Section>

        {/* 10. Attestation footer */}
        <Card className="mt-6 border-dashed print:border-solid print:shadow-none">
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-wide text-[#5A6A7B]">
              Attestation
            </p>
            <p className="mt-2 text-sm text-[#1C2E47]">
              This report was prepared by {restorer} for{" "}
              {report.client?.name ?? report.clientName} on{" "}
              {formatDate(report.createdAt)}. The information recorded here
              reflects on-site observations and measurements taken during the
              inspection. Report ID: <code>{report.id}</code>.
            </p>
          </CardContent>
        </Card>

        <div className="mt-6 text-center text-xs text-[#5A6A7B] print:hidden">
          <Link href="/" className="hover:underline">
            Powered by RestoreAssist
          </Link>
        </div>
      </main>

      {/* Print styles — keep deterministic, no dark mode, no animation */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          section,
          .card {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function Section({
  title,
  number,
  children,
}: {
  title: string;
  number: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="mt-6 print:mt-4 print:border-0 print:shadow-none">
      <CardHeader>
        <div className="flex items-baseline gap-3">
          <Badge
            variant="outline"
            className="border-[#8A6B4E] text-[#8A6B4E]"
          >
            {number}
          </Badge>
          <CardTitle className="text-xl text-[#1C2E47]">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-[15px] leading-relaxed text-[#1C2E47]">
        {children}
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-dashed border-[#5A6A7B]/20 py-2 last:border-0 sm:flex-row sm:gap-4">
      <span className="w-40 shrink-0 text-sm uppercase tracking-wide text-[#5A6A7B]">
        {label}
      </span>
      <span className="text-sm text-[#1C2E47]">{children}</span>
    </div>
  );
}

function InfoBadge({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-[#8A6B4E]/20 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-[#5A6A7B]">{label}</p>
      <p className="text-sm font-medium text-[#1C2E47]">{children}</p>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6B4E]"
            aria-hidden
          />
          <span className="text-sm text-[#1C2E47]">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function firstParagraph(text: string): string {
  const trimmed = text.trim();
  const idx = trimmed.indexOf("\n\n");
  const para = idx === -1 ? trimmed : trimmed.slice(0, idx);
  if (para.length <= 600) return para;
  return para.slice(0, 600) + "…";
}

function defaultSummary(hazardType: string, source: string | null): string {
  const what = source ? ` from ${source}` : "";
  return `Water entered the property${what}. The affected areas were inspected and measured on the date above. Hazard type: ${hazardType}.`;
}
