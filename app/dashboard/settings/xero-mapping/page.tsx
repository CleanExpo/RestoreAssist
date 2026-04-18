"use client";

/**
 * RA-874: Xero Account Code Mapping — Dashboard UI
 *
 * Operators configure per-category Xero account codes that override the
 * built-in defaults (200–205). Changes take effect immediately for all
 * subsequent invoice syncs — the resolver cache is invalidated on the server.
 *
 * Scope (v1):
 *   - 6 canonical categories as rows (LABOUR/EQUIPMENT/MATERIALS/SUBCONTRACTOR/
 *     PRELIMS/CONTENTS) — the ticket's AC
 *   - Free-form row for additional custom categories (operator can add their own)
 *   - Per-row save with inline validation + toast feedback
 *   - Reset-to-default (deletes the override row)
 *   - Empty state when Xero isn't connected
 *
 * Deferred to follow-up ticket:
 *   - Live Xero Accounts API browser (fetch /Accounts + autocomplete)
 *   - Damage-type dimension (schema doesn't support it yet)
 */

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useFetch } from "@/lib/hooks/useFetch";

// ─── Canonical categories + defaults (mirrors account-code-resolver.ts) ──────

const CANONICAL_ROWS: Array<{
  category: string;
  defaultCode: string;
  description: string;
}> = [
  { category: "LABOUR", defaultCode: "200", description: "Labour Income" },
  { category: "EQUIPMENT", defaultCode: "201", description: "Equipment Hire" },
  { category: "MATERIALS", defaultCode: "202", description: "Materials" },
  {
    category: "SUBCONTRACTOR",
    defaultCode: "203",
    description: "Subcontractors",
  },
  { category: "PRELIMS", defaultCode: "204", description: "Preliminary Items" },
  {
    category: "CONTENTS",
    defaultCode: "205",
    description: "Contents Restoration",
  },
];

// ─── Validation ───────────────────────────────────────────────────────────────

const XERO_NUMERIC_RE = /^\d{3,4}$/;
const XERO_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidCode(code: string): boolean {
  return XERO_NUMERIC_RE.test(code) || XERO_GUID_RE.test(code);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MappingRow {
  id: string;
  integrationId: string;
  category: string | null;
  accountCode: string;
  taxType: string;
  description: string | null;
}

interface ListResponse {
  data: MappingRow[];
  hasIntegration: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function XeroMappingPage() {
  const { data, loading, error, refetch } = useFetch<ListResponse>(
    "/api/xero-account-mapping",
  );

  const mappingsByCategory = useMemo(() => {
    const m = new Map<string, MappingRow>();
    if (data?.data) {
      for (const row of data.data) {
        // Use "__default__" sentinel for null (matches DELETE query)
        m.set(row.category ?? "__default__", row);
      }
    }
    return m;
  }, [data]);

  const hasIntegration = data?.hasIntegration ?? false;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1C2E47]">
          Xero Account Code Mapping
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Override the default Xero account codes used for invoice sync. Any
          category left blank uses the built-in default below.
        </p>
      </div>

      {loading && <LoadingSkeleton />}

      {!loading && error && (
        <Card>
          <CardContent className="p-6 text-sm text-red-600">
            Failed to load mappings: {error}
          </CardContent>
        </Card>
      )}

      {!loading && !error && !hasIntegration && <EmptyStateNoXero />}

      {!loading && !error && hasIntegration && (
        <Card>
          <CardHeader>
            <CardTitle className="text-[#1C2E47]">
              Canonical Categories
            </CardTitle>
            <CardDescription>
              These six categories cover most line items. Save an override below
              to route them to a different account in your Xero chart of
              accounts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1C2E47]/5">
                  <TableHead>Category</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead>Tax Type</TableHead>
                  <TableHead className="w-[240px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CANONICAL_ROWS.map((row) => (
                  <MappingRowEditor
                    key={row.category}
                    category={row.category}
                    defaultCode={row.defaultCode}
                    description={row.description}
                    existing={mappingsByCategory.get(row.category)}
                    onChange={refetch}
                  />
                ))}
                {/* Per-integration default (category = null) */}
                <MappingRowEditor
                  key="__default__"
                  category={null}
                  defaultCode="200"
                  description="Fallback for any category not listed above"
                  existing={mappingsByCategory.get("__default__")}
                  onChange={refetch}
                />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Row editor ───────────────────────────────────────────────────────────────

interface RowEditorProps {
  category: string | null;
  defaultCode: string;
  description: string;
  existing: MappingRow | undefined;
  onChange: () => void;
}

function MappingRowEditor({
  category,
  defaultCode,
  description,
  existing,
  onChange,
}: RowEditorProps) {
  const [code, setCode] = useState(existing?.accountCode ?? "");
  const [taxType, setTaxType] = useState(existing?.taxType ?? "OUTPUT");
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const displayLabel = category ?? "Default (all other categories)";

  const hasOverride = Boolean(existing);
  const dirty = code.trim() !== (existing?.accountCode ?? "");

  const onSave = async () => {
    setFieldError(null);
    const trimmed = code.trim();
    if (trimmed.length === 0) {
      setFieldError("Account code required");
      return;
    }
    if (!isValidCode(trimmed)) {
      setFieldError("Must be 3–4 digits or a Xero GUID");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/xero-account-mapping", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          accountCode: trimmed,
          taxType,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Save failed");
        return;
      }
      toast.success(`Saved ${displayLabel} → ${trimmed}`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    setSaving(true);
    try {
      const params = new URLSearchParams({
        category: category ?? "__default__",
      });
      const res = await fetch(
        `/api/xero-account-mapping?${params.toString()}`,
        { method: "DELETE" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Reset failed");
        return;
      }
      setCode("");
      setTaxType("OUTPUT");
      toast.success(`${displayLabel} reset to default`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{displayLabel}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {defaultCode}
      </TableCell>
      <TableCell>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          placeholder={defaultCode}
          className={`w-24 ${fieldError ? "border-red-500" : ""}`}
          aria-invalid={!!fieldError}
          aria-describedby={
            fieldError ? `err-${category ?? "default"}` : undefined
          }
        />
        {fieldError && (
          <div
            id={`err-${category ?? "default"}`}
            className="mt-1 text-xs text-red-600"
          >
            {fieldError}
          </div>
        )}
      </TableCell>
      <TableCell>
        <Input
          value={taxType}
          onChange={(e) => setTaxType(e.target.value)}
          placeholder="OUTPUT"
          className="w-32"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button onClick={onSave} disabled={saving || !dirty} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
          {hasOverride && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={saving}
            >
              Reset
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Skeleton + empty states ──────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded bg-muted"
              aria-hidden
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyStateNoXero() {
  return (
    <Card>
      <CardContent className="p-6 text-center">
        <h2 className="text-lg font-semibold">Connect Xero first</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You'll be able to customise account code mappings once Xero is
          connected.
        </p>
        <Button asChild className="mt-4">
          <a href="/dashboard/integrations">Go to integrations</a>
        </Button>
      </CardContent>
    </Card>
  );
}
