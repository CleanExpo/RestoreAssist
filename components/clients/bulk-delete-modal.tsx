"use client";

import { X, Trash2 } from "lucide-react";

interface BulkDeleteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
}

export function BulkDeleteModal({
  open,
  onOpenChange,
  count,
  onConfirm,
}: BulkDeleteModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-red-400">
            Delete Selected Clients
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-slate-700 rounded"
          >
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <p className="text-slate-300">
            Are you sure you want to delete{" "}
            <span className="font-medium text-white">{count}</span> selected
            client(s)? This action cannot be undone.
          </p>
          <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4">
            <p className="text-amber-300 text-sm">
              ⚠️ This will permanently delete all selected clients and their
              associated data.
            </p>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => onOpenChange(false)}
              className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-rose-500 rounded-lg font-medium hover:shadow-lg hover:shadow-red-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group"
            >
              <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
              <span>Delete {count} Client(s)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
