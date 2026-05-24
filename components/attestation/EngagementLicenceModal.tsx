"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import toast from "react-hot-toast";

interface MostRecentRow {
  subjectLicenceNumber: string | null;
  subjectLicenceState: string | null;
  subjectLicenceClass: string | null;
  whsCardNumber: string | null;
  publicLiabilityInsurer: string | null;
  publicLiabilityPolicyNumber: string | null;
  publicLiabilityCoverAmount: string | null;
  verifiedAt: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string | null;
  onConfirmed: (authorisationId: string) => void;
}

export function EngagementLicenceModal({
  open,
  onOpenChange,
  inspectionId,
  onConfirmed,
}: Props) {
  const [row, setRow] = useState<MostRecentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);

  const [iicrc, setIicrc] = useState("");
  const [whs, setWhs] = useState("");
  const [state, setState] = useState("");
  const [licenceClass, setLicenceClass] = useState("");
  const [insurer, setInsurer] = useState("");
  const [policy, setPolicy] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await fetch("/api/authorisations/most-recent");
      const data = await res.json().catch(() => ({ row: null }));
      if (cancelled) return;
      setRow(data.row);
      if (data.row) {
        setIicrc(data.row.subjectLicenceNumber ?? "");
        setWhs(data.row.whsCardNumber ?? "");
        setState(data.row.subjectLicenceState ?? "");
        setLicenceClass(data.row.subjectLicenceClass ?? "");
        setInsurer(data.row.publicLiabilityInsurer ?? "");
        setPolicy(data.row.publicLiabilityPolicyNumber ?? "");
      }
      setLoading(false);
      setEditing(!data.row);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSubmit() {
    if (!iicrc || !whs) {
      toast.error("IICRC and WHS are required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/authorisations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          subjectLicenceNumber: iicrc,
          whsCardNumber: whs,
          subjectLicenceState: state || undefined,
          subjectLicenceClass: licenceClass || undefined,
          publicLiabilityInsurer: insurer || undefined,
          publicLiabilityPolicyNumber: policy || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save credentials");
        return;
      }
      onConfirmed(data.authorisationId);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {row && !editing
              ? "Still using these credentials?"
              : "Add your credentials"}
          </DialogTitle>
          <DialogDescription>
            {row && !editing
              ? "We're checking because rule 28 requires verification at each engagement."
              : "RestoreAssist verifies your IICRC, WHS, and state licence at the moment you sign off evidence."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : row && !editing ? (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">IICRC:</span>{" "}
              {row.subjectLicenceNumber}
            </p>
            <p>
              <span className="text-muted-foreground">WHS:</span>{" "}
              {row.whsCardNumber}
            </p>
            <p>
              <span className="text-muted-foreground">State:</span>{" "}
              {row.subjectLicenceState ?? "—"} ·{" "}
              {row.subjectLicenceClass ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">PL Insurer:</span>{" "}
              {row.publicLiabilityInsurer ?? "—"} ·{" "}
              {row.publicLiabilityPolicyNumber ?? "—"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="iicrc">IICRC certificate number</Label>
              <Input
                id="iicrc"
                value={iicrc}
                onChange={(e) => setIicrc(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="whs">WHS card / White Card number</Label>
              <Input
                id="whs"
                value={whs}
                onChange={(e) => setWhs(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  placeholder="QLD"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="class">State licence (optional)</Label>
                <Input
                  id="class"
                  value={licenceClass}
                  onChange={(e) => setLicenceClass(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="insurer">
                Public liability insurer + policy #
              </Label>
              <Input
                id="insurer"
                value={insurer}
                onChange={(e) => setInsurer(e.target.value)}
              />
              <Input
                id="policy"
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {row && !editing ? (
            <>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full"
              >
                {submitting ? "Confirming…" : "Yes — confirm and continue →"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setEditing(true)}
                className="w-full"
              >
                Update something
              </Button>
            </>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full"
            >
              {submitting ? "Saving…" : "Verify and continue →"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
