'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

interface SankeyNode {
  name: string
}

interface SankeyLink {
  source: number
  target: number
  value: number
}

interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

interface SankeyFlowProps {
  data: SankeyData
  width?: number
  height?: number
  title?: string
  onLinkClick?: (link: SankeyLink) => void
  onNodeClick?: (node: SankeyNode) => void
}

export function SankeyFlow({
  data,
  width = 900,
  height = 500,
  title = 'Flow Diagram',
  onLinkClick,
  onNodeClick,
}: SankeyFlowProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !data.nodes || !data.links) return

    // Clear previous
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 40, right: 30, bottom: 30, left: 30 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // Create Sankey generator
    const sankey = d3
      .sankey<SankeyNode, SankeyLink>()
      .nodeWidth(15)
      .nodePadding(50)
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ])

    // Generate Sankey layout
    const { nodes: layoutNodes, links: layoutLinks } = sankey({
      nodes: data.nodes.map((d) => ({ ...d })),
      links: data.links.map((d) => ({ ...d })),
    })

    // Create color scale
    const colorScale = d3.scaleOrdinal<string>().range(d3.schemeCategory10)

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

    // Create links
    const linkGroup = g.append('g').attr('fill', 'none').attr('stroke-opacity', 0.5)

    linkGroup
      .selectAll('path')
      .data(layoutLinks)
      .enter()
      .append('path')
      .attr('d', d3.sankeyLinkHorizontal() as any)
      .attr('stroke', (d, i) => colorScale(String(i)))
      .attr('stroke-width', (d) => Math.max(1, d.width || 1))
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        onLinkClick?.(d as any)
      })
      .append('title')
      .text(
        (d) =>
          `${(d.source as any).name} → ${(d.target as any).name}\nValue: ${d.value || 0}`
      )

    // Create nodes
    const nodeGroup = g
      .append('g')
      .selectAll('g')
      .data(layoutNodes)
      .enter()
      .append('g')
      .attr('class', 'sankey-node')
      .style('cursor', 'pointer')

    nodeGroup
      .append('rect')
      .attr('x', (d) => (d.x0 || 0) + (d.x1 || 0))
      .attr('y', (d) => d.y0)
      .attr('height', (d) => (d.y1 || 0) - (d.y0 || 0))
      .attr('width', 15)
      .attr('fill', (d, i) => colorScale(String(i)))
      .attr('stroke', '#333')
      .on('click', (event, d) => {
        event.stopPropagation()
        onNodeClick?.(d as any)
      })
      .append('title')
      .text((d) => `${(d as any).name}`)

    // Create node labels
    nodeGroup
      .append('text')
      .attr('x', (d) => (d.x0 || 0) - 6)
      .attr('y', (d) => ((d.y1 || 0) - (d.y0 || 0)) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('font-size', '12')
      .attr('fill', '#333')
      .attr('font-weight', 'bold')
      .text((d) => (d as any).name)
      .style('pointer-events', 'none')

    // Add value labels on links
    linkGroup
      .selectAll('text')
      .data(layoutLinks)
      .enter()
      .append('text')
      .attr('x', (d) => ((d.source as any).x1 + (d.target as any).x0) / 2)
      .attr(
        'y',
        (d) =>
          ((d.y0 || 0) + (d.y1 || 0)) / 2 - 5
      )
      .attr('text-anchor', 'middle')
      .attr('font-size', '11')
      .attr('fill', '#666')
      .text((d) => {
        const value = d.value || 0
        return value > 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
      })
      .style('pointer-events', 'none')

    // Add background
    svg
      .insert('rect', 'g')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', '#f9f9f9')
      .attr('pointer-events', 'none')
  }, [data, width, height, title, onLinkClick, onNodeClick])

  return (
    <div className="w-full border border-slate-300 rounded-lg overflow-hidden bg-white">
      <svg ref={svgRef} width={width} height={height} style={{ display: 'block' }} />
    </div>
  )
}
