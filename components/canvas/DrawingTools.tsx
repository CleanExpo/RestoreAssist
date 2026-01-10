'use client'

interface DrawingToolsProps {
  isDrawing: boolean
  selectedShape: 'rectangle' | 'circle' | 'triangle' | null
  historyIndex: number
  historyLength: number
  onDrawToggle: () => void
  onAddShape: (shape: 'rectangle' | 'circle' | 'triangle') => void
  onAddText: () => void
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
  onExportSVG: () => void
  onSave: () => void
  onClear: () => void
}

export function DrawingTools({
  isDrawing,
  selectedShape,
  historyIndex,
  historyLength,
  onDrawToggle,
  onAddShape,
  onAddText,
  onUndo,
  onRedo,
  onDelete,
  onExportSVG,
  onSave,
  onClear,
}: DrawingToolsProps) {
  return (
    <div className="flex flex-wrap gap-2 bg-slate-100 p-4 rounded-lg">
      {/* Drawing Tools */}
      <button
        onClick={onDrawToggle}
        className={`px-3 py-2 rounded font-medium text-sm transition ${
          isDrawing
            ? 'bg-blue-600 text-white'
            : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
        }`}
        title="Toggle freehand drawing mode"
      >
        ✏️ Draw
      </button>

      {/* Shape Tools */}
      <button
        onClick={() => onAddShape('rectangle')}
        className={`px-3 py-2 rounded font-medium text-sm transition ${
          selectedShape === 'rectangle'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
        }`}
        title="Add rectangle shape"
      >
        ▭ Rectangle
      </button>

      <button
        onClick={() => onAddShape('circle')}
        className={`px-3 py-2 rounded font-medium text-sm transition ${
          selectedShape === 'circle'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
        }`}
        title="Add circle shape"
      >
        ● Circle
      </button>

      <button
        onClick={() => onAddShape('triangle')}
        className={`px-3 py-2 rounded font-medium text-sm transition ${
          selectedShape === 'triangle'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
        }`}
        title="Add triangle shape"
      >
        △ Triangle
      </button>

      {/* Text Tool */}
      <button
        onClick={onAddText}
        className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition"
        title="Add text to canvas"
      >
        T Text
      </button>

      {/* Separator */}
      <div className="w-px bg-slate-300" />

      {/* Edit Tools */}
      <button
        onClick={onUndo}
        disabled={historyIndex <= 0}
        className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        title="Undo last action"
      >
        ↶ Undo
      </button>

      <button
        onClick={onRedo}
        disabled={historyIndex >= historyLength - 1}
        className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        title="Redo last action"
      >
        ↷ Redo
      </button>

      <button
        onClick={onDelete}
        className="px-3 py-2 rounded font-medium text-sm bg-white text-red-600 border border-red-300 hover:bg-red-50 transition"
        title="Delete selected object"
      >
        🗑️ Delete
      </button>

      {/* Separator */}
      <div className="w-px bg-slate-300" />

      {/* Export Tools */}
      <button
        onClick={onExportSVG}
        className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition"
        title="Export canvas as SVG"
      >
        📥 SVG
      </button>

      <button
        onClick={onSave}
        className="px-3 py-2 rounded font-medium text-sm bg-green-600 text-white hover:bg-green-700 transition"
        title="Save canvas as PNG"
      >
        💾 Save PNG
      </button>

      <button
        onClick={onClear}
        className="px-3 py-2 rounded font-medium text-sm bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 transition ml-auto"
        title="Clear entire canvas"
      >
        🔄 Clear All
      </button>
    </div>
  )
}
