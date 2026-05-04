"use client";

/**
 * SketchEditorRouter — decides whether to mount the V2 (Fabric) or V3
 * (Konva wall-graph) editor for a given inspection + floor.
 *
 * Decision tree:
 *   1. If a server-side sketch already exists for the floor and its
 *      sketchType is `wall_graph_v3`, mount V3 (always, regardless of flag).
 *   2. Else if `process.env.NEXT_PUBLIC_SKETCH_V3_ENABLED === "true"`, mount V3
 *      for new sketches.
 *   3. Else mount V2.
 *
 * V3 is lazy-loaded — Konva is ~250 KB gzipped and SSR-incompatible. Loading
 * V2 always instead would be wasteful.
 *
 * The router also surfaces an error boundary that falls back to V2 if V3
 * fails to mount (e.g. older browser without OffscreenCanvas).
 */

import { Component, type ReactNode, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { SketchEditorV2 } from "./SketchEditorV2";
import type { SketchEditorV2Props } from "./SketchEditorV2";
import { parseInitialGraph } from "./v3/WallGraphEditor";
import type { WallGraph } from "@/lib/sketch/v3/wall-graph-types";

const WallGraphEditorLazy = dynamic(
  () => import("./v3/WallGraphEditor").then((m) => ({ default: m.WallGraphEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading wall-graph editor…
      </div>
    ),
  },
);

export interface SketchEditorRouterProps extends SketchEditorV2Props {
  /** Floor index to load (defaults to 0). */
  floorNumber?: number;
  floorLabel?: string;
}

interface FetchedSketch {
  id: string;
  sketchType: string;
  sketchData: unknown;
  floorNumber: number;
  floorLabel: string;
  updatedAt: string;
}

const V3_FLAG_ON =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_SKETCH_V3_ENABLED === "true";

export function SketchEditorRouter(props: SketchEditorRouterProps) {
  const {
    inspectionId,
    floorNumber = 0,
    floorLabel = "Ground Floor",
    ...rest
  } = props;
  const [sketch, setSketch] = useState<FetchedSketch | null | undefined>(
    inspectionId ? undefined : null, // undefined = loading; null = none yet
  );

  useEffect(() => {
    if (!inspectionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/inspections/${inspectionId}/sketches`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setSketch(null);
          return;
        }
        const body = (await res.json()) as { sketches?: FetchedSketch[] };
        const match = (body.sketches ?? []).find(
          (s) => s.floorNumber === floorNumber,
        );
        if (!cancelled) setSketch(match ?? null);
      } catch {
        if (!cancelled) setSketch(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectionId, floorNumber]);

  if (sketch === undefined) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading sketch…
      </div>
    );
  }

  const useV3 =
    sketch?.sketchType === "wall_graph_v3" || (!sketch && V3_FLAG_ON);

  if (useV3 && inspectionId) {
    const initialGraph: WallGraph | null = sketch
      ? parseInitialGraph(sketch.sketchData)
      : null;
    return (
      <V3ErrorBoundary fallback={<SketchEditorV2 {...props} />}>
        <WallGraphEditorLazy
          inspectionId={inspectionId}
          sketchId={sketch?.id}
          initialGraph={initialGraph}
          floorNumber={floorNumber}
          floorLabel={sketch?.floorLabel ?? floorLabel}
        />
      </V3ErrorBoundary>
    );
  }

  return <SketchEditorV2 {...rest} inspectionId={inspectionId} />;
}

/** Error boundary that falls back to V2 if V3 fails to mount. */
class V3ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("WallGraphEditor failed; falling back to V2", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export default SketchEditorRouter;
