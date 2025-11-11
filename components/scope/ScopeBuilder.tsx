"use client";
import { useEffect, useState } from "react";
import AssemblyPicker from "./AssemblyPicker";
import LineItemRow from "./LineItemRow";
import TotalsBar from "./TotalsBar";
import OverridesPanel from "./OverridesPanel";

export default function ScopeBuilder({ reportId }: { reportId: string }) {
  const [draft, setDraft] = useState<any>(null);
  const [totals, setTotals] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // Load draft on mount
  useEffect(() => {
    loadDraft();
  }, [reportId]);

  // Recalculate totals when draft changes
  useEffect(() => {
    if (draft) {
      recalcTotals(draft);
    }
  }, [draft?.payload, draft?.overrides]);

  async function loadDraft() {
    setLoading(true);
    try {
      const response = await fetch(`/api/scope/draft/${reportId}`);
      const data = await response.json();
      setDraft(data);
    } catch (error) {
      console.error('Failed to load draft:', error);
    } finally {
      setLoading(false);
    }
  }

  async function recalcTotals(d = draft) {
    if (!d) return;

    try {
      const response = await fetch(`/api/scope/draft/${reportId}/totals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: d.payload,
          overrides: d.overrides
        })
      });
      const data = await response.json();
      setTotals(data);
    } catch (error) {
      console.error('Failed to recalculate totals:', error);
    }
  }

  async function saveDraft(updatedDraft: any) {
    try {
      await fetch(`/api/scope/draft/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: updatedDraft.payload,
          overrides: updatedDraft.overrides
        })
      });
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }

  function addLine(assembly: any) {
    const next = { ...draft };
    if (!next.payload) next.payload = { lines: [] };
    if (!next.payload.lines) next.payload.lines = [];

    next.payload.lines.push({
      id: crypto.randomUUID(),
      assembly_id: assembly.id,
      service_type: assembly.service_type,
      code: assembly.code,
      desc: assembly.name,
      unit: 'EA',
      qty: 1,
      days: 1,
      labour: assembly.labour || [],
      equipment: assembly.equipment || [],
      materials: assembly.materials || [],
      clause: assembly?.clauses?.[0]
        ? `Per ${assembly.clauses[0].standard} §${assembly.clauses[0].section}${assembly.clauses[0].description ? ': ' + assembly.clauses[0].description : ''}`
        : null,
      notes: null
    });

    setDraft(next);
    saveDraft(next);
  }

  function updateLine(id: string, patch: any) {
    const next = { ...draft };
    next.payload.lines = next.payload.lines.map((line: any) =>
      line.id === id ? { ...line, ...patch } : line
    );
    setDraft(next);
    saveDraft(next);
  }

  function removeLine(id: string) {
    const next = { ...draft };
    next.payload.lines = next.payload.lines.filter((line: any) => line.id !== id);
    setDraft(next);
    saveDraft(next);
  }

  function updateOverrides(newOverrides: any) {
    const next = { ...draft, overrides: newOverrides };
    setDraft(next);
    saveDraft(next);
  }

  async function finalize() {
    if (!confirm('Finalize this scope? This will generate the estimate and final PDF.')) {
      return;
    }

    setFinalizing(true);
    try {
      const response = await fetch(`/api/scope/draft/${reportId}/finalize`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.pdf_url) {
        alert(`✅ Finalized! PDF available at: ${data.pdf_url}`);
        // Optionally redirect to reports page or open PDF
        window.open(data.pdf_url, '_blank');
      } else {
        alert('✅ Scope finalized successfully!');
      }
    } catch (error) {
      console.error('Failed to finalize:', error);
      alert('❌ Failed to finalize scope. Check console for errors.');
    } finally {
      setFinalizing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-900">Loading Scope Builder...</div>
          <div className="text-gray-600 mt-2">Please wait</div>
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-xl font-semibold text-gray-900">Failed to load draft</div>
          <button
            onClick={loadDraft}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scope Builder</h1>
          <p className="text-gray-600 mt-1">
            Build your scope of works by adding assemblies and adjusting quantities
          </p>
        </div>
        <button
          disabled={finalizing}
          onClick={finalize}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2.5 rounded-lg font-medium shadow-md transition-colors"
        >
          {finalizing ? "Finalizing..." : "Finalize ➜ Generate PDF"}
        </button>
      </div>

      {/* Assembly Picker */}
      <AssemblyPicker reportId={reportId} onPick={addLine} />

      {/* Line Items */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Scope Lines ({draft.payload?.lines?.length || 0})
        </h2>
        {draft.payload?.lines?.length === 0 ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
            No scope lines yet. Add assemblies above to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {draft.payload.lines.map((line: any) => (
              <LineItemRow
                key={line.id}
                line={line}
                onChange={(patch) => updateLine(line.id, patch)}
                onRemove={() => removeLine(line.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* OH&P Overrides */}
      <OverridesPanel
        overrides={draft.overrides}
        onChange={updateOverrides}
      />

      {/* Live Totals */}
      <TotalsBar totals={totals} />

      {/* Finalize Button (bottom) */}
      <div className="flex justify-end">
        <button
          disabled={finalizing || (draft.payload?.lines?.length || 0) === 0}
          onClick={finalize}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-8 py-3 rounded-lg font-semibold shadow-lg transition-colors"
        >
          {finalizing ? "Finalizing..." : "Finalize ➜ Generate Estimate & PDF"}
        </button>
      </div>
    </div>
  );
}
