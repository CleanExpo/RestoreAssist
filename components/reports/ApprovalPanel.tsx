"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, Plus } from "lucide-react";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
type ApprovalType = "SCOPE_OF_WORK" | "COST_ESTIMATE";

interface Approval {
  id: string;
  reportId: string;
  approvalType: ApprovalType;
  status: ApprovalStatus;
  requestedAt: string;
  respondedAt: string | null;
  clientComments: string | null;
  amount: number | null;
  createdAt: string;
}

interface ApprovalPanelProps {
  reportId: string;
}

const APPROVAL_TYPE_LABELS: Record<ApprovalType, string> = {
  SCOPE_OF_WORK: "Scope of Work",
  COST_ESTIMATE: "Cost Estimate",
};

function StatusBadge({ status }: { status: ApprovalStatus }) {
  switch (status) {
    case "PENDING":
      return (
        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
          Awaiting Response
        </Badge>
      );
    case "APPROVED":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          Approved
        </Badge>
      );
    case "REJECTED":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          Rejected
        </Badge>
      );
    case "CHANGES_REQUESTED":
      return (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          Changes Requested
        </Badge>
      );
  }
}

export default function ApprovalPanel({ reportId }: ApprovalPanelProps) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Form state for creating a new approval
  const [newType, setNewType] = useState<ApprovalType | "">("");
  const [newAmount, setNewAmount] = useState("");

  const fetchApprovals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reports/${reportId}/approvals`);
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals);
      }
    } catch (err) {
      console.error("Failed to load approvals:", err);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleCreate = async () => {
    if (!newType) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalType: newType,
          amount: newAmount ? parseFloat(newAmount) : undefined,
        }),
      });
      if (res.ok) {
        setDialogOpen(false);
        setNewType("");
        setNewAmount("");
        await fetchApprovals();
      }
    } catch (err) {
      console.error("Failed to create approval:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRespond = async (
    approvalId: string,
    status: "APPROVED" | "REJECTED",
  ) => {
    setRespondingId(approvalId);
    try {
      const res = await fetch(
        `/api/reports/${reportId}/approvals/${approvalId}/respond`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (res.ok) {
        await fetchApprovals();
      }
    } catch (err) {
      console.error("Failed to respond to approval:", err);
    } finally {
      setRespondingId(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  return (
    <>
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold text-slate-100">
            Approvals
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="bg-cyan-600 hover:bg-cyan-700 text-white h-8 gap-1"
          >
            <Plus size={14} />
            Request Approval
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full rounded-lg bg-slate-700/50" />
              <Skeleton className="h-14 w-full rounded-lg bg-slate-700/50" />
              <Skeleton className="h-14 w-full rounded-lg bg-slate-700/50" />
            </div>
          ) : approvals.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">
              No approvals requested yet.
            </p>
          ) : (
            <div className="space-y-3">
              {approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex flex-col gap-2 p-3 rounded-lg bg-slate-700/40 border border-slate-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {approval.status === "APPROVED" && (
                        <CheckCircle
                          size={15}
                          className="text-green-400 shrink-0"
                        />
                      )}
                      {approval.status === "REJECTED" && (
                        <XCircle size={15} className="text-red-400 shrink-0" />
                      )}
                      {approval.status === "PENDING" && (
                        <Clock size={15} className="text-amber-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-slate-200 truncate">
                        {APPROVAL_TYPE_LABELS[approval.approvalType]}
                        {approval.amount != null && (
                          <span className="ml-1 text-slate-400 font-normal">
                            — $
                            {approval.amount.toLocaleString("en-AU", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                        )}
                      </span>
                    </div>
                    <StatusBadge status={approval.status} />
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      Requested {formatDate(approval.requestedAt)}
                      {approval.respondedAt &&
                        ` · Responded ${formatDate(approval.respondedAt)}`}
                    </span>

                    {approval.status === "PENDING" && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          disabled={respondingId === approval.id}
                          onClick={() => handleRespond(approval.id, "APPROVED")}
                          className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={respondingId === approval.id}
                          onClick={() => handleRespond(approval.id, "REJECTED")}
                          className="h-7 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>

                  {approval.clientComments && (
                    <p className="text-xs text-slate-400 italic border-t border-slate-600/50 pt-2 mt-1">
                      &ldquo;{approval.clientComments}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-slate-100 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Approval</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="approval-type" className="text-slate-300">
                Approval Type <span className="text-red-400">*</span>
              </Label>
              <Select
                value={newType}
                onValueChange={(val) => setNewType(val as ApprovalType)}
              >
                <SelectTrigger
                  id="approval-type"
                  className="bg-slate-700/50 border-slate-600 text-slate-100"
                >
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem
                    value="SCOPE_OF_WORK"
                    className="text-slate-200 focus:bg-slate-700"
                  >
                    Scope of Work
                  </SelectItem>
                  <SelectItem
                    value="COST_ESTIMATE"
                    className="text-slate-200 focus:bg-slate-700"
                  >
                    Cost Estimate
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newType === "COST_ESTIMATE" && (
              <div className="space-y-2">
                <Label htmlFor="approval-amount" className="text-slate-300">
                  Amount (optional)
                </Label>
                <Input
                  id="approval-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="bg-slate-700/50 border-slate-600 text-slate-100 placeholder:text-slate-500"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              disabled={!newType || submitting}
              onClick={handleCreate}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
