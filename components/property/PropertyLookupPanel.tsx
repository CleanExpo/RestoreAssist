"use client";

/**
 * PropertyLookupPanel — operator pastes a property-page's HTML + URL and gets
 * structured metadata back via /api/property/parse (spec §7, metadata-first).
 * Ungated: the operator supplies the HTML. Automated BYOK-Apify auto-fetch is the
 * separate gated follow-up (spec §6.4/§9).
 */
import { useState } from "react";

export interface PropertyEnrichmentResult {
  address: string;
  beds: number | null;
  baths: number | null;
  carSpaces: number | null;
  landSizeM2: number | null;
  floorAreaM2: number | null;
  propertyType: string | null;
  source: string;
  confidence: "high" | "medium" | "low";
}

const fmt = (v: number | null, suffix = "") =>
  v === null || v === undefined ? "—" : `${v}${suffix}`;

export function PropertyLookupPanel({ className }: { className?: string }) {
  const [html, setHtml] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [result, setResult] = useState<PropertyEnrichmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    html.trim().length > 0 && sourceUrl.trim().length > 0 && !loading;

  async function onExtract() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/property/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, sourceUrl }),
      });
      if (!res.ok) {
        setError(
          `Lookup failed (${res.status}). Check the URL and pasted HTML.`,
        );
        return;
      }
      const data = await res.json();
      setResult(data.property);
    } catch {
      setError("Network error — could not reach the parser.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={className}>
      <h2 className="text-sm font-semibold text-slate-900 mb-2">
        Property lookup (paste page)
      </h2>
      <label htmlFor="prop-url" className="block text-xs text-slate-500 mb-1">
        Source URL
      </label>
      <input
        id="prop-url"
        type="url"
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        placeholder="https://www.onthehouse.com.au/property/…"
        className="w-full px-2 py-1.5 mb-2 rounded-lg border border-slate-200 text-sm"
      />
      <label htmlFor="prop-html" className="block text-xs text-slate-500 mb-1">
        Page HTML
      </label>
      <textarea
        id="prop-html"
        value={html}
        onChange={(e) => setHtml(e.target.value)}
        rows={4}
        placeholder="Paste the property page's HTML source here…"
        className="w-full px-2 py-1.5 mb-2 rounded-lg border border-slate-200 text-sm font-mono"
      />
      <button
        type="button"
        onClick={onExtract}
        disabled={!canSubmit}
        className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-40"
      >
        {loading ? "Extracting…" : "Extract"}
      </button>

      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {result && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-slate-500">Address</dt>
          <dd className="text-slate-900">{result.address || "—"}</dd>
          <dt className="text-slate-500">Beds</dt>
          <dd className="text-slate-900">{fmt(result.beds)}</dd>
          <dt className="text-slate-500">Baths</dt>
          <dd className="text-slate-900">{fmt(result.baths)}</dd>
          <dt className="text-slate-500">Car spaces</dt>
          <dd className="text-slate-900">{fmt(result.carSpaces)}</dd>
          <dt className="text-slate-500">Land size</dt>
          <dd className="text-slate-900">{fmt(result.landSizeM2, " m²")}</dd>
          <dt className="text-slate-500">Floor area</dt>
          <dd className="text-slate-900">{fmt(result.floorAreaM2, " m²")}</dd>
        </dl>
      )}
    </div>
  );
}
