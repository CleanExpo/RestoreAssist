"use client";

/**
 * AssessmentResultDisplay — renders the generated artefact set inline
 * after a successful POST. RA-1717 UI integration.
 *
 * Shape mirrors the API response from
 * /api/inspections/[id]/assessments/[type]/generate.
 */

import type {
  AssessmentReport,
  EstimateLine,
  EstimateTotals,
  ScopeItem,
  StandardCitation,
} from "@/lib/assessments/types";

export interface GenerateResultPayload {
  assessmentGenerationId: string;
  report: AssessmentReport;
  scope: { items: ScopeItem[] };
  estimate: { lines: EstimateLine[]; totals: EstimateTotals };
  citations: StandardCitation[];
  meta: {
    domain: string;
    generatedAt: string;
    modelUsed: string | null;
    latencyMs: number;
    costEstimateUsd: number | null;
    workspaceId: string | null;
  };
}

export default function AssessmentResultDisplay({
  result,
}: {
  result: GenerateResultPayload;
}) {
  const subtotal = result.estimate.totals.subtotalExGst.toFixed(2);
  const gst = result.estimate.totals.gstTotal.toFixed(2);
  const total = result.estimate.totals.totalIncGst.toFixed(2);

  function downloadJson() {
    const blob = new Blob([JSON.stringify(result, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.meta.domain}-${result.assessmentGenerationId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="border-t pt-3 mt-3 space-y-3">
      <details className="group" open>
        <summary className="cursor-pointer text-sm font-medium">
          Report ({result.report.sections.length} sections)
        </summary>
        <div className="mt-2 space-y-2">
          {result.report.sections.map((s, i) => (
            <div key={i} className="rounded border p-2 bg-muted/20">
              <div className="text-xs font-semibold">{s.heading}</div>
              <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                {s.body}
              </div>
              {s.citations && s.citations.length > 0 ? (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {s.citations
                    .map((c) => `${c.standard} ${c.section}`)
                    .join(" · ")}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">
          Scope ({result.scope.items.length} items)
        </summary>
        <div className="mt-2 overflow-x-auto rounded border">
          <table className="min-w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-2 py-1 text-left">Item</th>
                <th className="px-2 py-1 text-right">Qty</th>
                <th className="px-2 py-1 text-left">Unit</th>
                <th className="px-2 py-1 text-left">IICRC ref</th>
              </tr>
            </thead>
            <tbody>
              {result.scope.items.map((item, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">{item.description}</td>
                  <td className="px-2 py-1 text-right font-mono">
                    {item.quantity}
                  </td>
                  <td className="px-2 py-1">{item.unit}</td>
                  <td className="px-2 py-1 font-mono text-[10px]">
                    {item.iicrcRef}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium">
          Estimate (AUD ex GST {subtotal} · GST {gst} · total {total})
        </summary>
        <div className="mt-2 overflow-x-auto rounded border">
          <table className="min-w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-2 py-1 text-left">Line</th>
                <th className="px-2 py-1 text-right">Qty</th>
                <th className="px-2 py-1 text-right">Rate</th>
                <th className="px-2 py-1 text-right">Ex GST</th>
                <th className="px-2 py-1 text-right">Inc GST</th>
              </tr>
            </thead>
            <tbody>
              {result.estimate.lines.map((line, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">{line.description}</td>
                  <td className="px-2 py-1 text-right font-mono">
                    {line.quantity}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    ${line.rate.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    ${line.lineTotalExGst.toFixed(2)}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    ${line.lineTotalIncGst.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-wrap gap-2 items-center pt-1">
        <button
          type="button"
          onClick={downloadJson}
          className="px-3 py-1.5 text-xs rounded border"
        >
          Download JSON ↓
        </button>
        <span className="text-[10px] text-muted-foreground">
          Persisted as{" "}
          <code className="font-mono">{result.assessmentGenerationId}</code>
          {result.meta.modelUsed
            ? ` · ${result.meta.modelUsed}`
            : " · rule-based"}{" "}
          · {result.meta.latencyMs}ms
        </span>
      </div>
    </div>
  );
}
