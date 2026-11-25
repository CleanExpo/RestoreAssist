"use client";

import { DashboardInlineNotice } from "@/components/dashboard/DashboardInlineNotice";
import { SignInAgainButton } from "@/components/dashboard/SignInAgainButton";
import {
  NO_ACCESS_MESSAGE,
  SESSION_ENDED_MESSAGE,
} from "@/lib/client/customer-error-copy";

/** Shown when the workspace call answers 401 or 403. Display only. */
export function WorkspaceAccessNotice({ status }: { status: 401 | 403 }) {
  if (status === 401) {
    return (
      <DashboardInlineNotice
        tone="danger"
        title="You are signed out"
        body={SESSION_ENDED_MESSAGE}
        action={<SignInAgainButton callbackUrl="/dashboard" />}
      />
    );
  }
  return (
    <DashboardInlineNotice
      tone="danger"
      title="No access to this workspace"
      body={NO_ACCESS_MESSAGE}
    />
  );
}
