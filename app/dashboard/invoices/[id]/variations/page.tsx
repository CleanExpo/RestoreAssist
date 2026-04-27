"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, X, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getStatusConfig } from "@/lib/invoice-status";
import toast from "react-hot-toast";
import { useAsyncAction } from "@/lib/client/use-async-action";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  status: string;
  totalIncGST: number;
  customerName: string;
  customerEmail: string;
  invoiceDate: string;
  dueDate: string;
}

interface VariationInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  totalIncGST: number;
  subtotalExGST: number;
  notes?: string;
  createdAt: string;
  originalInvoiceId?: string;
  lineItems: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

type AdjustmentType = "ADDITION" | "REDUCTION" | "SUBSTITUTION";

interface VariationForm {
  reason: string;
  adjustmentType: AdjustmentType;
  amount: string;
  notes: string;
}

const EMPTY_FORM: VariationForm = {
  reason: "",
  adjustmentType: "ADDITION",
  amount: "",
  notes: "",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAUD(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Derive a signed display delta from a variation's line items vs the original. */
function getAmountDelta(variation: VariationInvoice): number {
  // The variation total relative to the original is stored in totalIncGST.
  // We surface it as-is (positive = addition, negative = reduction) based on
  // the description prefix set when creating. For display we use totalIncGST
  // signed: items created as REDUCTION have negative unitPrice.
  const hasNegativeItem = variation.lineItems.some((li) => li.unitPrice < 0);
  return hasNegativeItem
    ? -Math.abs(variation.totalIncGST)
    : variation.totalIncGST;
}

function getDeltaLabel(variation: VariationInvoice): {
  value: string;
  positive: boolean;
} {
  const delta = getAmountDelta(variation);
  return {
    value: (delta >= 0 ? "+" : "") + formatAUD(delta),
    positive: delta >= 0,
  };
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Skeleton className="h-5 w-36" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InvoiceVariationsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { id } = params;

  const [invoice, setInvoice] = useState<InvoiceSummary | null>(null);
  const [variations, setVariations] = useState<VariationInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<VariationForm>(EMPTY_FORM);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = async () => {
    try {
      const [invoiceRes, variationsRes] = await Promise.all([
        fetch(`/api/invoices/${id}`),
        fetch(`/api/invoices/${id}/variations`),
      ]);

      if (!invoiceRes.ok) {
        toast.error("Invoice not found");
        router.push("/dashboard/invoices");
        return;
      }

      const invoiceData = await invoiceRes.json();
      const variationsData = variationsRes.ok
        ? await variationsRes.json()
        : { variations: [] };

      setInvoice(invoiceData);
      setVariations(variationsData.variations ?? []);
    } catch {
      toast.error("Failed to load invoice data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ─── Form submit ────────────────────────────────────────────────────────────

  const { run: runSubmit, loading: submitting } = useAsyncAction(async () => {
    const amount = parseFloat(form.amount);

    // Build a single line item representing this variation adjustment.
    // REDUCTION uses a negative unit price so the delta math works naturally.
    const isReduction = form.adjustmentType === "REDUCTION";
    const unitPrice = isReduction ? -amount : amount;
    const adjustmentLabel =
      form.adjustmentType === "ADDITION"
        ? "Addition"
        : form.adjustmentType === "REDUCTION"
          ? "Reduction"
          : "Substitution";

    const lineItems = [
      {
        description: `[${adjustmentLabel}] ${form.reason.trim()}`,
        quantity: 1,
        unitPrice,
        gstRate: 10,
      },
    ];

    const notes = form.notes.trim() || undefined;

    try {
      const res = await fetch(`/api/invoices/${id}/variations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineItems, notes }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create variation");
      }

      toast.success("Variation created");
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchData();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create variation",
      );
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const amount = parseFloat(form.amount);
    if (!form.reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }

    void runSubmit();
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <PageSkeleton />;

  if (!invoice) return null;

  const statusCfg = getStatusConfig(invoice.status);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Back link */}
      <Link
        href={`/dashboard/invoices/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Invoice
      </Link>

      {/* Invoice summary card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="text-lg font-semibold">
              {invoice.invoiceNumber}
            </CardTitle>
            <Badge className={statusCfg.badgeClass}>{statusCfg.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">
              {invoice.customerName}
            </span>
            {invoice.customerEmail && (
              <span className="ml-2 text-muted-foreground">
                {invoice.customerEmail}
              </span>
            )}
          </p>
          <p>
            Total:{" "}
            <span className="font-semibold text-foreground">
              {formatAUD(invoice.totalIncGST)}
            </span>
          </p>
          <p>Due: {formatDate(invoice.dueDate)}</p>
        </CardContent>
      </Card>

      {/* Create variation section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Variations</h2>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create Variation
            </Button>
          )}
        </div>

        {showForm && (
          <Card className="border-primary/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">New Variation</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setShowForm(false);
                    setForm(EMPTY_FORM);
                  }}
                  aria-label="Close variation form"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Reason */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Reason <span className="text-destructive">*</span>
                  </label>
                  <Textarea
                    placeholder="Describe the reason for this variation..."
                    value={form.reason}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reason: e.target.value }))
                    }
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Adjustment type */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Adjustment Type{" "}
                      <span className="text-destructive">*</span>
                    </label>
                    <Select
                      value={form.adjustmentType}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          adjustmentType: v as AdjustmentType,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADDITION">Addition</SelectItem>
                        <SelectItem value="REDUCTION">Reduction</SelectItem>
                        <SelectItem value="SUBSTITUTION">
                          Substitution
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Amount */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">
                      Amount (AUD, ex GST){" "}
                      <span className="text-destructive">*</span>
                    </label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, amount: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea
                    placeholder="Optional internal notes..."
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowForm(false);
                      setForm(EMPTY_FORM);
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Saving..." : "Save Variation"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Variations list */}
      {variations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No variations yet for this invoice.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {variations.map((v, index) => {
            const vStatusCfg = getStatusConfig(v.status);
            const delta = getDeltaLabel(v);
            const firstLineItem = v.lineItems[0];

            return (
              <Card key={v.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">
                          {v.invoiceNumber}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Variation {index + 1}
                        </span>
                        <Badge className={vStatusCfg.badgeClass}>
                          {vStatusCfg.label}
                        </Badge>
                      </div>

                      {firstLineItem && (
                        <p className="text-sm text-muted-foreground truncate">
                          {firstLineItem.description}
                        </p>
                      )}

                      {v.notes && (
                        <p className="text-xs text-muted-foreground italic">
                          {v.notes}
                        </p>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Created {formatDate(v.createdAt)}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span
                        className={
                          "text-sm font-semibold tabular-nums " +
                          (delta.positive
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400")
                        }
                      >
                        {delta.value}
                      </span>
                      <Link href={`/dashboard/invoices/${v.id}`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          View
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
