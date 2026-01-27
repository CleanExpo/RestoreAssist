"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Filter, Download, Eye, Edit, MoreVertical, ChevronLeft, ChevronRight, Copy, Trash2, CheckSquare, Square, X, FileSpreadsheet, Sparkles, Zap, FileCheck, RefreshCw, Plus, MessageSquare } from "lucide-react"
import toast from "react-hot-toast"
import { BulkOperationModal } from "@/components/BulkOperationModal"
import { cn } from "@/lib/utils"

export default function ReportsPage() {
  const router = useRouter()
  const [filterOpen, setFilterOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<any[]>([])
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [selectedReports, setSelectedReports] = useState<string[]>([])
  const [bulkActionType, setBulkActionType] = useState<'export-excel' | 'export-zip' | 'duplicate' | 'status-update' | 'delete' | null>(null)
  const [filters, setFilters] = useState({
    status: "all",
    hazard: "all",
    insurance: "all",
    dateFrom: "",
    dateTo: "",
  })

  const itemsPerPage = 10

  // Duplicate report function
  const duplicateReport = async (reportId: string) => {
    try {
      setDuplicating(reportId)
      const response = await fetch(`/api/reports/${reportId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        const newReport = await response.json()
        toast.success("Report duplicated successfully!", {
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#10b981',
            border: '1px solid #059669'
          }
        })
        // Refresh the reports list
        const fetchReports = async () => {
          try {
            const response = await fetch('/api/reports')
            if (response.ok) {
              const data = await response.json()
              setReports(data.reports || [])
            }
          } catch (error) {
            console.error('Error fetching reports:', error)
          }
        }
        fetchReports()
      } else {
        const errorData = await response.json()
        
        // Handle credit-related errors
        if (response.status === 402 && errorData.upgradeRequired) {
          toast.error(
            `Insufficient credits! You have ${errorData.creditsRemaining} credits remaining. Please upgrade your plan to create more reports.`,
            {
              duration: 6000,
              style: {
                background: '#1e293b',
                color: '#f87171',
                border: '1px solid #dc2626'
              }
            }
          )
          // Redirect to pricing page
          setTimeout(() => {
            router.push("/dashboard/pricing")
          }, 2000)
          return
        }
        
        // Handle other errors
        toast.error(errorData.error || "Failed to duplicate report. Please try again.")
      }
    } catch (error) {
      console.error('Error duplicating report:', error)
      toast.error("Failed to duplicate report. Please try again.")
    } finally {
      setDuplicating(null)
    }
  }

  // Download report function
  const downloadReport = async (reportId: string) => {
    try {
      setDownloading(reportId)
      const response = await fetch(`/api/reports/${reportId}/download`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `water-damage-report-${reportId}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        console.error('Failed to download report')
      }
    } catch (error) {
      console.error('Error downloading report:', error)
    } finally {
      setDownloading(null)
    }
  }


  const toggleReportSelection = (reportId: string) => {
    setSelectedReports(prev => 
      prev.includes(reportId) 
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    )
  }

  const selectAllReports = () => {
    setSelectedReports(paginatedReports.map(r => r.id))
  }

  const clearSelection = () => {
    setSelectedReports([])
  }

  // Refresh reports function
  const refreshReports = async () => {
    try {
      const response = await fetch('/api/reports')
      if (response.ok) {
        const data = await response.json()
        setReports(data.reports || [])
        setSelectedReports([])
      }
    } catch (error) {
      console.error('Error fetching reports:', error)
    }
  }

  // Fetch reports from API
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/reports')
        if (response.ok) {
          const data = await response.json()
          setReports(data.reports || [])
        } else {
          console.error('Failed to fetch reports')
        }
      } catch (error) {
        console.error('Error fetching reports:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchReports()
  }, [])

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const matchesSearch =
        report.reportNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.propertyAddress?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesStatus = filters.status === "all" || report.status === filters.status
      const matchesHazard = filters.hazard === "all" || report.waterCategory === filters.hazard
      const matchesInsurance = filters.insurance === "all" || report.policyType === filters.insurance

      return matchesSearch && matchesStatus && matchesHazard && matchesInsurance
    })
  }, [reports, searchTerm, filters])

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage)
  const paginatedReports = filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const statusColors = {
    COMPLETED: "bg-emerald-500/20 text-emerald-400",
    APPROVED: "bg-emerald-500/20 text-emerald-400",
    PENDING: "bg-amber-500/20 text-amber-400",
    "In Progress": "bg-blue-500/20 text-blue-400",
    DRAFT: "bg-slate-500/20 text-slate-400",
    ARCHIVED: "bg-gray-500/20 text-gray-400",
  }

  const hazardIcons = {
    "Category 1": "💧",
    "Category 2": "🔥",
    "Category 3": "☣️",
    "Fire": "🔥",
    "Storm": "⛈️",
    "Mould": "🍄",
    "Flood": "🌊",
    "Biohazard": "☣️",
    "Impact": "💥",
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    return date.toLocaleDateString('en-AU', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    })
  }

  const formatDateTime = (dateString: string) => {
    if (!dateString) return "N/A"
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-AU', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } else if (diffInHours < 168) { // Less than a week
      return date.toLocaleDateString('en-AU', { 
        weekday: 'short',
        day: '2-digit', 
        month: '2-digit' 
      })
    } else {
      return date.toLocaleDateString('en-AU', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      })
    }
  }

  const truncateText = (text: string, maxLength: number = 40) => {
    if (!text || text === "To be completed") return "To be completed"
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
  }

  const getClientName = (report: any) => {
    // Check if clientName is actually a conversation snippet (contains common conversation words)
    const name = report.clientName || ""
    if (!name || name.trim() === "") return "To be completed"
    
    // Filter out conversation snippets
    const lowerName = name.toLowerCase()
    if (name.length > 100 || 
        lowerName.includes("i have been") || 
        lowerName.includes("it has come") ||
        lowerName.includes("sometime in this") ||
        lowerName.includes("burst pipe") ||
        lowerName.includes("kitchen sink") ||
        lowerName.includes("water") && name.length > 50) {
      return "To be completed"
    }
    return name.trim()
  }

  const getPropertyAddress = (report: any) => {
    // Check if propertyAddress is actually a conversation snippet
    const address = report.propertyAddress || ""
    if (!address || address.trim() === "") return "To be completed"
    
    // Filter out conversation snippets
    const lowerAddress = address.toLowerCase()
    if (address.length > 100 || 
        lowerAddress.includes("it has come") || 
        lowerAddress.includes("burst pipe") ||
        lowerAddress.includes("kitchen sink") ||
        lowerAddress.includes("i have been") ||
        lowerAddress.includes("sometime")) {
      return "To be completed"
    }
    return address.trim()
  }

  const formatCost = (cost: number | string) => {
    if (!cost) return "N/A"
    return typeof cost === 'number' ? `$${cost.toLocaleString()}` : cost
  }

  return (
    <div >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className={cn("text-3xl font-semibold mb-2", "text-neutral-900 dark:text-white")}>Reports</h1>
          <p className={cn("text-neutral-600 dark:text-slate-400")}>Manage and view all restoration reports</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {selectedReports.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <CheckSquare className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-blue-300">{selectedReports.length} selected</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setBulkActionType('export-excel')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-green-500/30 text-sm font-medium group"
                >
                  <FileSpreadsheet size={16} className="transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3" />
                  <span>Export Excel</span>
                </button>
                {/* <button
                  onClick={async () => {
                    if (selectedReports.length > 25) {
                      toast.error('Maximum 25 reports for ZIP export')
                      return
                    }
                    try {
                      const response = await fetch('/api/reports/bulk-export-zip', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: selectedReports, pdfType: 'enhanced' }),
                      })
                      if (!response.ok) throw new Error('Export failed')
                      const blob = await response.blob()
                      const url = window.URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `RestoreAssist_PDFs_${new Date().toISOString().slice(0, 10)}.zip`
                      document.body.appendChild(a)
                      a.click()
                      window.URL.revokeObjectURL(url)
                      document.body.removeChild(a)
                      toast.success(`Exported ${selectedReports.length} PDF(s) to ZIP`)
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Export failed')
                    }
                  }}
                  disabled={selectedReports.length > 25}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg transition-colors text-sm font-medium"
                >
                  <Download size={16} />
                  Export PDFs
                </button> */}
                <button
                  onClick={() => {
                    if (selectedReports.length > 50) {
                      toast.error('Maximum 50 reports for duplication')
                      return
                    }
                    setBulkActionType('duplicate')
                  }}
                  disabled={selectedReports.length > 50}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 disabled:bg-amber-600/50 text-white rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-amber-500/30 disabled:hover:scale-100 disabled:hover:shadow-none text-sm font-medium group"
                >
                  <Copy size={16} className="transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Duplicate</span>
                </button>
                <button
                  onClick={() => setBulkActionType('status-update')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-purple-500/30 text-sm font-medium group"
                >
                  <FileCheck size={16} className="transition-transform duration-200 group-hover:scale-110 group-hover:rotate-6" />
                  <span>Update Status</span>
                </button>
                <button
                  onClick={() => setBulkActionType('delete')}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-lg hover:shadow-red-500/30 text-sm font-medium group"
                >
                  <Trash2 size={16} className="transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Delete</span>
                </button>
                <button
                  onClick={clearSelection}
                  className={cn(
                    "px-3 py-1.5 border rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md text-sm",
                    "border-neutral-300 dark:border-slate-600",
                    "hover:bg-neutral-100 dark:hover:bg-slate-800",
                    "text-neutral-700 dark:text-slate-300"
                  )}
                >
                  Clear
                </button>
              </div>
            </>
          )}
          <button
            onClick={async () => {
              // Check credits before navigating
              try {
                const response = await fetch('/api/reports/check-credits')
                if (response.ok) {
                  const data = await response.json()
                  if (!data.canCreate) {
                    // Show upgrade modal or redirect to pricing
                    toast.error('Please upgrade your package to create more reports')
                    router.push('/dashboard/pricing')
                    return
                  }
                }
                // If credits available, navigate to new report page
                router.push('/dashboard/reports/new')
              } catch (error) {
                console.error('Error checking credits:', error)
                // On error, still allow navigation (will be checked on the page)
                router.push('/dashboard/reports/new')
              }
            }}
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 text-white flex items-center gap-2 group"
          >
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
            <span>New Report</span>
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex gap-4 items-center mb-4">
        <div className="flex-1 relative">
          <Search className={cn("absolute left-3 top-1/2 transform -translate-y-1/2", "text-neutral-500 dark:text-slate-400")} size={18} />
          <input
            type="text"
            placeholder="Search by ID, client, address..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className={cn(
              "w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
              "bg-neutral-100 dark:bg-slate-800",
              "border-neutral-300 dark:border-slate-700",
              "text-neutral-900 dark:text-white",
              "placeholder-neutral-500 dark:placeholder-slate-500"
            )}
          />
        </div>
        <button
          onClick={() => setFilterOpen(!filterOpen)}
          className={cn(
            "p-2 border rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-md group",
            "border-neutral-300 dark:border-slate-700",
            "hover:bg-neutral-100 dark:hover:bg-slate-800"
          )}
          title={filterOpen ? "Hide filters" : "Show filters"}
        >
          <Filter size={20} className="transition-transform duration-200 group-hover:rotate-90" />
        </button>
        <button 
          onClick={() => {
            // Download all reports as a batch (you can implement this later)
          }}
          className={cn(
            "p-2 border rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-md group",
            "border-neutral-300 dark:border-slate-700",
            "hover:bg-neutral-100 dark:hover:bg-slate-800"
          )}
          title="Download All Reports"
        >
          <Download size={20} className="transition-transform duration-200 group-hover:scale-110 group-hover:-translate-y-0.5" />
        </button>
      </div>

      {/* Filter Panel */}
      {filterOpen && (
        <div className={cn("p-4 rounded-lg border space-y-4 animate-fade-in", "border-neutral-200 dark:border-slate-700/50", "bg-neutral-50 dark:bg-slate-800/30")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Status</label>
              <select
                value={filters.status}
                onChange={(e) => {
                  setFilters({ ...filters, status: e.target.value })
                  setCurrentPage(1)
                }}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-cyan-500",
                  "bg-white dark:bg-slate-700/50",
                  "border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white"
                )}
              >
                <option value="all">All Status</option>
                <option value="COMPLETED">Completed</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Water Category</label>
              <select
                value={filters.hazard}
                onChange={(e) => {
                  setFilters({ ...filters, hazard: e.target.value })
                  setCurrentPage(1)
                }}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-cyan-500",
                  "bg-white dark:bg-slate-700/50",
                  "border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white"
                )}
              >
                <option value="all">All Categories</option>
                <option value="Category 1">Category 1</option>
                <option value="Category 2">Category 2</option>
                <option value="Category 3">Category 3</option>
              </select>
            </div>
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Insurance Type</label>
              <select
                value={filters.insurance}
                onChange={(e) => {
                  setFilters({ ...filters, insurance: e.target.value })
                  setCurrentPage(1)
                }}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-cyan-500",
                  "bg-white dark:bg-slate-700/50",
                  "border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white"
                )}
              >
                <option value="all">All Types</option>
                <option value="Building & Contents">Building & Contents</option>
                <option value="Standalone Building">Standalone Building</option>
                <option value="Standalone Contents">Standalone Contents</option>
                <option value="Landlord Insurance">Landlord Insurance</option>
                <option value="Portable Valuables">Portable Valuables</option>
              </select>
            </div>
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>From Date</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-cyan-500",
                  "bg-white dark:bg-slate-700/50",
                  "border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white"
                )}
              />
            </div>
            <div>
              <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>To Date</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className={cn(
                  "w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-cyan-500",
                  "bg-white dark:bg-slate-700/50",
                  "border-neutral-300 dark:border-slate-600",
                  "text-neutral-900 dark:text-white"
                )}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium text-sm hover:from-blue-600 hover:to-cyan-600 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/30">
              Apply Filters
            </button>
            <button
              onClick={() => {
                setFilters({ status: "all", hazard: "all", insurance: "all", dateFrom: "", dateTo: "" })
                setCurrentPage(1)
              }}
              className={cn(
                "px-4 py-2 border rounded-lg text-sm hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 hover:shadow-md",
                "border-neutral-300 dark:border-slate-600",
                "hover:bg-neutral-100 dark:hover:bg-slate-800",
                "text-neutral-700 dark:text-slate-300"
              )}
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Reports Table */}
      <div className={cn("rounded-lg border overflow-hidden mb-4", "border-neutral-200 dark:border-slate-700/50", "bg-white dark:bg-slate-800/30")}>
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto mb-4"></div>
            <p className={cn("text-neutral-600 dark:text-slate-400")}>Loading reports...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={cn("border-b", "border-neutral-200 dark:border-slate-700", "bg-neutral-50 dark:bg-slate-900/50")}>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>
                    <button
                      onClick={selectedReports.length === paginatedReports.length ? clearSelection : selectAllReports}
                      className={cn("flex items-center gap-2 transition-all duration-200 hover:scale-105 active:scale-95 group", "text-neutral-700 dark:text-white", "hover:text-neutral-900 dark:hover:text-white")}
                      title={selectedReports.length === paginatedReports.length ? "Deselect all" : "Select all"}
                    >
                      {selectedReports.length === paginatedReports.length ? (
                        <CheckSquare size={16} className="transition-transform duration-200 group-hover:scale-110" />
                      ) : (
                        <Square size={16} className="transition-transform duration-200 group-hover:scale-110" />
                      )}
                      <span>Select All</span>
                    </button>
                  </th>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Report ID</th>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Client Name</th>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Property Address</th>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Postcode</th>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Category</th>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Status</th>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Updated</th>
                  <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.length === 0 ? (
                  <tr>
                    <td colSpan={10} className={cn("py-8 text-center", "text-neutral-600 dark:text-slate-400")}>
                      No reports found. <Link href="/dashboard/reports/new" className="text-cyan-400 hover:underline">Create your first report</Link>
                    </td>
                  </tr>
                ) : (
                  paginatedReports.map((report, i) => (
                    <tr key={report.id || i} className={cn("border-b transition-colors", "border-neutral-200 dark:border-slate-700/50", "hover:bg-neutral-50 dark:hover:bg-slate-700/30")}>
                      <td className="py-4 px-6">
                        <button
                          onClick={() => toggleReportSelection(report.id)}
                          className={cn("flex items-center gap-2 transition-all duration-200 hover:scale-110 active:scale-95 group", "text-neutral-700 dark:text-white", "hover:text-neutral-900 dark:hover:text-white")}
                          title={selectedReports.includes(report.id) ? "Deselect" : "Select"}
                        >
                          {selectedReports.includes(report.id) ? (
                            <CheckSquare size={16} className="text-cyan-400 transition-transform duration-200 group-hover:scale-110" />
                          ) : (
                            <Square size={16} className="transition-transform duration-200 group-hover:scale-110" />
                          )}
                        </button>
                      </td>
                      <td className="py-4 px-6">
                        <Link href={`/dashboard/reports/${report.id}`} className="font-medium text-cyan-400 hover:text-cyan-300 hover:underline">
                          {report.reportNumber || report.title || report.id.slice(0, 8) + "..."}
                        </Link>
                      </td>
                      <td className="py-4 px-6">
                        <span className={cn("font-medium", "text-neutral-900 dark:text-white")} title={getClientName(report)}>
                          {truncateText(getClientName(report), 30)}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={cn("text-sm", "text-neutral-600 dark:text-slate-300")} title={getPropertyAddress(report)}>
                          {truncateText(getPropertyAddress(report), 30)}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <span className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>
                          {report.propertyPostcode || "—"}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                            <span className="text-lg">{hazardIcons[report.hazardType as keyof typeof hazardIcons] || "💧"}</span>
                            <span className={cn("text-xs", "text-neutral-600 dark:text-slate-300")}>
                              {report.hazardType || "Water"}
                            </span>
                          </span>
                          {report.waterCategory && (
                            <span className={cn("text-xs ml-6", "text-neutral-500 dark:text-slate-500")}>
                              {report.waterCategory}
                        </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1">
                        <span
                            className={`px-3 py-1 rounded-full text-xs font-medium w-fit ${statusColors[report.status as keyof typeof statusColors] || cn("bg-neutral-200 dark:bg-slate-500/20", "text-neutral-600 dark:text-slate-400")}`}
                        >
                          {report.status || "DRAFT"}
                        </span>
                          {report.reportDepthLevel && (
                            <span className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>
                              {report.reportDepthLevel}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col gap-1">
                          <span className={cn("text-xs", "text-neutral-600 dark:text-slate-300")}>
                        {formatDateTime(report.updatedAt || report.createdAt)}
                          </span>
                          {report.incidentDate && (
                            <span className={cn("text-xs", "text-neutral-500 dark:text-slate-500")}>
                              Incident: {formatDate(report.incidentDate)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/reports/${report.id}`}
                            className={cn(
                              "p-1.5 rounded transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-md group",
                              "hover:bg-neutral-100 dark:hover:bg-slate-700",
                              "text-neutral-600 dark:text-slate-300",
                              "hover:text-cyan-600 dark:hover:text-cyan-400"
                            )}
                            title="View Report"
                          >
                            <Eye size={16} className="transition-transform duration-200 group-hover:scale-110" />
                          </Link>
                          {/* <Link
                            href={`/dashboard/reports/${report.id}/edit`}
                            className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-blue-400"
                            title="Edit Report"
                          >
                            <Edit size={16} />
                          </Link> */}
                          <button
                            onClick={() => {
                              const jobType = report.hazardType === 'Fire' ? 'FIRE_DAMAGE'
                                : report.hazardType === 'Storm' ? 'STORM_DAMAGE'
                                : report.hazardType === 'Mould' ? 'MOULD_REMEDIATION'
                                : 'WATER_DAMAGE'
                              const params = new URLSearchParams({ reportId: report.id })
                              if (jobType) params.set('jobType', jobType)
                              if (report.propertyPostcode) params.set('postcode', report.propertyPostcode)
                              router.push(`/dashboard/interviews/new?${params.toString()}`)
                            }}
                            className={cn(
                              "p-1.5 rounded transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-md group",
                              "hover:bg-neutral-100 dark:hover:bg-slate-700",
                              "text-neutral-600 dark:text-slate-300",
                              "hover:text-blue-600 dark:hover:text-blue-400"
                            )}
                            title="Start Interview"
                          >
                            <MessageSquare size={16} className="transition-transform duration-200 group-hover:scale-110" />
                          </button>
                          <button
                            onClick={() => duplicateReport(report.id)}
                            disabled={duplicating === report.id}
                            className={cn(
                              "p-1.5 rounded transition-all duration-200 hover:scale-110 active:scale-95 hover:shadow-md disabled:opacity-50 disabled:hover:scale-100 group",
                              "hover:bg-neutral-100 dark:hover:bg-slate-700",
                              "text-neutral-600 dark:text-slate-300",
                              "hover:text-green-600 dark:hover:text-green-400"
                            )}
                            title="Duplicate Report"
                          >
                            {duplicating === report.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500"></div>
                            ) : (
                              <Copy size={16} className="transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                            )}
                          </button>
                          {/* <button 
                            onClick={() => downloadReport(report.id)}
                            disabled={downloading === report.id}
                            className="p-1 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                            title="Download PDF"
                          >
                            {downloading === report.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500"></div>
                            ) : (
                              <Download size={16} />
                            )}
                          </button>
                          <button className="p-1 hover:bg-slate-700 rounded transition-colors" title="More">
                            <MoreVertical size={16} />
                          </button> */}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-slate-400 text-sm">
          Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredReports.length)}{" "}
          of {filteredReports.length} reports
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-3 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-1 group"
            title="Previous page"
          >
            <ChevronLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            <span>Previous</span>
          </button>
          {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
            const pageNum = i + 1
            return (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                className={`px-4 py-2 rounded-lg transition-all duration-200 text-sm hover:scale-110 active:scale-95 ${
                  pageNum === currentPage
                    ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md hover:shadow-lg hover:shadow-blue-500/30"
                    : "border border-slate-700 hover:bg-slate-800 hover:shadow-md"
                }`}
                title={`Go to page ${pageNum}`}
              >
                {pageNum}
              </button>
            )
          })}
          {totalPages > 5 && <span className="px-3 py-2">...</span>}
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-2 border border-slate-700 rounded-lg hover:bg-slate-800 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-1 group"
            title="Next page"
          >
            <span>Next</span>
            <ChevronRight size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Simple Confirmation Modal */}
      {bulkActionType && (
        <BulkOperationModal
          operationType={bulkActionType}
          selectedCount={selectedReports.length}
          selectedIds={selectedReports}
          onClose={() => setBulkActionType(null)}
          onRefresh={refreshReports}
        />
      )}
    </div>
  )
}
