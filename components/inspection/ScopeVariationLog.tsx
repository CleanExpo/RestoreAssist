"use client";

import { useFetch } from "@/lib/hooks/useFetch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface ScopeVariation {
  id: string;
  createdAt: string;
  reason: string;
  source: string;
  costDeltaCents: number;
  status: "PENDING" | "APPROVED" | "AUTO_APPROVED" | "REJECTED";
}

interface ScopeVariationLogProps {
  inspectionId: string;
}

const statusBadgeVariants = {
  PENDING: "outline",
  APPROVED: "default",
  AUTO_APPROVED: "secondary",
  REJECTED: "destructive",
} as const;

const statusBadgeLabels = {
  PENDING: "Pending",
  APPROVED: "Approved",
  AUTO_APPROVED: "Auto Approved",
  REJECTED: "Rejected",
} as const;

export function ScopeVariationLog({ inspectionId }: ScopeVariationLogProps) {
  const { data, loading } = useFetch<ScopeVariation[]>(
    `/api/inspections/${inspectionId}/scope-variations`,
    { method: "GET" },
  );

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">Loading variations…</div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No scope variations recorded.
      </div>
    );
  }

  const formatAud = (cents: number): string => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(cents / 100);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="text-right">Delta</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((variation) => (
            <TableRow key={variation.id}>
              <TableCell className="text-sm">
                {formatDate(variation.createdAt)}
              </TableCell>
              <TableCell className="text-sm">{variation.reason}</TableCell>
              <TableCell className="text-sm">{variation.source}</TableCell>
              <TableCell className="text-right text-sm">
                {formatAud(variation.costDeltaCents)}
              </TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariants[variation.status]}>
                  {statusBadgeLabels[variation.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
