"use client";

import { Crown, XIcon } from "lucide-react";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpgrade: () => void;
}

export function UpgradeModal({
  open,
  onOpenChange,
  onUpgrade,
}: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-neutral-200 dark:border-slate-700 max-w-md w-full p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
              <Crown className="text-white" size={24} />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Upgrade Required
            </h2>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-neutral-100 dark:hover:bg-slate-700 rounded text-neutral-600 dark:text-slate-300"
          >
            <XIcon size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-neutral-700 dark:text-slate-300">
            To create clients, you need an active subscription (Monthly or
            Yearly plan).
          </p>
          <p className="text-sm text-neutral-600 dark:text-slate-400">
            Upgrade now to unlock all features including unlimited clients,
            reports, API integrations, and priority support.
          </p>
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2 border border-neutral-300 dark:border-slate-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md text-neutral-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={onUpgrade}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-orange-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group text-white"
            >
              <Crown className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
              <span>Upgrade Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
