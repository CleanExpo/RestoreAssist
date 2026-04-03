'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import {
  ArrowLeft,
  Download,
  FileDown,
  Filter,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'

interface MissingElement {
  id: string
  category: string
  elementType: string
  elementName: string
  description?: string
  severity: string
}

interface BatchInfo {
  id: string
  folderName: string
  status: string
}

interface Analysis {
  id: string
  fileName: string
  claimNumber?: string
  propertyAddress?: string
  technicianName?: string
  completenessScore?: number
  complianceScore?: number
  standardizationScore?: number
  status: string
  missingIICRCElements: number
  missingOHSElements: number
  missingBillingItems: number
  missingDocumentation: number
  estimatedMissingRevenue?: number
  createdAt: string
  missingElements: MissingElement[]
  batch: BatchInfo
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const CLAIM_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'IICRC', label: 'IICRC' },
  { value: 'OHS', label: 'OHS / WHS' },
  { value: 'BILLING', label: 'Billing' },
  { value: 'DOCUMENTATION', label: 'Documentation' },
]

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  FAILED: 'bg-red-100 text-red-800',
}

function getOverallScore(analysis: Analysis): number | null {
  const scores = [
    analysis.completenessScore,
    analysis.complianceScore,
    analysis.standardizationScore,
  ].filter((s): s is number => s != null)
  if (scores.length === 0) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function getTotalIssues(analysis: Analysis): number {
  return (
    analysis.missingIICRCElements +
    analysis.missingOHSElements +
    analysis.missingBillingItems +
    analysis.missingDocumentation
  )
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400'
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

function exportToCSV(analyses: Analysis[], filename = 'claims-analyses.csv') {
  const headers = [
    'Date',
    'File Name',
    'Claim Number',
    'Property Address',
    'Technician',
    'Completeness Score',
    'Compliance Score',
    'Standardization Score',
    'Overall Score',
    'Total Issues',
    'Missing IICRC',
    'Missing OHS',
    'Missing Billing',
    'Missing Documentation',
    'Est. Missing Revenue',
    'Status',
    'Batch',
  ]

  const rows = analyses.map(a => [
    new Date(a.createdAt).toLocaleDateString('en-AU'),
    a.fileName ?? '',
    a.claimNumber ?? '',
    a.propertyAddress ?? '',
    a.technicianName ?? '',
    a.completenessScore ?? '',
    a.complianceScore ?? '',
    a.standardizationScore ?? '',
    getOverallScore(a) ?? '',
    getTotalIssues(a),
    a.missingIICRCElements,
    a.missingOHSElements,
    a.missingBillingItems,
    a.missingDocumentation,
    a.estimatedMissingRevenue != null
      ? `$${a.estimatedMissingRevenue.toFixed(2)}`
      : '',
    a.status ?? '',
    a.batch?.folderName ?? '',
  ])

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function ClaimsAnalysisExportPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(false)

  // Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [claimTypeFilter, setClaimTypeFilter] = useState('all')
  const [technicianFilter, setTechnicianFilter] = useState('')
  const [minScore, setMinScore] = useState('')

  // Pending filter state (applied on button click)
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: '',
    dateTo: '',
    claimType: 'all',
    technician: '',
    minScore: '',
  })

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const fetchAnalyses = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', '100') // fetch up to 100 for export

      if (appliedFilters.technician) {
        params.set('technicianName', appliedFilters.technician)
      }
      if (appliedFilters.minScore) {
        params.set('minScore', appliedFilters.minScore)
      }

      const res = await fetch(`/api/claims/analyses?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch analyses')
      const data = await res.json()

      let filtered: Analysis[] = data.analyses ?? []

      // Client-side date filtering (API doesn't support date range directly)
      if (appliedFilters.dateFrom) {
        const from = new Date(appliedFilters.dateFrom)
        filtered = filtered.filter(a => new Date(a.createdAt) >= from)
      }
      if (appliedFilters.dateTo) {
        const to = new Date(appliedFilters.dateTo)
        to.setHours(23, 59, 59, 999)
        filtered = filtered.filter(a => new Date(a.createdAt) <= to)
      }

      // Client-side claim type filter (filter by missing element category)
      if (appliedFilters.claimType !== 'all') {
        filtered = filtered.filter(a => {
          if (appliedFilters.claimType === 'IICRC') return a.missingIICRCElements > 0
          if (appliedFilters.claimType === 'OHS') return a.missingOHSElements > 0
          if (appliedFilters.claimType === 'BILLING') return a.missingBillingItems > 0
          if (appliedFilters.claimType === 'DOCUMENTATION') return a.missingDocumentation > 0
          return true
        })
      }

      setAnalyses(filtered)
      setPagination(data.pagination)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load analyses')
    } finally {
      setLoading(false)
    }
  }, [appliedFilters])

  useEffect(() => {
    fetchAnalyses()
  }, [fetchAnalyses])

  const applyFilters = () => {
    setAppliedFilters({
      dateFrom,
      dateTo,
      claimType: claimTypeFilter,
      technician: technicianFilter,
      minScore,
    })
    setSelectedIds(new Set())
  }

  const resetFilters = () => {
    setDateFrom('')
    setDateTo('')
    setClaimTypeFilter('all')
    setTechnicianFilter('')
    setMinScore('')
    setAppliedFilters({
      dateFrom: '',
      dateTo: '',
      claimType: 'all',
      technician: '',
      minScore: '',
    })
    setSelectedIds(new Set())
  }

  const allSelected =
    analyses.length > 0 && analyses.every(a => selectedIds.has(a.id))
  const someSelected = selectedIds.size > 0

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(analyses.map(a => a.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const selectedAnalyses = analyses.filter(a => selectedIds.has(a.id))

  const handleExportSelected = () => {
    if (selectedAnalyses.length === 0) {
      toast.error('No analyses selected')
      return
    }
    exportToCSV(selectedAnalyses, 'claims-analyses-selected.csv')
    toast.success(`Exported ${selectedAnalyses.length} analyses`)
  }

  const handleExportAll = () => {
    if (analyses.length === 0) {
      toast.error('No analyses to export')
      return
    }
    exportToCSV(analyses, 'claims-analyses-all.csv')
    toast.success(`Exported ${analyses.length} analyses`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/claims-analysis"
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Claims Analysis
              </Link>
              <div className="h-4 w-px bg-gray-300" />
              <h1 className="text-lg font-semibold text-gray-900">
                Export Claims Analyses
              </h1>
            </div>

            {/* Export toolbar */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSelected}
                disabled={!someSelected || loading}
                className="gap-2"
              >
                <FileDown className="h-4 w-4" />
                Export Selected ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                onClick={handleExportAll}
                disabled={analyses.length === 0 || loading}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export All ({analyses.length})
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Filters panel */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1">
                <Label htmlFor="date-from" className="text-xs">
                  Date From
                </Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="date-to" className="text-xs">
                  Date To
                </Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="claim-type" className="text-xs">
                  Issue Category
                </Label>
                <Select value={claimTypeFilter} onValueChange={setClaimTypeFilter}>
                  <SelectTrigger id="claim-type" className="h-8 text-sm">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLAIM_TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="technician" className="text-xs">
                  Technician
                </Label>
                <Input
                  id="technician"
                  type="text"
                  placeholder="Filter by name"
                  value={technicianFilter}
                  onChange={e => setTechnicianFilter(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="min-score" className="text-xs">
                  Min Score
                </Label>
                <Input
                  id="min-score"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="0–100"
                  value={minScore}
                  onChange={e => setMinScore(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <Button size="sm" onClick={applyFilters} disabled={loading} className="gap-2">
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Filter className="h-3 w-3" />
                )}
                Apply Filters
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                disabled={loading}
                className="gap-2 text-gray-500"
              >
                <RefreshCw className="h-3 w-3" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {loading ? (
                  <span className="text-gray-400">Loading...</span>
                ) : (
                  <span>
                    Showing{' '}
                    <span className="font-bold text-gray-900">{analyses.length}</span>{' '}
                    {pagination && pagination.total !== analyses.length ? (
                      <span className="text-gray-500 text-sm">
                        (filtered from {pagination.total} total)
                      </span>
                    ) : null}{' '}
                    {analyses.length === 1 ? 'analysis' : 'analyses'}
                  </span>
                )}
              </CardTitle>
              {someSelected && (
                <Badge variant="secondary" className="text-xs">
                  {selectedIds.size} selected
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            ) : analyses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <FileDown className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">No analyses match your filters</p>
                <p className="text-xs mt-1">
                  Try adjusting your filters or{' '}
                  <button
                    onClick={resetFilters}
                    className="underline hover:text-gray-600"
                  >
                    reset to show all
                  </button>
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-10 pl-4">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={checked => toggleAll(Boolean(checked))}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead className="text-xs font-semibold">Date</TableHead>
                      <TableHead className="text-xs font-semibold">File / Claim</TableHead>
                      <TableHead className="text-xs font-semibold">Property</TableHead>
                      <TableHead className="text-xs font-semibold">Technician</TableHead>
                      <TableHead className="text-xs font-semibold text-center">
                        Score
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-center">
                        Issues Found
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-center">
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analyses.map(analysis => {
                      const score = getOverallScore(analysis)
                      const issues = getTotalIssues(analysis)
                      const isSelected = selectedIds.has(analysis.id)

                      return (
                        <TableRow
                          key={analysis.id}
                          className={isSelected ? 'bg-blue-50 hover:bg-blue-50' : 'hover:bg-gray-50'}
                        >
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={checked =>
                                toggleRow(analysis.id, Boolean(checked))
                              }
                              aria-label={`Select ${analysis.fileName}`}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-gray-600 whitespace-nowrap">
                            {new Date(analysis.createdAt).toLocaleDateString('en-AU')}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {analysis.fileName}
                            </p>
                            {analysis.claimNumber && (
                              <p className="text-xs text-gray-500">
                                #{analysis.claimNumber}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[180px]">
                            <span className="text-sm text-gray-700 truncate block">
                              {analysis.propertyAddress ?? (
                                <span className="text-gray-400 italic">—</span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-gray-700">
                            {analysis.technicianName ?? (
                              <span className="text-gray-400 italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {score !== null ? (
                              <span className={`text-sm font-semibold ${scoreColor(score)}`}>
                                {score}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {issues > 0 ? (
                              <Badge
                                variant="outline"
                                className="text-xs border-orange-200 text-orange-700 bg-orange-50"
                              >
                                {issues}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs border-green-200 text-green-700 bg-green-50"
                              >
                                0
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                STATUS_COLOR[analysis.status] ?? 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {analysis.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
