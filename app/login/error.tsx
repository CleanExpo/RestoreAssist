"use client";

// app/login/error.tsx — Next.js App Router error boundary for /login.
//
// Why this exists (2026-05-13):
//   PR #942's branch was named `feat/ios-signin-v2-with-error-boundary` —
//   the author intended to wrap the iOS sign-in surfaces in an error
//   boundary, but the actual diff never added one. When any JS throw
//   bubbles past handleAppleSignIn / handleGoogleSignIn / OAuth lazy
//   imports during sign-in, the React tree unmounts and the iOS WebView
//   appears to "shut down" — which is exactly the regression reported
//   30 min after #940 shipped, prompting the precautionary revert #941.
//
// This route-segment error.tsx is the canonical Next.js fix: any uncaught
// render error inside /login (or its child segments) lands here instead
// of taking down the whole shell. The Try Again button calls `reset()`
// which re-mounts the segment fresh.
//
// Logging: console.error with a tagged prefix so iOS Web Inspector +
// Vercel logs make the source obvious. Wire to Sentry when the SDK lands.

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface LoginErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LoginError({ error, reset }: LoginErrorProps) {
  useEffect(() => {
    // Tagged log: grep `[login-error]` in Vercel + iOS Web Inspector to
    // find the underlying stack the moment the boundary fires.
    console.error("[login-error]", error.message, {
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
      <Card
        className="w-full max-w-md"
        style={{ backgroundColor: "#1C2E47", borderColor: "#2d4566" }}
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <CardTitle className="text-white text-lg leading-tight">
              Sign-in hit an unexpected error
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-slate-300 break-words">
            {error.message ||
              "Something interrupted the sign-in flow. Try again — if it keeps happening, reach out to support."}
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-slate-400 font-mono">
              ref: {error.digest}
            </p>
          )}
        </CardContent>

        <CardFooter>
          <Button
            onClick={reset}
            variant="outline"
            size="sm"
            className="border-slate-500 text-white hover:bg-slate-700 hover:text-white hover:border-slate-400"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
