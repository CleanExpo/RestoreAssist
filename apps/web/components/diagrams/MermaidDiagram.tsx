'use client'
import { useEffect, useRef } from 'react'

interface MermaidDiagramProps {
  chart: string
  title?: string
}

export function MermaidDiagram({ chart, title }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    import('mermaid').then((mermaid) => {
      mermaid.default.initialize({ startOnLoad: false, theme: 'dark' })
      if (ref.current) {
        ref.current.innerHTML = chart
        mermaid.default.run({ nodes: [ref.current] })
      }
    })
  }, [chart])

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-6">
      {title && <h3 className="mb-4 text-sm font-medium text-muted-foreground">{title}</h3>}
      <div ref={ref} className="mermaid overflow-x-auto">{chart}</div>
    </div>
  )
}
