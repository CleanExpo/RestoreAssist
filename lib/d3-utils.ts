/**
 * D3.js utility functions for data transformation and visualization
 * Provides helper functions for D3 force simulations, scale calculations, and data processing
 */

import * as d3 from 'd3'

/**
 * Node interface for network visualizations
 */
export interface D3Node {
  id: string
  label: string
  value?: number
  group?: string
  [key: string]: any
}

/**
 * Link interface for network visualizations
 */
export interface D3Link {
  source: string | D3Node
  target: string | D3Node
  value?: number
  [key: string]: any
}

/**
 * Create a force simulation for network graph
 * @param nodes Array of nodes
 * @param links Array of links
 * @param width Canvas width
 * @param height Canvas height
 * @returns Force simulation
 */
export function createForceSimulation(
  nodes: D3Node[],
  links: D3Link[],
  width: number = 800,
  height: number = 600
) {
  return d3
    .forceSimulation(nodes as d3.SimulationNodeDatum[])
    .force(
      'link',
      d3
        .forceLink(links as d3.SimulationLinkDatum<D3Node>[])
        .id((d: any) => d.id)
        .distance(80)
    )
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(30))
}

/**
 * Create a linear scale
 * @param domain Input domain
 * @param range Output range
 * @returns D3 linear scale
 */
export function createLinearScale(domain: [number, number], range: [number, number]) {
  return d3.scaleLinear().domain(domain).range(range)
}

/**
 * Create a color scale
 * @param domain Input domain
 * @param scheme D3 color scheme
 * @returns D3 color scale
 */
export function createColorScale(domain: number[], scheme: string = 'interpolateViridis') {
  const scaleFunction = (d3 as any)[scheme]
  return d3.scaleLinear<string>().domain(domain).interpolate(() => scaleFunction)
}

/**
 * Create categorical color scale
 * @param categories Array of category names
 * @returns D3 ordinal color scale
 */
export function createCategoryColorScale(categories: string[]) {
  return d3.scaleOrdinal<string, string>().domain(categories).range(d3.schemeCategory10)
}

/**
 * Create a time scale
 * @param domain Date range
 * @param range Output range
 * @returns D3 time scale
 */
export function createTimeScale(domain: [Date, Date], range: [number, number]) {
  return d3.scaleTime().domain(domain).range(range)
}

/**
 * Create a band scale for bar charts
 * @param domain Category domain
 * @param range Pixel range
 * @param padding Padding ratio
 * @returns D3 band scale
 */
export function createBandScale(domain: string[], range: [number, number], padding: number = 0.1) {
  return d3.scaleBand<string>().domain(domain).range(range).padding(padding)
}

/**
 * Group data by a specific field
 * @param data Array of objects
 * @param key Key to group by
 * @returns Grouped data
 */
export function groupData<T>(data: T[], key: keyof T): Map<any, T[]> {
  return d3.group(data, (d) => d[key])
}

/**
 * Calculate statistics for array
 * @param data Array of numbers
 * @returns Statistics object
 */
export function calculateStats(data: number[]) {
  return {
    min: d3.min(data) || 0,
    max: d3.max(data) || 0,
    mean: d3.mean(data) || 0,
    median: d3.median(data) || 0,
    sum: d3.sum(data) || 0,
    extent: d3.extent(data) as [number, number],
  }
}

/**
 * Create axis generator
 * @param scale D3 scale
 * @param orientation Axis orientation
 * @param ticks Number of ticks
 * @returns D3 axis generator
 */
export function createAxis(
  scale: any,
  orientation: 'bottom' | 'left' | 'top' | 'right' = 'bottom',
  ticks?: number
) {
  let axis: any
  if (orientation === 'bottom') {
    axis = d3.axisBottom(scale)
  } else if (orientation === 'left') {
    axis = d3.axisLeft(scale)
  } else if (orientation === 'top') {
    axis = d3.axisTop(scale)
  } else {
    axis = d3.axisRight(scale)
  }

  if (ticks) {
    axis.ticks(ticks)
  }

  return axis
}

/**
 * Format number for display
 * @param value Number to format
 * @param format Format specifier
 * @returns Formatted string
 */
export function formatNumber(value: number, format: string = '.2f'): string {
  return d3.format(format)(value)
}

/**
 * Format percentage
 * @param value Decimal value (0-1)
 * @returns Formatted percentage string
 */
export function formatPercent(value: number): string {
  return d3.format('.1%')(value)
}

/**
 * Create SVG path generator for line chart
 * @param xScale X scale
 * @param yScale Y scale
 * @param xAccessor Function to access X value
 * @param yAccessor Function to access Y value
 * @returns D3 line generator
 */
export function createLineGenerator(
  xScale: any,
  yScale: any,
  xAccessor: (d: any) => any,
  yAccessor: (d: any) => any
) {
  return d3
    .line<any>()
    .x((d) => xScale(xAccessor(d)))
    .y((d) => yScale(yAccessor(d)))
}

/**
 * Create SVG path generator for area chart
 * @param xScale X scale
 * @param yScale Y scale
 * @param xAccessor Function to access X value
 * @param yAccessor Function to access Y value
 * @param y0 Baseline Y value
 * @returns D3 area generator
 */
export function createAreaGenerator(
  xScale: any,
  yScale: any,
  xAccessor: (d: any) => any,
  yAccessor: (d: any) => any,
  y0: number
) {
  return d3
    .area<any>()
    .x((d) => xScale(xAccessor(d)))
    .y0(y0)
    .y1((d) => yScale(yAccessor(d)))
}

/**
 * Interpolate between two values
 * @param start Start value
 * @param end End value
 * @param t Interpolation factor (0-1)
 * @returns Interpolated value
 */
export function interpolateValue(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

/**
 * Convert degrees to radians
 * @param degrees Angle in degrees
 * @returns Angle in radians
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Convert radians to degrees
 * @param radians Angle in radians
 * @returns Angle in degrees
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

/**
 * Create a Voronoi diagram from points
 * @param points Array of [x, y] points
 * @param width Diagram width
 * @param height Diagram height
 * @returns Voronoi diagram generator
 */
export function createVoronoiDiagram(
  points: [number, number][],
  width: number,
  height: number
) {
  return d3.Delaunay.from(points).voronoi([0, 0, width, height])
}

/**
 * Generate bins for histogram
 * @param data Array of numbers
 * @param thresholds Number of bins or custom thresholds
 * @returns Array of bins
 */
export function createHistogramBins(data: number[], thresholds: number | number[] = 20) {
  return d3.histogram<number>().thresholds(thresholds)(data)
}

/**
 * Create a contour plot data generator
 * @param grid 2D grid of values
 * @param levels Contour levels
 * @returns Contours
 */
export function createContours(grid: number[][], levels: number[]) {
  const contourGenerator = d3.contours()
    .size([grid.length, grid[0]?.length || 0])
    .thresholds(levels)

  return contourGenerator(grid.flat())
}

/**
 * Transition helper for smooth animations
 * @param selection D3 selection
 * @param duration Duration in milliseconds
 * @returns D3 transition
 */
export function createTransition(selection: any, duration: number = 500) {
  return selection.transition().duration(duration)
}

/**
 * Easing functions for animations
 */
export const easingFunctions = {
  linear: d3.easeLinear,
  quadIn: d3.easeQuadIn,
  quadOut: d3.easeQuadOut,
  quadInOut: d3.easeQuadInOut,
  cubicIn: d3.easeCubicIn,
  cubicOut: d3.easeCubicOut,
  cubicInOut: d3.easeCubicInOut,
  sinIn: d3.easeSinIn,
  sinOut: d3.easeSinOut,
  sinInOut: d3.easeSinInOut,
  backIn: d3.easeBackIn,
  backOut: d3.easeBackOut,
  backInOut: d3.easeBackInOut,
  elasticIn: d3.easeElasticIn,
  elasticOut: d3.easeElasticOut,
  elasticInOut: d3.easeElasticInOut,
}

/**
 * Get color scheme options
 */
export const colorSchemes = {
  viridis: 'interpolateViridis',
  plasma: 'interpolatePlasma',
  inferno: 'interpolateInferno',
  magma: 'interpolateMagma',
  cividis: 'interpolateCividis',
  cool: 'interpolateCool',
  warm: 'interpolateWarm',
  rainbow: 'interpolateRainbow',
}
