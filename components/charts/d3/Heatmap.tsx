'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { createLinearScale, createColorScale, createAxis } from '@/lib/d3-utils'

interface HeatmapData {
  x: string | number
  y: string | number
  value: number
}

interface HeatmapProps {
  data: HeatmapData[]
  width?: number
  height?: number
  colorScheme?: string
  title?: string
  xLabel?: string
  yLabel?: string
  valueLabel?: string
  onCellClick?: (datum: HeatmapData) => void
}

export function Heatmap({
  data,
  width = 800,
  height = 600,
  colorScheme = 'interpolateViridis',
  title,
  xLabel = 'X',
  yLabel = 'Y',
  valueLabel = 'Value',
  onCellClick,
}: HeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return

    const margin = { top: 40, right: 30, bottom: 60, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Clear previous
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Get unique x and y values
    const xValues = [...new Set(data.map((d) => String(d.x)))]
    const yValues = [...new Set(data.map((d) => String(d.y)))]

    // Get value range
    const minValue = d3.min(data, (d) => d.value) || 0
    const maxValue = d3.max(data, (d) => d.value) || 0

    // Create scales
    const xScale = d3
      .scaleBand<string>()
      .domain(xValues)
      .range([0, innerWidth])
      .padding(0.05)

    const yScale = d3
      .scaleBand<string>()
      .domain(yValues.reverse())
      .range([0, innerHeight])
      .padding(0.05)

    // Create color scale
    const colorSchemeFunc = (d3 as any)[colorScheme] || d3.interpolateViridis
    const colorScale = d3
      .scaleLinear<string>()
      .domain([minValue, (minValue + maxValue) / 2, maxValue])
      .range(['#440154', '#31688e', '#35b779'])
      .interpolate(() => colorSchemeFunc)

    // Create main group
    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // Add title
    if (title) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', 25)
        .attr('text-anchor', 'middle')
        .attr('font-size', '16')
        .attr('font-weight', 'bold')
        .attr('fill', '#333')
        .text(title)
    }

    // Create cells
    g.selectAll('rect')
      .data(data)
      .enter()
      .append('rect')
      .attr('x', (d) => xScale(String(d.x)) || 0)
      .attr('y', (d) => yScale(String(d.y)) || 0)
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('fill', (d) => colorScale(d.value))
      .attr('stroke', 'white')
      .attr('stroke-width', 1)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        onCellClick?.(d)
      })
      .append('title')
      .text(
        (d) =>
          `${yLabel}: ${d.y}\n${xLabel}: ${d.x}\n${valueLabel}: ${d.value.toFixed(2)}`
      )

    // Add value labels on cells
    g.selectAll('text')
      .data(data)
      .enter()
      .append('text')
      .attr('x', (d) => (xScale(String(d.x)) || 0) + xScale.bandwidth() / 2)
      .attr('y', (d) => (yScale(String(d.y)) || 0) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('font-size', '11')
      .attr('fill', (d) => {
        // Light text for dark backgrounds, dark text for light
        const colorValue = d.value
        return colorValue > (minValue + maxValue) / 2 ? '#fff' : '#000'
      })
      .text((d) => d.value.toFixed(1))
      .style('pointer-events', 'none')

    // Add X axis
    const xAxis = createAxis(xScale, 'bottom')
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 50)
      .attr('fill', '#333')
      .attr('font-size', '14')
      .attr('text-anchor', 'middle')
      .text(xLabel)

    // Add Y axis
    const yAxis = createAxis(yScale, 'left')
    g.append('g')
      .call(yAxis)
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -50)
      .attr('fill', '#333')
      .attr('font-size', '14')
      .attr('text-anchor', 'middle')
      .text(yLabel)

    // Add color scale legend
    const legendHeight = 200
    const legendWidth = 20
    const legendX = width - 80
    const legendY = (height - legendHeight) / 2

    // Legend scale
    const legendScale = d3
      .scaleLinear()
      .domain([minValue, maxValue])
      .range([legendHeight, 0])

    // Legend gradient
    const defs = svg.append('defs')
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'legend-gradient')
      .attr('x1', '0%')
      .attr('x2', '0%')
      .attr('y1', '100%')
      .attr('y2', '0%')

    const steps = 100
    for (let i = 0; i <= steps; i++) {
      const value = minValue + ((maxValue - minValue) * i) / steps
      const colorSchemeFunc = (d3 as any)[colorScheme] || d3.interpolateViridis
      const color = colorSchemeFunc((value - minValue) / (maxValue - minValue))
      gradient
        .append('stop')
        .attr('offset', `${(i / steps) * 100}%`)
        .attr('stop-color', color)
    }

    // Legend rectangle
    svg
      .append('rect')
      .attr('x', legendX)
      .attr('y', legendY)
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .attr('fill', 'url(#legend-gradient)')
      .attr('stroke', '#999')

    // Legend axis
    const legendAxis = d3.axisRight(legendScale).ticks(5)
    svg
      .append('g')
      .attr('transform', `translate(${legendX + legendWidth},${legendY})`)
      .call(legendAxis)
      .append('text')
      .attr('x', 50)
      .attr('y', -legendHeight / 2)
      .attr('transform', `rotate(90, 50, ${-legendHeight / 2})`)
      .attr('fill', '#333')
      .attr('font-size', '12')
      .attr('text-anchor', 'middle')
      .text(valueLabel)
  }, [data, width, height, colorScheme, title, xLabel, yLabel, valueLabel, onCellClick])

  return (
    <div className="w-full border border-slate-300 rounded-lg overflow-hidden bg-white">
      <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
    </div>
  )
}
