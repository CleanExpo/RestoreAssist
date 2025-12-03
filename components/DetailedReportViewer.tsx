"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { FileText, Download, Copy, Check, RefreshCw } from "lucide-react"
import ReactMarkdown from "react-markdown"
import toast from "react-hot-toast"

interface DetailedReportViewerProps {
  detailedReport: string | null
  reportId: string
}

export default function DetailedReportViewer({ detailedReport, reportId }: DetailedReportViewerProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)

  // Ensure detailedReport is a string
  const reportContent = typeof detailedReport === 'string' ? detailedReport : ''

  const handleCopy = async () => {
    if (reportContent) {
      try {
        await navigator.clipboard.writeText(reportContent)
        setCopied(true)
        toast.success("Detailed report copied to clipboard!")
        setTimeout(() => setCopied(false), 2000)
      } catch (error) {
        toast.error("Failed to copy report")
      }
    }
  }

  const handleDownload = () => {
    if (reportContent) {
      const blob = new Blob([reportContent], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `detailed-report-${reportId}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Detailed report downloaded!")
    }
  }

  const handleDownloadEnhancedPDF = async () => {
    try {
      setDownloading(true)
      toast.loading('Generating enhanced PDF...', { id: 'download-enhanced' })
      const response = await fetch(`/api/reports/${reportId}/download-enhanced`)
      
      if (!response.ok) {
        const error = await response.json()
        toast.error(error.error || 'Failed to download enhanced PDF', { id: 'download-enhanced' })
        return
      }

      const blob = await response.blob()
      
      // Check if blob is valid
      if (!blob || blob.size === 0) {
        toast.error('Generated PDF is empty', { id: 'download-enhanced' })
        return
      }

      // Verify it's a PDF
      const firstBytes = await blob.slice(0, 4).text()
      if (!firstBytes.startsWith('%PDF')) {
        // Not a PDF, might be an error message
        try {
          const text = await blob.text()
          const error = JSON.parse(text)
          toast.error(error.error || 'Failed to download enhanced PDF', { id: 'download-enhanced' })
        } catch (e) {
          toast.error('Invalid response format', { id: 'download-enhanced' })
        }
        return
      }

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `enhanced-report-${reportId}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Enhanced PDF downloaded successfully!', { id: 'download-enhanced' })
    } catch (error) {
      console.error('Error downloading enhanced PDF:', error)
      toast.error('Failed to download enhanced PDF', { id: 'download-enhanced' })
    } finally {
      setDownloading(false)
    }
  }

  const handleGenerateReport = async () => {
    setGenerating(true)
    try {
      toast.loading('Regenerating enhanced report...', { id: 'regenerate-enhanced' })
      
      // Use the inspection report generation endpoint which regenerates the text report
      const response = await fetch('/api/reports/generate-inspection-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportId,
          reportType: 'enhanced'
        })
      })

      if (!response.ok) {
        try {
        const errorData = await response.json()
          toast.error(errorData.error || 'Failed to regenerate enhanced report', { id: 'regenerate-enhanced' })
        } catch (e) {
          toast.error('Failed to regenerate enhanced report', { id: 'regenerate-enhanced' })
        }
        return
      }

      const data = await response.json()
      
      if (data.report?.detailedReport) {
        // Refresh the page data without full reload
        router.refresh()
        toast.success('Enhanced report regenerated successfully! Refreshing...', { id: 'regenerate-enhanced' })
      } else {
        toast.error('Failed to regenerate enhanced report', { id: 'regenerate-enhanced' })
      }
    } catch (error) {
      console.error('Error regenerating enhanced report:', error)
      toast.error('Failed to regenerate enhanced report', { id: 'regenerate-enhanced' })
    } finally {
      setGenerating(false)
    }
  }

  if (!detailedReport) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="w-6 h-6 text-slate-400" />
          <h3 className="text-lg font-semibold text-white">AI-Generated Detailed Report</h3>
        </div>
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-400 mb-2">No detailed report available</p>
          <p className="text-sm text-slate-500 mb-4">
            The AI-powered detailed report generation may have failed or is still processing.
          </p>
          <button
            onClick={handleGenerateReport}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mx-auto"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Generate Detailed Report'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-slate-900 rounded-lg border border-slate-700/50 shadow-xl overflow-hidden">
      {/* Professional Header */}
      <div className="flex items-center justify-between px-8 py-6 border-b border-slate-700/50 bg-gradient-to-r from-slate-800/50 to-slate-800/30 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 rounded-lg border border-cyan-500/30">
            <FileText className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Professional Inspection Report</h2>
            <p className="text-sm text-slate-400 mt-1">
              AI-Enhanced Report • AS-IICRC S500:2025 Compliant • Queensland NCC & QDC 4.5 Standards
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopy}
            disabled={copied}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-all duration-200 border border-slate-600/50 hover:border-slate-500 disabled:opacity-50"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={() => handleGenerateReport()}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-all duration-200 border border-slate-600/50 hover:border-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Regenerating...' : 'Regenerate'}
          </button>
          <button
            onClick={handleDownloadEnhancedPDF}
            disabled={downloading}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-700 hover:to-cyan-600 text-white rounded-lg transition-all duration-200 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Generating...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Full Height Content Area - Always Expanded */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="max-w-6xl mx-auto">
            <div className="prose prose-invert prose-lg max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-3xl font-bold text-white mb-6 mt-8 first:mt-0 border-b border-slate-700/50 pb-3">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-2xl font-bold text-cyan-400 mb-4 mt-8 border-l-4 border-cyan-500 pl-4">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xl font-bold text-cyan-300 mb-3 mt-6">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-lg font-bold text-emerald-400 mb-2 mt-4">{children}</h4>,
                  p: ({ children, ...props }) => {
                    // Convert children to string for pattern matching
                    const getText = (children: any): string => {
                      if (typeof children === 'string') return children
                      if (Array.isArray(children)) {
                        return children.map(c => {
                          if (typeof c === 'string') return c
                          if (typeof c === 'object' && c?.props?.children) return getText(c.props.children)
                          return ''
                        }).join('')
                      }
                      if (typeof children === 'object' && children?.props?.children) {
                        return getText(children.props.children)
                      }
                      return String(children || '')
                    }
                    
                    const text = getText(children)
                    
                    // Check for multi-line label patterns (Label:\nContent)
                    const lines = text.split('\n').map(l => l.trim())
                    if (lines.length >= 2) {
                      const firstLine = lines[0]
                      // Check if first line is a label (ends with colon, reasonable length, starts with capital)
                      if (firstLine.endsWith(':') && 
                          firstLine.length > 3 && 
                          firstLine.length < 60 &&
                          /^[A-Z]/.test(firstLine)) {
                        const content = lines.slice(1).join('\n').trim()
                        if (content && content.length > 0) {
                          return (
                            <div className="mb-5">
                              <div className="font-bold text-cyan-400 text-base mb-2 tracking-wide">
                                {firstLine}
                              </div>
                              <div className="text-slate-300 leading-7 text-base pl-4 border-l-2 border-cyan-500/30 whitespace-pre-line">
                                {content}
                              </div>
                            </div>
                          )
                        }
                      }
                    }
                    
                    // Check for single-line label pattern (Label: Content)
                    const singleLinePattern = /^([A-Z][A-Za-z\s]+):\s*(.+)$/
                    const match = text.match(singleLinePattern)
                    if (match && match[2].trim().length > 0 && match[2].trim().length < 200) {
                      const [, label, content] = match
                      return (
                        <div className="mb-5">
                          <div className="font-bold text-cyan-400 text-base mb-2 tracking-wide">
                            {label}:
                          </div>
                          <div className="text-slate-300 leading-7 text-base pl-4 border-l-2 border-cyan-500/30">
                            {content.trim()}
                          </div>
                        </div>
                      )
                    }
                    
                    return <p className="text-slate-300 mb-4 leading-7 text-base">{children}</p>
                  },
                  ul: ({ children }) => <ul className="text-slate-300 mb-4 ml-6 space-y-2 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="text-slate-300 mb-4 ml-6 space-y-2 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="mb-1 leading-6">{children}</li>,
                  strong: ({ children }) => <strong className="text-white font-bold">{children}</strong>,
                  em: ({ children }) => <em className="text-cyan-300 italic">{children}</em>,
                  code: ({ children }) => <code className="bg-slate-800/50 text-cyan-300 px-2 py-1 rounded text-sm font-mono border border-slate-700/50">{children}</code>,
                  pre: ({ children }) => <pre className="bg-slate-800/50 text-slate-300 p-4 rounded-lg mb-4 overflow-x-auto border border-slate-700/50">{children}</pre>,
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-cyan-500 pl-4 text-slate-400 italic mb-4 bg-slate-800/30 py-2 rounded-r">{children}</blockquote>,
                  table: ({ children }) => <div className="overflow-x-auto mb-4"><table className="min-w-full border-collapse border border-slate-700/50">{children}</table></div>,
                  th: ({ children }) => <th className="border border-slate-700/50 px-4 py-2 bg-slate-800/50 text-left text-cyan-400 font-semibold">{children}</th>,
                  td: ({ children }) => <td className="border border-slate-700/50 px-4 py-2 text-slate-300">{children}</td>,
                }}
              >
                {reportContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

