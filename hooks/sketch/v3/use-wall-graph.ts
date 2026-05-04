"use client";

/**
 * useWallGraph — React adapter around the pure reducer in
 * `lib/sketch/v3/reducer.ts`. Owns the in-memory history stack, dispatches
 * actions, and exposes ergonomic selectors for the editor surface.
 *
 * Implementation note: no `useMemo` on derived values like the active floor —
 * we re-pick from `history.present` on every render. The cost is trivial
 * (object lookup) and avoids stale-closure bugs that plagued V2.
 */

import { useCallback, useReducer } from "react";
import {
  applyAction,
  newHistory,
  redo,
  undo,
  type HistoryState,
  type WallGraphAction,
} from "@/lib/sketch/v3/reducer";
import {
  emptyGraph,
  getActiveFloor,
  type Floor,
  type WallGraph,
} from "@/lib/sketch/v3/wall-graph-types";

type InternalAction =
  | { kind: "DISPATCH"; action: WallGraphAction }
  | { kind: "UNDO" }
  | { kind: "REDO" }
  | { kind: "RESET"; graph: WallGraph };

function historyReducer(
  state: HistoryState,
  action: InternalAction,
): HistoryState {
  switch (action.kind) {
    case "DISPATCH":
      return applyAction(state, action.action);
    case "UNDO":
      return undo(state);
    case "REDO":
      return redo(state);
    case "RESET":
      return newHistory(action.graph);
  }
}

export interface UseWallGraphResult {
  graph: WallGraph;
  activeFloor: Floor;
  canUndo: boolean;
  canRedo: boolean;
  dispatch: (action: WallGraphAction) => void;
  undo: () => void;
  redo: () => void;
  reset: (graph: WallGraph) => void;
  /**
   * Last error from a failed dispatch (validation/integrity violation).
   * Cleared on the next successful dispatch.
   */
  lastError: { code: string; message: string } | null;
}

export function useWallGraph(initial?: WallGraph): UseWallGraphResult {
  const [state, dispatch] = useReducer(
    historyReducer,
    initial ?? emptyGraph(`floor_${Date.now().toString(36)}`),
    newHistory,
  );

  // Errors are stored separately so a failed dispatch doesn't disrupt the
  // history stack. `useState` would re-render on every error change; useRef
  // would not re-render at all. We use a tiny secondary reducer pattern.
  const [errorState, setErrorState] = useReducer(
    (
      _prev: { code: string; message: string } | null,
      next: { code: string; message: string } | null,
    ) => next,
    null,
  );

  const safeDispatch = useCallback((action: WallGraphAction) => {
    try {
      dispatch({ kind: "DISPATCH", action });
      setErrorState(null);
    } catch (err) {
      const e = err as Error & { code?: string };
      setErrorState({
        code: e.code ?? "UNKNOWN",
        message: e.message ?? "Action failed",
      });
    }
  }, []);

  const undoFn = useCallback(() => dispatch({ kind: "UNDO" }), []);
  const redoFn = useCallback(() => dispatch({ kind: "REDO" }), []);
  const resetFn = useCallback(
    (graph: WallGraph) => dispatch({ kind: "RESET", graph }),
    [],
  );

  return {
    graph: state.present,
    activeFloor: getActiveFloor(state.present),
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dispatch: safeDispatch,
    undo: undoFn,
    redo: redoFn,
    reset: resetFn,
    lastError: errorState,
  };
}
