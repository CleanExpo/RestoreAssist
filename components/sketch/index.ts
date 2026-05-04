export { default as SketchCanvas } from "./SketchCanvas";
export type {
  SketchCanvasProps,
  FabricCanvasRef,
  ToolMode,
} from "./SketchCanvas";
export { SketchToolbar } from "./SketchToolbar";
export { SketchEditor } from "./SketchEditor";
export { FloorPlanUnderlayLoader } from "./FloorPlanUnderlayLoader";
export type { FloorPlanUnderlayLoaderProps } from "./FloorPlanUnderlayLoader";
export { SketchViewer } from "./SketchViewer";
export type { SketchViewerProps, SketchViewerFloor } from "./SketchViewer";

// ── V2 components ──────────────────────────────────────────
export { SketchEditorV2 } from "./SketchEditorV2";
export type { SketchEditorV2Props } from "./SketchEditorV2";
export { SketchDockToolbar } from "./SketchDockToolbar";
export type { DockPosition } from "./SketchDockToolbar";
export { SketchFloorTabs } from "./SketchFloorTabs";
export type { SketchFloor } from "./SketchFloorTabs";
export { SketchSelectionPanel } from "./SketchSelectionPanel";
export type { SelectedObject } from "./SketchSelectionPanel";
export { SketchMoistureLayer } from "./SketchMoistureLayer";
export type { MoisturePin } from "./SketchMoistureLayer";
export { SketchScaleModal } from "./SketchScaleModal";
export type { ScaleConfig } from "./SketchScaleModal";

// ── Router (V2 ↔ V3 switching) ─────────────────────────────
export { SketchEditorRouter } from "./SketchEditorRouter";
export type { SketchEditorRouterProps } from "./SketchEditorRouter";

// ── V3 components (wall-graph, Konva) ──────────────────────
// V3 is mounted via dynamic import only (Konva is ~250 KB and SSR-incompatible).
// Importing the module keeps types accessible without pulling Konva into the
// landing-page bundle.
export type { WallGraphTool, WallGraphCanvasProps } from "./v3/WallGraphCanvas";
export type { WallGraphEditorProps } from "./v3/WallGraphEditor";
export { parseInitialGraph } from "./v3/WallGraphEditor";
