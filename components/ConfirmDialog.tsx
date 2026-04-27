/**
 * RA-1566 — one-line replacement for native `confirm()`.
 *
 * Renders a shadcn AlertDialog and exposes a Promise-based API so
 * callsites can swap `if (!confirm("…")) return;` for:
 *
 *   const ok = await confirmDialog.ask({
 *     title: "Delete integration?",
 *     description: "This cannot be undone.",
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *
 * Usage:
 *
 *   const confirm = useConfirmDialog();
 *   // ... in render:
 *   <confirm.Mount />
 *   // ... in handler:
 *   if (!(await confirm.ask({...}))) return;
 *
 * Provides tone presets so destructive confirms always get the danger
 * button treatment.
 */

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmDialogOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type Resolver = (value: boolean) => void;

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmDialogOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const ask = useCallback((o: ConfirmDialogOptions): Promise<boolean> => {
    setOpts(o);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setOpen(false);
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(result);
  }, []);

  const Mount = useMemo(() => {
    return function ConfirmMount() {
      if (!opts) return null;
      return (
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (!next) close(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{opts.title}</AlertDialogTitle>
              {opts.description ? (
                <AlertDialogDescription>{opts.description}</AlertDialogDescription>
              ) : null}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => close(false)}>
                {opts.cancelLabel ?? "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => close(true)}
                className={
                  opts.destructive
                    ? "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-600"
                    : undefined
                }
              >
                {opts.confirmLabel ?? "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    };
  }, [open, opts, close]);

  return { ask, Mount };
}
