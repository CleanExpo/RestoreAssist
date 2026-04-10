"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { type UseCaseData, getUseCases } from "./use-case-data";

interface QuickFillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectUseCase: (useCase: UseCaseData) => void;
}

export function QuickFillDialog({
  open,
  onOpenChange,
  onSelectUseCase,
}: QuickFillDialogProps) {
  const useCases = getUseCases();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-2xl",
          "bg-white dark:bg-neutral-900",
          "border-neutral-200 dark:border-neutral-800",
        )}
      >
        <DialogHeader>
          <DialogTitle
            className={cn(
              "text-2xl font-semibold",
              "text-neutral-900 dark:text-neutral-50",
            )}
          >
            Select Use Case
          </DialogTitle>
          <DialogDescription
            className={cn("text-neutral-600 dark:text-neutral-400")}
          >
            Choose a use case to populate the form with sample data for testing
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {useCases.map((useCase) => (
            <button
              key={useCase.id}
              type="button"
              onClick={() => onSelectUseCase(useCase)}
              className={cn(
                "w-full p-4 rounded-lg border-2 text-left transition-all",
                "border-neutral-200 dark:border-neutral-700",
                "bg-white dark:bg-neutral-800",
                "hover:border-green-500 dark:hover:border-green-500",
                "hover:bg-green-50 dark:hover:bg-green-900/20",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3
                    className={cn(
                      "text-lg font-semibold mb-1",
                      "text-neutral-900 dark:text-neutral-50",
                    )}
                  >
                    {useCase.name}
                  </h3>
                  <p
                    className={cn(
                      "text-sm",
                      "text-neutral-600 dark:text-neutral-400",
                    )}
                  >
                    {useCase.description}
                  </p>
                </div>
                <ArrowRight
                  className={cn(
                    "w-5 h-5 flex-shrink-0",
                    "text-neutral-400 dark:text-neutral-500",
                  )}
                />
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
