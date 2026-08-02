"use client";

import { useRef, useState, useCallback } from "react";

const MAX_HISTORY = 50;

type FabricHistoryCanvas = {
  toJSON: (extras?: string[]) => object;
  loadFromJSON: (d: object) => Promise<unknown>;
  renderAll: () => void;
};

export interface SketchHistoryHandle {
  saveState: (canvas: { toJSON: (extras?: string[]) => object }) => void;
  undo: (canvas: FabricHistoryCanvas) => Promise<void>;
  redo: (canvas: FabricHistoryCanvas) => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  isLoading: boolean;
}

/**
 * useSketchHistory — undo/redo breadcrumb stack for Fabric.js canvases.
 *
 * Decoupled from SketchCanvas so it can be used by the SketchEditorV2
 * orchestrator without prop-drilling into the canvas imperative handle.
 */
export function useSketchHistory(): SketchHistoryHandle {
  const stackRef = useRef<string[]>([]);
  const idxRef = useRef(-1);
  const isLoadingRef = useRef(false);
  const [state, setState] = useState({ canUndo: false, canRedo: false });

  const saveState = useCallback(
    (canvas: { toJSON: (extras?: string[]) => object }) => {
      if (isLoadingRef.current) return;
      const json = JSON.stringify(canvas.toJSON(["data"]));
      // Truncate forward history on new action
      stackRef.current = stackRef.current.slice(0, idxRef.current + 1);
      stackRef.current.push(json);
      if (stackRef.current.length > MAX_HISTORY) stackRef.current.shift();
      idxRef.current = stackRef.current.length - 1;
      setState({
        canUndo: idxRef.current > 0,
        canRedo: false,
      });
    },
    [],
  );

  const undo = useCallback(async (canvas: FabricHistoryCanvas) => {
    if (idxRef.current <= 0) return;
    idxRef.current -= 1;
    isLoadingRef.current = true;
    const json = JSON.parse(stackRef.current[idxRef.current]);
    // Fabric v7: loadFromJSON returns a Promise (2nd arg is reviver, not done cb).
    await canvas.loadFromJSON(json);
    canvas.renderAll();
    isLoadingRef.current = false;
    setState({
      canUndo: idxRef.current > 0,
      canRedo: idxRef.current < stackRef.current.length - 1,
    });
  }, []);

  const redo = useCallback(async (canvas: FabricHistoryCanvas) => {
    if (idxRef.current >= stackRef.current.length - 1) return;
    idxRef.current += 1;
    isLoadingRef.current = true;
    const json = JSON.parse(stackRef.current[idxRef.current]);
    await canvas.loadFromJSON(json);
    canvas.renderAll();
    isLoadingRef.current = false;
    setState({
      canUndo: idxRef.current > 0,
      canRedo: idxRef.current < stackRef.current.length - 1,
    });
  }, []);

  return {
    saveState,
    undo,
    redo,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    isLoading: isLoadingRef.current,
  };
}
