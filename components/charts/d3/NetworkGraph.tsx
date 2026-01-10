'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { createForceSimulation, createCategoryColorScale } from '@/lib/d3-utils'

interface Node {
  id: string
  label: string
  value?: number
  group?: string
}

interface Link {
  source: string | Node
  target: string | Node
  value?: number
}

interface NetworkGraphProps {
  nodes: Node[]
  links: Link[]
  width?: number
  height?: number
  nodeRadius?: number
  onNodeClick?: (node: Node) => void
}

export function NetworkGraph({
  nodes,
  links,
  width = 800,
  height = 600,
  nodeRadius = 25,
  onNodeClick,
}: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    // Create SVG
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Create main group
    const g = svg.append('g')

    // Create force simulation
    const simulation = createForceSimulation(nodes, links, width, height)

    // Create color scale
    const groups = [...new Set(nodes.map(d => d.group || 'default'))]
    const colorScale = createCategoryColorScale(groups)

    // Create links
    const linkElements = g
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d: any) => Math.sqrt(d.value || 1) * 1.5)

    // Create nodes
    const nodeElements = g
      .append('g')
      .selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('r', (d) => (d.value ? Math.sqrt(d.value) * 3 : nodeRadius))
      .attr('fill', (d) => colorScale(d.group || 'default'))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGCircleElement, Node>()
          .on('start', dragStarted)
          .on('drag', dragged)
          .on('end', dragEnded)
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        onNodeClick?.(d)
      })

    // Create labels
    const labels = g
      .append('g')
      .selectAll('text')
      .data(nodes)
      .enter()
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.3em')
      .attr('font-size', '12')
      .attr('fill', '#333')
      .attr('font-weight', 'bold')
      .text((d) => d.label)
      .style('pointer-events', 'none')

    // Update positions on simulation tick
    simulation.on('tick', () => {
      linkElements
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      nodeElements
        .attr('cx', (d) => d.x!)
        .attr('cy', (d) => d.y!)

      labels
        .attr('x', (d) => d.x!)
        .attr('y', (d) => d.y!)
    })

    // Drag functions
    function dragStarted(event: d3.D3DragEvent<SVGCircleElement, Node, Node>) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
    }

    function dragged(event: d3.D3DragEvent<SVGCircleElement, Node, Node>) {
      event.subject.fx = event.x
      event.subject.fy = event.y
    }

    function dragEnded(event: d3.D3DragEvent<SVGCircleElement, Node, Node>) {
      if (!event.active) simulation.alphaTarget(0)
      event.subject.fx = null
      event.subject.fy = null
    }

    // Cleanup
    return () => {
      simulation.stop()
    }
  }, [nodes, links, width, height, nodeRadius, onNodeClick])

  return (
    <div className="w-full border border-slate-300 rounded-lg overflow-hidden bg-white">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      />
    </div>
  )
}
