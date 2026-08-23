"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CatalogueModel,
  OpenRouterCatalogue,
} from "@/lib/workspace/openrouter-catalogue";

/**
 * Mirrors the final fallback in `callAIProvider` (lib/ai-provider.ts): a blank
 * selection stores no slug, so routing lands on OPENROUTER_MODEL or this.
 * Shown as the placeholder so "leave it blank" is not a mystery box.
 */
export const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-chat";

/** Mirrors MAX_MODEL_SLUG_LENGTH in app/api/workspace/provider-connections. */
export const MAX_MODEL_SLUG_LENGTH = 128;

/**
 * Client-side bound on the catalogue request, comfortably above the route's own
 * 8s upstream timeout so a slow-but-live upstream still populates the picker.
 * Without it a stalled request leaves the field disabled on "Loading models…"
 * forever — the one state the free-text fallback exists to prevent.
 */
const CATALOGUE_TIMEOUT_MS = 12_000;

const UNAVAILABLE: OpenRouterCatalogue = {
  recommended: [],
  models: [],
  unavailable: true,
};

/**
 * Accept an upstream body only once its shape has actually been checked.
 *
 * `res.ok` says nothing about the payload. A proxy, an error page served as
 * JSON, or a future route change can all return 200 with a body like `{}` —
 * whose `unavailable` is merely ABSENT, not true. Trusting that would mark the
 * catalogue available and then dereference `.recommended.length` and
 * `.models.map`, crashing the modal: the exact opposite of the free-text
 * degradation this component exists to guarantee. Anything that is not two
 * arrays of well-formed entries degrades like an outage.
 */
function toCatalogue(json: unknown): OpenRouterCatalogue {
  if (!json || typeof json !== "object") return UNAVAILABLE;
  const raw = json as Partial<OpenRouterCatalogue>;
  // The route's own outage payload. Honoured explicitly rather than inferred
  // from the empty arrays it happens to carry.
  if (raw.unavailable === true) return UNAVAILABLE;

  // Total by construction — a non-array degrades to no entries rather than
  // throwing. Entries are rendered as <option> key/value/label, so one missing
  // a string id would produce a duplicate-key option with an undefined value.
  const clean = (entries: unknown): CatalogueModel[] =>
    Array.isArray(entries)
      ? entries.filter(
          (m): m is CatalogueModel =>
            !!m &&
            typeof m === "object" &&
            typeof (m as CatalogueModel).id === "string" &&
            (m as CatalogueModel).id.length > 0 &&
            typeof (m as CatalogueModel).name === "string",
        )
      : [];

  const models = clean(raw.models);
  // No usable models is not a catalogue — fall back rather than render a picker
  // whose only choice is the default.
  if (models.length === 0) return UNAVAILABLE;

  return {
    recommended: clean(raw.recommended),
    models,
    unavailable: false,
  };
}

const CONTROL_CLASS =
  "w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring placeholder:text-muted-foreground text-foreground font-mono";

interface OpenRouterModelFieldProps {
  value: string;
  onChange: (model: string) => void;
  /** Distinguishes the two modals on this page so labels bind to one control. */
  fieldId: string;
}

/**
 * OpenRouter routing-slug field for the Integrations page, backed by the live
 * catalogue at GET /api/workspace/openrouter-models.
 *
 * The slug list is read live rather than pinned: hardcoding `qwen/qwen3-…`
 * would go stale the moment OpenRouter ships the next revision, and a stale
 * slug is a 404 at report time. Every failure path — non-OK, malformed body,
 * network error, client timeout — degrades to the same free-text input, so an
 * OpenRouter outage can never block adding a key.
 */
export default function OpenRouterModelField({
  value,
  onChange,
  fieldId,
}: OpenRouterModelFieldProps) {
  const [catalogue, setCatalogue] = useState<OpenRouterCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), CATALOGUE_TIMEOUT_MS);

    fetch("/api/workspace/openrouter-models", { signal: abort.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: unknown) => {
        if (mounted.current) setCatalogue(toCatalogue(json));
      })
      .catch(() => {
        // Abort, network error, malformed body — all degrade to free text.
        if (mounted.current) setCatalogue(UNAVAILABLE);
      })
      .finally(() => {
        clearTimeout(timer);
        if (mounted.current) setLoading(false);
      });

    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, []);

  const hasCatalogue = !!catalogue && !catalogue.unavailable;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={fieldId}
        className="text-sm font-medium text-foreground"
      >
        Model{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </label>

      {loading ? (
        <input
          id={fieldId}
          type="text"
          value={value}
          placeholder="Loading models…"
          disabled
          readOnly
          className={CONTROL_CLASS}
        />
      ) : hasCatalogue ? (
        <select
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={CONTROL_CLASS}
        >
          <option value="">Use the default ({OPENROUTER_DEFAULT_MODEL})</option>
          {catalogue!.recommended.length > 0 && (
            <optgroup label="Recommended open models">
              {catalogue!.recommended.map((m: CatalogueModel) => (
                <option key={`rec-${m.id}`} value={m.id}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="All OpenRouter models">
            {catalogue!.models.map((m: CatalogueModel) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </optgroup>
        </select>
      ) : (
        <input
          id={fieldId}
          type="text"
          value={value}
          placeholder={OPENROUTER_DEFAULT_MODEL}
          // Mirrors the server bound in POST provider-connections. The slice is
          // the real guard: maxLength alone is bypassed by a paste in some
          // engines, and this value is serialised into an encrypted credential.
          maxLength={MAX_MODEL_SLUG_LENGTH}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_MODEL_SLUG_LENGTH))}
          autoComplete="off"
          className={CONTROL_CLASS}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {loading
          ? "Loading the current model list from OpenRouter…"
          : hasCatalogue
            ? "Leave blank to use the default. You can change this later."
            : "We couldn't reach OpenRouter's model list — paste a slug, or leave it blank for the default."}
      </p>
    </div>
  );
}
