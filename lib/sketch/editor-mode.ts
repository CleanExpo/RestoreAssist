/**
 * Quick Edit vs Advanced draw — Encircle Quick Editor analogue for tool depth,
 * not a UI clone. Quick = light correction after a plan arrives; Advanced = full CAD dock.
 */

import type { ToolMode } from "@/components/sketch/SketchCanvas";

export type SketchEditorMode = "quick" | "advanced";

export const EDITOR_MODE_STORAGE_KEY = "ra-sketch-editor-mode";

/** Quick Edit tools: select, label (text), measure, pan. */
export const QUICK_EDIT_TOOLS: ReadonlySet<ToolMode> = new Set([
  "select",
  "text",
  "measure",
  "pan",
]);

export function isSketchEditorMode(v: unknown): v is SketchEditorMode {
  return v === "quick" || v === "advanced";
}

export function isToolAllowedInMode(
  tool: ToolMode,
  mode: SketchEditorMode,
): boolean {
  if (mode === "advanced") return true;
  return QUICK_EDIT_TOOLS.has(tool);
}

export function coerceToolForMode(
  tool: ToolMode,
  mode: SketchEditorMode,
): ToolMode {
  return isToolAllowedInMode(tool, mode) ? tool : "select";
}

export function readEditorMode(
  storage: Pick<Storage, "getItem"> | null | undefined =
    typeof window !== "undefined" ? window.localStorage : null,
): SketchEditorMode {
  const raw = storage?.getItem(EDITOR_MODE_STORAGE_KEY);
  return isSketchEditorMode(raw) ? raw : "advanced";
}

export function writeEditorMode(
  mode: SketchEditorMode,
  storage: Pick<Storage, "setItem"> | null | undefined =
    typeof window !== "undefined" ? window.localStorage : null,
): void {
  storage?.setItem(EDITOR_MODE_STORAGE_KEY, mode);
}
