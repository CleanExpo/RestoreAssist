"use client";

/**
 * Root layout error boundary. Must stay minimal: own <html>/<body>, inline
 * styles only, no shared design-system or lib imports. External imports pull
 * this file into a wider Turbopack graph and break when a service worker or
 * stale HMR cache serves outdated chunks (module factory unavailable).
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
    // Inline report — avoid importing @/lib/observability here.
    try {
      void fetch("/api/observability/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error.message,
          name: error.name,
          stack: error.stack,
          url: typeof window !== "undefined" ? window.location.href : undefined,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          boundary: "GlobalError",
          digest: error.digest,
        }),
        keepalive: true,
      });
    } catch {
      // Reporting must never throw from an error boundary.
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0f172a",
            padding: "20px",
          }}
        >
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(239,68,68,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                fontSize: "32px",
              }}
            >
              !
            </div>
            <h2
              style={{
                color: "#fff",
                fontSize: "24px",
                fontWeight: 700,
                margin: "0 0 8px",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{ color: "#94a3b8", fontSize: "14px", margin: "0 0 24px" }}
            >
              A critical error occurred. Please try refreshing the page.
            </p>
            {error.digest && (
              <p
                style={{
                  color: "#475569",
                  fontSize: "12px",
                  margin: "0 0 16px",
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                padding: "10px 24px",
                background: "#06b6d4",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
