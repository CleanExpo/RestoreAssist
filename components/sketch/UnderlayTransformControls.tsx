"use client";

/**
 * UnderlayTransformControls — RA-120 (PR4b)
 *
 * Compact reposition/scale controls for the floor-plan underlay: a scale slider,
 * X/Y offset sliders, a lock-aspect toggle, and a reset. Purely presentational —
 * it reports changes as a partial patch; the parent owns the floor state and
 * persistence. Null values mean the legacy fit-to-width baseline.
 */

export interface UnderlayTransformValue {
  backgroundScale: number | null;
  backgroundOffsetX: number | null;
  backgroundOffsetY: number | null;
  backgroundLockAspect: boolean;
}

export interface UnderlayTransformControlsProps {
  value: UnderlayTransformValue;
  onChange: (patch: Partial<UnderlayTransformValue>) => void;
  className?: string;
}

const SCALE_MIN = 0.2;
const SCALE_MAX = 3;
const OFFSET_RANGE = 1000;

export function UnderlayTransformControls({
  value,
  onChange,
  className,
}: UnderlayTransformControlsProps) {
  const scale = value.backgroundScale ?? 1;
  const offsetX = value.backgroundOffsetX ?? 0;
  const offsetY = value.backgroundOffsetY ?? 0;

  const reset = () =>
    onChange({
      backgroundScale: null,
      backgroundOffsetX: null,
      backgroundOffsetY: null,
      backgroundLockAspect: true,
    });

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-neutral-300">
          Position &amp; scale
        </span>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Reset
        </button>
      </div>

      <label className="block text-xs text-neutral-400 mb-2">
        Scale ({Math.round(scale * 100)}%)
        <input
          type="range"
          min={SCALE_MIN}
          max={SCALE_MAX}
          step={0.05}
          value={scale}
          aria-label="Underlay scale"
          onChange={(e) =>
            onChange({ backgroundScale: Number(e.target.value) })
          }
          className="w-full mt-1"
        />
      </label>

      <label className="block text-xs text-neutral-400 mb-2">
        Horizontal ({offsetX}px)
        <input
          type="range"
          min={-OFFSET_RANGE}
          max={OFFSET_RANGE}
          step={5}
          value={offsetX}
          aria-label="Underlay horizontal offset"
          onChange={(e) =>
            onChange({ backgroundOffsetX: Number(e.target.value) })
          }
          className="w-full mt-1"
        />
      </label>

      <label className="block text-xs text-neutral-400 mb-2">
        Vertical ({offsetY}px)
        <input
          type="range"
          min={-OFFSET_RANGE}
          max={OFFSET_RANGE}
          step={5}
          value={offsetY}
          aria-label="Underlay vertical offset"
          onChange={(e) =>
            onChange({ backgroundOffsetY: Number(e.target.value) })
          }
          className="w-full mt-1"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-neutral-400">
        <input
          type="checkbox"
          checked={value.backgroundLockAspect}
          aria-label="Lock aspect ratio"
          onChange={(e) =>
            onChange({ backgroundLockAspect: e.target.checked })
          }
        />
        Lock aspect ratio
      </label>
    </div>
  );
}
