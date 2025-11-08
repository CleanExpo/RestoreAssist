"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface PhaseItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  hours?: number;
  rate?: number;
  subtotal?: number;
}

interface PhaseSectionProps {
  title: string;
  description?: string;
  status?: "pending" | "in-progress" | "completed";
  items: PhaseItem[];
  defaultExpanded?: boolean;
  className?: string;
  children?: React.ReactNode;
}

const statusConfig = {
  pending: { label: "Pending", className: "bg-gray-500" },
  "in-progress": { label: "In Progress", className: "bg-blue-500" },
  completed: { label: "Completed", className: "bg-green-500" },
};

export function PhaseSection({
  title,
  description,
  status = "pending",
  items,
  defaultExpanded = true,
  className,
  children,
}: PhaseSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const totalHours = items.reduce((sum, item) => sum + (item.hours || 0), 0);
  const totalCost = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(value);
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
              <CardTitle className="text-xl">{title}</CardTitle>
              <Badge className={statusConfig[status].className}>
                {statusConfig[status].label}
              </Badge>
            </div>
            {description && <CardDescription className="mt-2 ml-8">{description}</CardDescription>}
          </div>
          <div className="text-right space-y-1">
            <div className="text-sm text-muted-foreground">{totalHours.toFixed(1)} hours</div>
            <div className="text-lg font-semibold">{formatCurrency(totalCost)}</div>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-6">
          {children || (
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <div className="flex-1">
                    <span className="text-sm">{item.description}</span>
                    <div className="text-xs text-muted-foreground mt-1">
                      {item.quantity} {item.unit}
                      {item.hours && ` • ${item.hours.toFixed(1)} hours`}
                    </div>
                  </div>
                  {item.subtotal !== undefined && (
                    <div className="text-sm font-medium">{formatCurrency(item.subtotal)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
