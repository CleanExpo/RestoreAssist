"use client";

import { isValidElement, type ReactNode } from "react";
import { Toaster, ToastBar, type Toast } from "react-hot-toast";
import { toastDisplayMessage } from "@/lib/api-error-message";

/**
 * Root toaster that refuses to render plain objects as toast children.
 *
 * After RA-1548, many API routes return `{ error: { code, message, eventId } }`.
 * Call sites that still do `toast.error(data.error)` pass that object straight
 * into react-hot-toast, which tries to render it and crashes the whole tree
 * with "Objects are not valid as a React child".
 *
 * This wrapper keeps the existing toastOptions look, and coerces any non-element
 * / non-string message through `toastDisplayMessage` before paint.
 */
function resolveMessage(toast: Toast): ReactNode {
  const raw = toast.message;
  if (typeof raw === "string" || typeof raw === "number") return String(raw);
  if (isValidElement(raw)) return raw;
  return toastDisplayMessage(raw);
}

export function SafeToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#1e293b",
          color: "#f1f5f9",
          border: "1px solid #334155",
          borderRadius: "12px",
          padding: "16px",
          fontSize: "14px",
          fontWeight: "500",
        },
        success: {
          iconTheme: {
            primary: "#10b981",
            secondary: "#f1f5f9",
          },
        },
        error: {
          iconTheme: {
            primary: "#ef4444",
            secondary: "#f1f5f9",
          },
        },
      }}
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon }) => (
            <>
              {icon}
              <div className="min-w-0 flex-1 px-2">{resolveMessage(t)}</div>
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
