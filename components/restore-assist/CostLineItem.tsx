"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CostLineItemProps {
  code?: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  subtotal: number;
  formula?: string;
  isEditable?: boolean;
  isScopeLinked?: boolean;
  onUpdate?: (field: string, value: any) => void;
  onDelete?: () => void;
  className?: string;
}

export function CostLineItem({
  code,
  description,
  quantity,
  unit,
  rate,
  subtotal,
  formula,
  isEditable = true,
  isScopeLinked = false,
  onUpdate,
  onDelete,
  className,
}: CostLineItemProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(value);
  };

  return (
    <div className={cn("grid grid-cols-12 gap-4 items-center py-2 border-b last:border-b-0", className)}>
      {/* Code */}
      <div className="col-span-1">
        {code && <span className="text-sm text-muted-foreground">{code}</span>}
      </div>

      {/* Description */}
      <div className="col-span-4 flex items-center gap-2">
        <span className={cn("text-sm", isScopeLinked && "font-semibold")}>{description}</span>
        {formula && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-sm max-w-xs">{formula}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {/* Quantity */}
      <div className="col-span-2">
        {isEditable && !isScopeLinked ? (
          <Input
            type="number"
            value={quantity}
            onChange={(e) => onUpdate?.("quantity", parseFloat(e.target.value) || 0)}
            className="h-8 text-sm"
            step="0.01"
          />
        ) : (
          <span className="text-sm">{quantity.toFixed(2)}</span>
        )}
      </div>

      {/* Unit */}
      <div className="col-span-1">
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>

      {/* Rate */}
      <div className="col-span-2">
        {isEditable ? (
          <Input
            type="number"
            value={rate}
            onChange={(e) => onUpdate?.("rate", parseFloat(e.target.value) || 0)}
            className="h-8 text-sm"
            step="0.01"
          />
        ) : (
          <span className="text-sm">{formatCurrency(rate)}</span>
        )}
      </div>

      {/* Subtotal */}
      <div className="col-span-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{formatCurrency(subtotal)}</span>
        {isEditable && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function CostLineItemHeader() {
  return (
    <div className="grid grid-cols-12 gap-4 items-center py-2 border-b font-semibold text-sm text-muted-foreground">
      <div className="col-span-1">Code</div>
      <div className="col-span-4">Description</div>
      <div className="col-span-2">Quantity</div>
      <div className="col-span-1">Unit</div>
      <div className="col-span-2">Rate</div>
      <div className="col-span-2">Subtotal</div>
    </div>
  );
}
