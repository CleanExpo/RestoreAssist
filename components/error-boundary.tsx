"use client";

import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Default fallback UI
// ---------------------------------------------------------------------------

function DefaultFallback({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  return (
    <div className="min-h-[40vh] flex items-center justify-center p-6">
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
              Something went wrong
            </CardTitle>
          </div>
        </CardHeader>

        {error?.message && (
          <CardContent>
            <p className="text-sm text-slate-300 break-words">
              {error.message}
            </p>
          </CardContent>
        )}

        <CardFooter>
          <Button
            onClick={onReset}
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

// ---------------------------------------------------------------------------
// ErrorBoundary class component
// (React error boundaries must be class components — hooks cannot catch errors)
// ---------------------------------------------------------------------------

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log to console in development; wire up to your error reporter here
    console.error(
      "[ErrorBoundary] Uncaught error:",
      error,
      info.componentStack,
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <DefaultFallback error={this.state.error} onReset={this.handleReset} />
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// withErrorBoundary HOC — convenience wrapper
// ---------------------------------------------------------------------------

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode,
): React.FC<P> {
  const Wrapped: React.FC<P> = (props) => (
    <ErrorBoundary fallback={fallback}>
      <Component {...props} />
    </ErrorBoundary>
  );

  Wrapped.displayName = `withErrorBoundary(${Component.displayName ?? Component.name ?? "Component"})`;

  return Wrapped;
}

export default ErrorBoundary;
