"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { reportClientError } from "@/lib/observability";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error);
    // RA-1543 — ship the exception to Vercel Observability via the
    // /api/observability/client-error sink so ops can filter + alert.
    reportClientError(error, {
      boundary: "DashboardError",
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card
        className="w-full max-w-md"
        style={{ backgroundColor: "#1C2E47", borderColor: "#2d4566" }}
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <CardTitle className="text-white text-lg leading-tight">
              Dashboard Error
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          <p className="text-sm text-slate-300">
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && (
            <p className="text-xs text-slate-500">Error ID: {error.digest}</p>
          )}
        </CardContent>

        <CardFooter className="gap-3">
          <Button
            onClick={reset}
            size="sm"
            style={{ backgroundColor: "#8A6B4E", borderColor: "#8A6B4E" }}
            className="text-white hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-slate-500 text-slate-300 hover:bg-slate-700 hover:text-white hover:border-slate-400"
          >
            <Link href="/dashboard">
              <Home className="h-4 w-4" />
              Go to Dashboard
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
