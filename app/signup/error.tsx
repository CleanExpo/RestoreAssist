"use client";

// app/signup/error.tsx — Next.js App Router error boundary for /signup.
// See app/login/error.tsx for the full rationale; this is the matching
// boundary for the signup surface, which has the same Apple/Google
// native OAuth code path and the same crash exposure.

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

interface SignupErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SignupError({ error, reset }: SignupErrorProps) {
  useEffect(() => {
    console.error("[signup-error]", error.message, {
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
              Signup hit an unexpected error
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          <p className="text-sm text-slate-300 break-words">
            {error.message ||
              "Something interrupted the signup flow. Try again — if it keeps happening, reach out to support."}
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
