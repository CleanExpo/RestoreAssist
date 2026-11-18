"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      return (error as { message: string }).message;
    }
  }
  return fallback;
}

/**
 * RA-8462 — take back a team invite sent to the wrong address. Asks first
 * (RA-8395), then soft-revokes it: the emailed link stops working and any
 * technician seat it held is free again.
 */
export function CancelInviteButton({
  invite,
  onCancelled,
}: {
  invite: { id: string; email: string };
  onCancelled: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const cancelInvite = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/team/invites/${invite.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(errorMessage(data, "Failed to cancel the invite"));
        return;
      }
      toast.success(`Invite to ${invite.email} cancelled`);
      setOpen(false);
      await onCancelled();
    } catch {
      toast.error("Failed to cancel the invite");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => !cancelling && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          Cancel invite
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this invite?</AlertDialogTitle>
          <AlertDialogDescription>
            The invite link sent to <strong>{invite.email}</strong> will stop
            working straight away, and any seat it was holding will be free
            again. This cannot be undone; you can send a new invite at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>Keep invite</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Keep the dialog open until the request settles.
              event.preventDefault();
              void cancelInvite();
            }}
            disabled={cancelling}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            {cancelling ? "Cancelling..." : "Cancel invite"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
