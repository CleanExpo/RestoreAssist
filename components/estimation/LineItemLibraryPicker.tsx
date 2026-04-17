"use client";

import { useEffect, useRef, useState } from "react";
import { BookMarked, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface LibraryPickItem {
  id: string;
  category: string;
  description: string;
  rate: number;
  unit: string;
}

interface Props {
  onPick: (item: LibraryPickItem) => void;
  disabled?: boolean;
}

/**
 * LineItemLibraryPicker — opens a dialog that searches the user's CostLibrary
 * and lets them insert a pre-saved item into the current estimate with a
 * single click. Paired with the "Save to library" bookmark button in
 * EstimationEngine so the full save-once / reuse-forever loop works.
 *
 * Endpoint: GET /api/cost-libraries/search?q=<term>&limit=20
 */
export function LineItemLibraryPicker({ onPick, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<LibraryPickItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/cost-libraries/search?q=${encodeURIComponent(q)}&limit=20`,
        );
        if (res.ok) {
          const data = await res.json();
          setItems(data.items ?? []);
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="border-slate-600 text-slate-200 hover:bg-slate-700"
      >
        <BookMarked className="mr-2" size={16} />
        Pick from Library
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pick from Cost Library</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              autoFocus
              placeholder="Search equipment, materials, labour…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 bg-slate-800 border-slate-600 text-white"
            />
          </div>

          <div className="mt-4 max-h-[400px] overflow-y-auto space-y-1">
            {loading && (
              <div className="flex items-center justify-center py-6 text-slate-400">
                <Loader2 size={16} className="animate-spin mr-2" /> Searching…
              </div>
            )}
            {!loading && q.trim().length < 2 && (
              <p className="text-center text-sm text-slate-500 py-6">
                Type at least 2 characters to search your library.
              </p>
            )}
            {!loading && q.trim().length >= 2 && items.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-6">
                No matches. Add a line item in the estimator and click the
                bookmark to save it for future jobs.
              </p>
            )}
            {!loading &&
              items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onPick(it);
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full text-left p-3 rounded-lg border border-slate-700 hover:border-cyan-500 hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {it.description}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {it.category}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-cyan-300">
                        ${it.rate.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-500">
                        per {it.unit}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
