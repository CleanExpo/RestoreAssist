"use client"

interface ProfessionalDocumentViewerProps {
  content: string
}

export default function ProfessionalDocumentViewer({ content }: ProfessionalDocumentViewerProps) {
  if (!content) {
    return (
      <div className="p-8 text-center text-slate-400">
        <p>No content available</p>
      </div>
    )
  }

  // Simple professional formatting
  const formatContent = (text: string) => {
    let html = text
    
    // Convert section headers (## SECTION) - with better styling for category headers
    html = html.replace(/^##\s+(.*$)/gim, '<h2 class="text-xl font-bold text-slate-900 mt-8 mb-4 pb-3 border-b-2 border-cyan-300 bg-gradient-to-r from-cyan-50 to-transparent px-4 py-2 rounded-t-lg">$1</h2>')
    
    // Convert phase headers (### PHASE)
    html = html.replace(/^###\s+(.*$)/gim, '<h3 class="text-xl font-semibold text-slate-800 mt-6 mb-3">$1</h3>')
    
    // Convert main title (# TITLE)
    html = html.replace(/^#\s+(.*$)/gim, '<h1 class="text-3xl font-bold text-slate-900 mt-6 mb-6">$1</h1>')
    
    // Convert bold - special styling for category totals
    html = html.replace(/\*\*Category Total: (.*?)\*\*/g, '<div class="mt-4 pt-4 border-t-2 border-slate-300"><strong class="text-lg font-bold text-slate-900 bg-cyan-50 px-4 py-2 rounded inline-block">Category Total: $1</strong></div>')
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    
    // Format currency values
    // Use $$$1 where $$ = literal $ and $1 = capture group (the number)
    html = html.replace(/\$(\d+[\d,]*\.?\d*)/g, '<span class="text-green-600 font-semibold">$$$1</span>')
    
    // Format tables - handle pipe-delimited tables
    const lines = html.split('\n')
    let inTable = false
    let tableRows: string[] = []
    let formattedLines: string[] = []
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmedLine = line.trim()
      
      // Check if this is a table row (contains | and not just separators)
      if (trimmedLine.includes('|') && trimmedLine.startsWith('|')) {
        const cells = trimmedLine.split('|').map(c => c.trim()).filter(c => c && !c.match(/^[-:]+$/))
        if (cells.length > 1) {
          if (!inTable) {
            inTable = true
            tableRows = []
          }
          tableRows.push(cells)
          continue
        }
      }
      
      // If we were in a table and now we're not, close the table
      if (inTable && tableRows.length > 0) {
        formattedLines.push('<div class="overflow-x-auto my-6 shadow-sm rounded-lg border border-slate-200 bg-white">')
        formattedLines.push('<table class="w-full border-collapse">')
        tableRows.forEach((row, idx) => {
          const tag = idx === 0 ? 'th' : 'td'
          const isHeader = idx === 0
          const isEvenRow = idx > 0 && idx % 2 === 0
          const rowClass = isHeader 
            ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-b-2 border-cyan-200' 
            : isEvenRow 
              ? 'bg-slate-50 hover:bg-slate-100 transition-colors' 
              : 'bg-white hover:bg-slate-50 transition-colors'
          
          formattedLines.push(`<tr class="${rowClass}">`)
          row.forEach((cell, cellIdx) => {
            // Right-align numeric columns (last 2-3 columns usually)
            const isNumeric = /^\$?\d+[\d,]*\.?\d*$/.test(cell.replace('$', '').trim())
            const alignClass = (cellIdx >= row.length - 2 && isNumeric) 
              ? 'text-right font-mono' 
              : 'text-left'
            
            const cellPadding = isHeader ? 'px-6 py-4' : 'px-6 py-3'
            const cellTextClass = isHeader 
              ? 'font-bold text-slate-800 text-sm uppercase tracking-wide' 
              : isNumeric && cellIdx >= row.length - 2
                ? 'font-semibold text-slate-900'
                : 'text-slate-700'
            
            const borderClass = cellIdx < row.length - 1 ? 'border-r border-slate-200' : ''
            
            formattedLines.push(`<${tag} class="${cellPadding} ${alignClass} ${cellTextClass} ${borderClass}">${cell}</${tag}>`)
          })
          formattedLines.push('</tr>')
        })
        formattedLines.push('</table>')
        formattedLines.push('</div>')
        tableRows = []
        inTable = false
      }
      
      // Skip separator lines (just dashes)
      if (trimmedLine.match(/^[-=]+$/)) {
        continue
      }
      
      formattedLines.push(line)
    }
    
    // Handle any remaining table
    if (inTable && tableRows.length > 0) {
      formattedLines.push('<div class="overflow-x-auto my-6 shadow-sm rounded-lg border border-slate-200 bg-white">')
      formattedLines.push('<table class="w-full border-collapse">')
      tableRows.forEach((row, idx) => {
        const tag = idx === 0 ? 'th' : 'td'
        const isHeader = idx === 0
        const isEvenRow = idx > 0 && idx % 2 === 0
        const rowClass = isHeader 
          ? 'bg-gradient-to-r from-cyan-50 to-blue-50 border-b-2 border-cyan-200' 
          : isEvenRow 
            ? 'bg-slate-50 hover:bg-slate-100 transition-colors' 
            : 'bg-white hover:bg-slate-50 transition-colors'
        
        formattedLines.push(`<tr class="${rowClass}">`)
        row.forEach((cell, cellIdx) => {
          // Right-align numeric columns (last 2-3 columns usually)
          const isNumeric = /^\$?\d+[\d,]*\.?\d*$/.test(cell.replace('$', '').trim())
          const alignClass = (cellIdx >= row.length - 2 && isNumeric) 
            ? 'text-right font-mono' 
            : 'text-left'
          
          const cellPadding = isHeader ? 'px-6 py-4' : 'px-6 py-3'
          const cellTextClass = isHeader 
            ? 'font-bold text-slate-800 text-sm uppercase tracking-wide' 
            : isNumeric && cellIdx >= row.length - 2
              ? 'font-semibold text-slate-900'
              : 'text-slate-700'
          
          const borderClass = cellIdx < row.length - 1 ? 'border-r border-slate-200' : ''
          
          formattedLines.push(`<${tag} class="${cellPadding} ${alignClass} ${cellTextClass} ${borderClass}">${cell}</${tag}>`)
        })
        formattedLines.push('</tr>')
      })
      formattedLines.push('</table>')
      formattedLines.push('</div>')
    }
    
    html = formattedLines.join('\n')
    
    // Convert remaining line breaks to paragraphs
    html = html.split('\n').map(line => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      // Skip if already HTML
      if (trimmed.startsWith('<')) return line
      // Skip if it's a header (already processed)
      if (trimmed.match(/^<h[1-6]/)) return line
      return `<p class="mb-3 text-slate-700 leading-relaxed">${trimmed}</p>`
    }).filter(l => l).join('\n')
    
    return html
  }

  return (
    <div className="p-8 bg-gradient-to-br from-slate-50 to-white min-h-screen">
      <div 
        className="max-w-none text-slate-700 bg-white rounded-lg shadow-lg p-8"
        dangerouslySetInnerHTML={{ __html: formatContent(content) }}
      />
    </div>
  )
}

