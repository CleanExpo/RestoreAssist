/**
 * Canvas utility functions for fabric.js
 * Handles export, import, and manipulation of canvas data
 */

import { fabric } from 'fabric'

/**
 * Export canvas to SVG string
 * @param canvas Fabric.js canvas
 * @returns SVG string
 */
export function canvasToSVG(canvas: fabric.Canvas): string {
  return canvas.toSVG()
}

/**
 * Export canvas to JSON
 * @param canvas Fabric.js canvas
 * @returns JSON object
 */
export function canvasToJSON(canvas: fabric.Canvas): object {
  return canvas.toJSON()
}

/**
 * Export canvas to PNG data URL
 * @param canvas Fabric.js canvas
 * @param options Export options
 * @returns Base64 data URL
 */
export function canvasToDataURL(
  canvas: fabric.Canvas,
  options: {
    format?: string
    quality?: number
    width?: number
    height?: number
  } = {}
): string {
  return canvas.toDataURL({
    format: options.format || 'png',
    quality: options.quality || 1,
    width: options.width,
    height: options.height,
    left: 0,
    top: 0,
    multiplier: 1,
  })
}

/**
 * Load canvas from JSON
 * @param canvas Fabric.js canvas
 * @param json JSON object from canvasToJSON
 */
export async function loadCanvasFromJSON(
  canvas: fabric.Canvas,
  json: object
): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.loadFromJSON(json, () => {
      canvas.renderAll()
      resolve()
    }, (obj: any, error: any) => {
      if (error) {
        console.error('Error loading canvas from JSON:', error)
        reject(error)
      }
    })
  })
}

/**
 * Add text to canvas
 * @param canvas Fabric.js canvas
 * @param text Text content
 * @param options Text options
 */
export function addText(
  canvas: fabric.Canvas,
  text: string,
  options: {
    x?: number
    y?: number
    fontSize?: number
    fill?: string
    fontFamily?: string
  } = {}
): fabric.Text {
  const fabricText = new fabric.Text(text, {
    left: options.x || 0,
    top: options.y || 0,
    fontSize: options.fontSize || 20,
    fill: options.fill || '#000000',
    fontFamily: options.fontFamily || 'Arial',
  })

  canvas.add(fabricText)
  canvas.renderAll()
  return fabricText
}

/**
 * Add shape to canvas
 * @param canvas Fabric.js canvas
 * @param type Shape type: 'rectangle', 'circle', 'triangle'
 * @param options Shape options
 */
export function addShape(
  canvas: fabric.Canvas,
  type: 'rectangle' | 'circle' | 'triangle',
  options: {
    x?: number
    y?: number
    width?: number
    height?: number
    fill?: string
    stroke?: string
    strokeWidth?: number
  } = {}
): fabric.Object {
  const {
    x = 100,
    y = 100,
    width = 100,
    height = 100,
    fill = '#ff0000',
    stroke = '#000000',
    strokeWidth = 2,
  } = options

  let shape: fabric.Object

  if (type === 'rectangle') {
    shape = new fabric.Rect({
      left: x,
      top: y,
      width,
      height,
      fill,
      stroke,
      strokeWidth,
    })
  } else if (type === 'circle') {
    shape = new fabric.Circle({
      left: x,
      top: y,
      radius: width / 2,
      fill,
      stroke,
      strokeWidth,
    })
  } else {
    // Triangle
    const points = [
      [width / 2, 0],
      [width, height],
      [0, height],
    ] as const
    shape = new fabric.Polygon(
      points.map(([px, py]) => ({ x: px, y: py })),
      {
        left: x,
        top: y,
        fill,
        stroke,
        strokeWidth,
      }
    )
  }

  canvas.add(shape)
  canvas.renderAll()
  return shape
}

/**
 * Clear canvas
 * @param canvas Fabric.js canvas
 */
export function clearCanvas(canvas: fabric.Canvas): void {
  canvas.clear()
  canvas.renderAll()
}

/**
 * Get canvas dimensions
 * @param canvas Fabric.js canvas
 * @returns Width and height
 */
export function getCanvasDimensions(
  canvas: fabric.Canvas
): { width: number; height: number } {
  return {
    width: canvas.width || 0,
    height: canvas.height || 0,
  }
}

/**
 * Delete selected object from canvas
 * @param canvas Fabric.js canvas
 */
export function deleteSelected(canvas: fabric.Canvas): void {
  const activeObject = canvas.getActiveObject()
  if (activeObject) {
    canvas.remove(activeObject)
    canvas.renderAll()
  }
}

/**
 * Enable/disable drawing mode
 * @param canvas Fabric.js canvas
 * @param enabled Drawing mode enabled
 * @param brushColor Brush color (only when enabled)
 */
export function setDrawingMode(
  canvas: fabric.Canvas,
  enabled: boolean,
  brushColor: string = '#000000'
): void {
  canvas.isDrawingMode = enabled
  if (enabled && canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = brushColor
    canvas.freeDrawingBrush.width = 2
  }
}

/**
 * Get all canvas objects
 * @param canvas Fabric.js canvas
 * @returns Array of fabric objects
 */
export function getCanvasObjects(canvas: fabric.Canvas): fabric.Object[] {
  return canvas.getObjects()
}

/**
 * Undo last action (using history array)
 * @param canvas Fabric.js canvas
 * @param history History array with JSON states
 * @param currentIndex Current position in history
 */
export async function undo(
  canvas: fabric.Canvas,
  history: object[],
  currentIndex: number
): Promise<number> {
  if (currentIndex > 0) {
    const newIndex = currentIndex - 1
    await loadCanvasFromJSON(canvas, history[newIndex])
    return newIndex
  }
  return currentIndex
}

/**
 * Redo action (using history array)
 * @param canvas Fabric.js canvas
 * @param history History array with JSON states
 * @param currentIndex Current position in history
 */
export async function redo(
  canvas: fabric.Canvas,
  history: object[],
  currentIndex: number
): Promise<number> {
  if (currentIndex < history.length - 1) {
    const newIndex = currentIndex + 1
    await loadCanvasFromJSON(canvas, history[newIndex])
    return newIndex
  }
  return currentIndex
}

/**
 * Save canvas state to history
 * @param canvas Fabric.js canvas
 * @param history History array
 * @param currentIndex Current position
 */
export function saveToHistory(
  canvas: fabric.Canvas,
  history: object[],
  currentIndex: number
): { history: object[]; currentIndex: number } {
  // Remove any redo history
  history.splice(currentIndex + 1)

  // Add current state
  history.push(canvasToJSON(canvas))
  return {
    history,
    currentIndex: history.length - 1,
  }
}
