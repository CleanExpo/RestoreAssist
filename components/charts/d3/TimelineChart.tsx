'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { createTimeScale, createLinearScale, createAxis, createCategoryColorScale } from '@/lib/d3-utils'

interface TimelineEvent {
  id: string
  label: string
  startDate: Date
  endDate: Date
  category?: string
  description?: string
}

interface TimelineChartProps {
  events: TimelineEvent[]
  width?: number
  height?: number
  title?: string
  onEventClick?: (event: TimelineEvent) => void
}

export function TimelineChart({
  events,
  width = 1000,
  height = 400,
  title = 'Project Timeline',
  onEventClick,
}: TimelineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || events.length === 0) return

    const margin = { top: 40, right: 30, bottom: 60, left: 150 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Clear previous
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Get date range
    const allDates = events.flatMap((e) => [e.startDate, e.endDate])
    const minDate = d3.min(allDates) || new Date()
    const maxDate = d3.max(allDates) || new Date()

    // Create scales
    const xScale = createTimeScale(
      [minDate, new Date(maxDate.getTime() + 86400000)], // Add 1 day buffer
      [0, innerWidth]
    )

    const yScale = createLinearScale([0, events.length], [0, innerHeight])

    // Get categories for color
    const categories = [...new Set(events.map((e) => e.category || 'default'))]
    const colorScale = createCategoryColorScale(categories)

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

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(
        (d3.axisBottom(xScale) as any)
          .tickSize(-innerHeight)
          .tickFormat('')
      )
      .attr('stroke', '#999')

    // Create bars for events
    events.forEach((event, index) => {
      const x1 = xScale(event.startDate)
      const x2 = xScale(event.endDate)
      const y = yScale(index)
      const barHeight = yScale(1) * 0.7

      // Bar group
      const barGroup = g
        .append('g')
        .attr('class', 'timeline-bar')
        .style('cursor', 'pointer')

      // Bar rectangle
      barGroup
        .append('rect')
        .attr('x', x1)
        .attr('y', y - barHeight / 2)
        .attr('width', Math.max(x2 - x1, 2))
        .attr('height', barHeight)
        .attr('fill', colorScale(event.category || 'default'))
        .attr('stroke', '#333')
        .attr('stroke-width', 1)
        .attr('rx', 4)
        .on('click', () => onEventClick?.(event))

      // Bar label on the right
      barGroup
        .append('text')
        .attr('x', x2 + 10)
        .attr('y', y + 4)
        .attr('font-size', '12')
        .attr('fill', '#333')
        .text(event.label)

      // Tooltip on hover
      barGroup.append('title').text(
        `${event.label}\n${event.startDate.toLocaleDateString()} - ${event.endDate.toLocaleDateString()}\n${event.description || ''}`
      )
    })

    // Add Y axis (event names)
    g.append('g')
      .selectAll('text')
      .data(events)
      .enter()
      .append('text')
      .attr('x', -10)
      .attr('y', (_, i) => yScale(i) + 4)
      .attr('text-anchor', 'end')
      .attr('font-size', '12')
      .attr('fill', '#333')
      .text((d) => d.label)

    // Add X axis
    const xAxis = createAxis(xScale, 'bottom', 8)
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')
      .attr('dy', '0.5em')
      .attr('dx', '-0.5em')

    // Add X axis label
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 50)
      .attr('fill', '#333')
      .attr('font-size', '14')
      .attr('text-anchor', 'middle')
      .text('Date')

    // Add legend
    const legendX = width - 150
    const legendY = margin.top

    const legend = svg
      .append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${legendX},${legendY})`)

    legend
      .selectAll('rect')
      .data(categories)
      .enter()
      .append('rect')
      .attr('x', 0)
      .attr('y', (_, i) => i * 25)
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', (d) => colorScale(d))
      .attr('stroke', '#333')

    legend
      .selectAll('text')
      .data(categories)
      .enter()
      .append('text')
      .attr('x', 25)
      .attr('y', (_, i) => i * 25 + 12)
      .attr('font-size', '12')
      .attr('fill', '#333')
      .text((d) => d)
  }, [events, width, height, title, onEventClick])

  return (
    <div className="w-full border border-slate-300 rounded-lg overflow-hidden bg-white">
      <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
    </div>
  )
}
