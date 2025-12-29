'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  AlertTriangle, 
  DollarSign,
  Download,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  Search
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import toast from 'react-hot-toast'

interface GapAnalysisResult {
  fileName: string
  fileId: string
  issues: Array<{
    category: string
    elementName: string
    description: string
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    standardReference?: string
    isBillable?: boolean
    estimatedCost?: number
    estimatedHours?: number
    suggestedLineItem?: string
  }>
  missingElements: {
    iicrc: number
    australianStandards?: number
    ohs: number
    whs?: number
    scopeOfWorks?: number
    billing: number
    documentation: number
    equipment?: number
    monitoring?: number
  }
  scores: {
    completeness: number
    compliance: number
    standardization: number
    scopeAccuracy?: number
    billingAccuracy?: number
  }
  estimatedMissingRevenue?: number
  standardsReferenced?: string[]
  complianceGaps?: string[]
  reportStructure?: {
    sections: string[]
    missingSections: string[]
    sectionOrder: string[]
    flowIssues: string[]
  }
  technicianPattern?: {
    reportingStyle: string
    commonOmissions: string[]
    strengths: string[]
    standardizationLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  }
}

interface AnalysisSummary {
  totalFiles: number
  totalIssues: number
  totalMissingElements: {
    iicrc: number
    ohs: number
    billing: number
    documentation: number
  }
  averageScores: {
    completeness: number
    compliance: number
    standardization: number
  }
  totalEstimatedMissingRevenue: number
  topIssues: Array<{
    category: string
    elementName: string
    description: string
    severity: string
    count: number
    totalCost: number
    isBillable?: boolean
  }>
}

interface DriveFile {
  id: string
  name: string
  size?: string
  mimeType: string
}

export default function ClaimsAnalysisPage() {
  const { data: session } = useSession()
  const [folderId, setFolderId] = useState('')
  const [folderName, setFolderName] = useState('')
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [permissionError, setPermissionError] = useState<{message: string, serviceAccountEmail?: string, instructions?: string[]} | null>(null)
  const [maxDocuments, setMaxDocuments] = useState<string>('')
  const [analysisResults, setAnalysisResults] = useState<GapAnalysisResult[]>([])
  const [summary, setSummary] = useState<AnalysisSummary | null>(null)
  const [processing, setProcessing] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<GapAnalysisResult | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list')

  const fetchFiles = async () => {
    if (!folderId.trim()) {
      toast.error('Please enter a Google Drive folder ID first')
      return
    }

    setLoadingFiles(true)
    setFiles([])
    setPermissionError(null)
    try {
      const response = await fetch('/api/claims/list-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId: folderId.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        if (data.files && data.files.length > 0) {
          setFiles(data.files)
          toast.success(`Found ${data.files.length} PDF file(s) ready for analysis`)
        } else {
          toast.error('No PDF files found in this folder')
          setFiles([])
        }
      } else {
        // Show detailed error message
        const errorMsg = data.error || 'Failed to fetch files'
        const details = data.details || ''
        const serviceAccountEmail = data.serviceAccountEmail
        
        if (response.status === 403 && serviceAccountEmail) {
          // Permission error - show detailed instructions in alert
          setPermissionError({
            message: errorMsg,
            serviceAccountEmail,
            instructions: data.instructions
          })
          toast.error('Permission denied. See instructions below.', { duration: 5000 })
        } else {
          toast.error(details ? `${errorMsg}: ${details}` : errorMsg, { duration: 5000 })
        }
        setFiles([])
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to fetch files')
      setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }

  const startAnalysis = async () => {
    if (!folderId.trim()) {
      toast.error('Please enter a Google Drive folder ID')
      return
    }

    if (files.length === 0) {
      toast.error('Please load files first')
      return
    }

    const maxDocs = maxDocuments ? parseInt(maxDocuments) : files.length
    if (maxDocs <= 0 || maxDocs > files.length) {
      toast.error(`Please enter a valid number between 1 and ${files.length}`)
      return
    }

    setProcessing(true)
    setAnalysisResults([])
    setSummary(null)
    
    try {
      const response = await fetch('/api/claims/analyze-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId: folderId.trim(),
          maxDocuments: maxDocs,
        }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setAnalysisResults(data.results || [])
        setSummary(data.summary || null)
        toast.success(`Analysis completed! Processed ${data.results?.length || 0} file(s)`)
      } else {
        toast.error(data.error || 'Failed to perform analysis')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to perform analysis')
    } finally {
      setProcessing(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500'
      case 'PROCESSING':
        return 'bg-blue-500'
      case 'FAILED':
        return 'bg-red-500'
      case 'PARTIAL':
        return 'bg-yellow-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-500'
      case 'HIGH':
        return 'bg-orange-500'
      case 'MEDIUM':
        return 'bg-yellow-500'
      case 'LOW':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Claim Manager Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive analysis and insights for restoration claim management
          </p>
        </div>
        {summary && (
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Total Files</div>
            <div className="text-2xl font-bold">{summary.totalFiles}</div>
          </div>
        )}
      </div>

      {/* Start New Analysis - Only show when no results */}
      {analysisResults.length === 0 && !summary && (
      <Card>
        <CardHeader>
            <CardTitle>New Analysis</CardTitle>
          <CardDescription>
              Upload and analyze claim reports from Google Drive
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="folderId">Google Drive Folder ID *</Label>
              <Input
                id="folderId"
                placeholder="11xJ4jowWd2Y9xVjWgJKZjpQOTbbPKzS1"
                value={folderId}
                onChange={(e) => {
                  setFolderId(e.target.value)
                  setFiles([]) // Clear files when folder ID changes
                }}
                disabled={processing || loadingFiles}
              />
              <p className="text-xs text-muted-foreground">
                Extract from Google Drive folder URL: drive.google.com/drive/folders/[FOLDER_ID]
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="folderName">Folder Name (Optional)</Label>
              <Input
                id="folderName"
                placeholder="Completed Claims Q4 2024"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                disabled={processing || loadingFiles}
              />
            </div>
          </div>
          
          {/* Max Documents Input */}
          {files.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="maxDocuments">Number of Documents to Process</Label>
              <Input
                id="maxDocuments"
                type="number"
                min="1"
                max={files.length}
                placeholder={`Max: ${files.length} (all files)`}
                value={maxDocuments}
                onChange={(e) => {
                  const val = e.target.value
                  if (val === '' || (parseInt(val) > 0 && parseInt(val) <= files.length)) {
                    setMaxDocuments(val)
                  }
                }}
                disabled={processing}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to process all {files.length} files, or enter a number (1-{files.length}) to limit processing
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button 
              onClick={fetchFiles} 
              disabled={loadingFiles || processing || !folderId.trim()}
              variant="outline"
              className="flex-1"
            >
              {loadingFiles ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Load Files
                </>
              )}
            </Button>
            <Button 
              onClick={startAnalysis} 
              disabled={processing || loadingFiles || !folderId.trim() || files.length === 0}
              className="flex-1"
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Analysis ({maxDocuments ? `${maxDocuments}/${files.length}` : files.length} files)
                </>
              )}
            </Button>
          </div>

          {/* Permission Error Alert */}
          {permissionError && (
            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="space-y-2">
                <div className="font-semibold text-yellow-800 dark:text-yellow-200">
                  {permissionError.message}
                </div>
                {permissionError.serviceAccountEmail && (
                  <div className="text-sm text-yellow-700 dark:text-yellow-300">
                    <p className="font-medium mb-2">To fix this, share the Google Drive folder with the service account:</p>
                    <div className="bg-yellow-100 dark:bg-yellow-900/40 p-3 rounded border border-yellow-300 dark:border-yellow-700">
                      <p className="font-mono text-xs break-all mb-3">
                        {permissionError.serviceAccountEmail}
                      </p>
                      {permissionError.instructions && (
                        <ol className="list-decimal list-inside space-y-1 text-xs">
                          {permissionError.instructions.map((instruction, idx) => (
                            <li key={idx}>{instruction}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Files List */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Files to Analyze ({files.length})
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchFiles}
                  disabled={loadingFiles}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingFiles ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <div className="border rounded-lg max-h-96 overflow-y-auto">
                <div className="divide-y">
                  {files.map((file, index) => (
                    <div
                      key={file.id}
                      className="p-3 hover:bg-muted/50 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          {file.size && (
                            <p className="text-xs text-muted-foreground">
                              {(parseInt(file.size) / 1024 / 1024).toFixed(2)} MB
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="ml-2 flex-shrink-0">
                        #{index + 1}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {loadingFiles && files.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span>Loading files from Google Drive...</span>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Analysis Results */}
      {analysisResults.length > 0 && summary && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analyses">Individual Analyses</TabsTrigger>
            <TabsTrigger value="issues">Top Issues</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Key Performance Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Avg Completeness</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {summary.averageScores.completeness.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Avg Compliance</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {summary.averageScores.compliance.toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalIssues}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Revenue Recovery</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    ${summary.totalEstimatedMissingRevenue.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing IICRC</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalMissingElements.iicrc || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing AU Standards</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(summary.totalMissingElements as any).australianStandards || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing OH&S/WHS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(summary.totalMissingElements.ohs || 0) + ((summary.totalMissingElements as any).whs || 0)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing Scope</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(summary.totalMissingElements as any).scopeOfWorks || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing Billing</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalMissingElements.billing || 0}</div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing Docs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{summary.totalMissingElements.documentation || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing Equipment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(summary.totalMissingElements as any).equipment || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Missing Monitoring</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(summary.totalMissingElements as any).monitoring || 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Avg Scope Accuracy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{((summary.averageScores as any).scopeAccuracy?.toFixed(1)) || 'N/A'}%</div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analyses" className="space-y-4">
            {viewMode === 'list' ? (
              <div className="space-y-4">
                {analysisResults.map((result, idx) => (
                  <Card 
                    key={idx} 
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => {
                      setSelectedDocument(result)
                      setViewMode('detail')
                    }}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{result.fileName}</CardTitle>
                        <Button variant="ghost" size="sm">
                          View Details →
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                      <div>
                        <div className="text-sm text-muted-foreground">Completeness</div>
                        <div className="text-lg font-semibold">
                          {result.scores.completeness.toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Compliance</div>
                        <div className="text-lg font-semibold">
                          {result.scores.compliance.toFixed(0)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Scope Accuracy</div>
                        <div className="text-lg font-semibold">
                          {result.scores.scopeAccuracy?.toFixed(0) || 'N/A'}%
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Billing Accuracy</div>
                        <div className="text-lg font-semibold">
                          {result.scores.billingAccuracy?.toFixed(0) || 'N/A'}%
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Standardization</div>
                        <div className="text-lg font-semibold">
                          {result.scores.standardization.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <div className="text-sm text-muted-foreground">IICRC Missing</div>
                        <div className="text-lg font-semibold">{result.missingElements.iicrc}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">AU Standards Missing</div>
                        <div className="text-lg font-semibold">{result.missingElements.australianStandards || 0}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">OH&S/WHS Missing</div>
                        <div className="text-lg font-semibold">{(result.missingElements.ohs || 0) + (result.missingElements.whs || 0)}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Scope Missing</div>
                        <div className="text-lg font-semibold">{result.missingElements.scopeOfWorks || 0}</div>
                      </div>
                    </div>
                    {result.estimatedMissingRevenue && result.estimatedMissingRevenue > 0 && (
                      <Alert>
                        <DollarSign className="h-4 w-4" />
                        <AlertDescription>
                          Estimated missing revenue: <strong>${result.estimatedMissingRevenue.toFixed(2)}</strong>
                        </AlertDescription>
                      </Alert>
                    )}
                    {result.issues.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold mb-2">Issues Found ({result.issues.length})</h4>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {result.issues.slice(0, 5).map((issue, issueIdx) => (
                            <div key={issueIdx} className="flex items-start gap-2 text-sm p-2 border rounded">
                              <Badge className={getSeverityColor(issue.severity)}>
                                {issue.severity}
                              </Badge>
                              <div className="flex-1">
                                <div className="font-medium">{issue.elementName}</div>
                                {issue.standardReference && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {issue.standardReference}
                                  </div>
                                )}
                                {issue.description && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {issue.description.substring(0, 150)}...
                                  </div>
                                )}
                              </div>
                              {issue.isBillable && issue.estimatedCost && (
                                <Badge variant="outline" className="text-green-600">
                                  ${issue.estimatedCost.toFixed(2)}
                                </Badge>
                              )}
                            </div>
                          ))}
                          {result.issues.length > 5 && (
                            <p className="text-xs text-muted-foreground">
                              +{result.issues.length - 5} more issues
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            ) : selectedDocument ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" onClick={() => {
                    setViewMode('list')
                    setSelectedDocument(null)
                  }}>
                    ← Back to List
                  </Button>
                  <h2 className="text-2xl font-bold">{selectedDocument.fileName}</h2>
                  <div></div>
                </div>

                {/* Original Document */}
                <Card>
                  <CardHeader>
                    <CardTitle>Original Document</CardTitle>
                    <CardDescription>View or download the original PDF</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2 mb-4">
                      <Button asChild>
                        <a 
                          href={`/api/claims/document/${selectedDocument.fileId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          View PDF
                        </a>
                      </Button>
                      <Button variant="outline" asChild>
                        <a 
                          href={`/api/claims/document/${selectedDocument.fileId}`}
                          download={selectedDocument.fileName}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download PDF
                        </a>
                      </Button>
                    </div>
                    <div className="border rounded-lg overflow-hidden" style={{ height: '600px' }}>
                      <iframe
                        src={`/api/claims/document/${selectedDocument.fileId}`}
                        className="w-full h-full"
                        title="PDF Viewer"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Missing Elements by Category */}
                <Card>
                  <CardHeader>
                    <CardTitle>Missing Elements Analysis</CardTitle>
                    <CardDescription>All missing elements identified in the gap analysis</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="all" className="space-y-4">
                      <TabsList className="grid w-full grid-cols-7">
                        <TabsTrigger value="all">All ({selectedDocument.issues.length})</TabsTrigger>
                        <TabsTrigger value="iicrc">IICRC ({selectedDocument.issues.filter(i => i.category === 'IICRC_COMPLIANCE').length})</TabsTrigger>
                        <TabsTrigger value="australian">AU ({selectedDocument.issues.filter(i => i.category === 'AUSTRALIAN_STANDARD').length})</TabsTrigger>
                        <TabsTrigger value="ohs">OH&S ({selectedDocument.issues.filter(i => i.category === 'OH_S_POLICY' || i.category === 'WHS_REQUIREMENT').length})</TabsTrigger>
                        <TabsTrigger value="scope">Scope ({selectedDocument.issues.filter(i => i.category === 'SCOPE_OF_WORKS').length})</TabsTrigger>
                        <TabsTrigger value="billing">Billing ({selectedDocument.issues.filter(i => i.category === 'BILLING_ITEM').length})</TabsTrigger>
                        <TabsTrigger value="docs">Docs ({selectedDocument.issues.filter(i => i.category === 'DOCUMENTATION').length})</TabsTrigger>
                      </TabsList>

                      <TabsContent value="all" className="space-y-3">
                        {selectedDocument.issues.map((issue, idx) => (
                          <Card key={idx} className="border-l-4" style={{
                            borderLeftColor: issue.severity === 'CRITICAL' ? '#ef4444' :
                                            issue.severity === 'HIGH' ? '#f97316' :
                                            issue.severity === 'MEDIUM' ? '#eab308' : '#3b82f6'
                          }}>
                            <CardContent className="pt-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Badge className={getSeverityColor(issue.severity)}>{issue.severity}</Badge>
                                    <Badge variant="outline">{issue.category.replace(/_/g, ' ')}</Badge>
                                  </div>
                                  <h4 className="font-semibold text-lg mb-2">{issue.elementName}</h4>
                                  {issue.standardReference && (
                                    <p className="text-sm text-muted-foreground mb-2">
                                      <strong>Standard:</strong> {issue.standardReference}
                                    </p>
                                  )}
                                  {issue.description && <p className="text-sm mb-2">{issue.description}</p>}
                                  {issue.suggestedLineItem && (
                                    <p className="text-sm text-muted-foreground">
                                      <strong>Line Item:</strong> {issue.suggestedLineItem}
                                    </p>
                                  )}
                                </div>
                                {issue.isBillable && (
                                  <div className="text-right">
                                    {issue.estimatedCost && (
                                      <div className="text-2xl font-bold text-green-600">
                                        ${issue.estimatedCost.toFixed(2)}
                                      </div>
                                    )}
                                    {issue.estimatedHours && (
                                      <div className="text-sm text-muted-foreground">
                                        {issue.estimatedHours.toFixed(1)}h
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </TabsContent>

                      {['iicrc', 'australian', 'ohs', 'scope', 'billing', 'docs'].map(category => (
                        <TabsContent key={category} value={category} className="space-y-3">
                          {selectedDocument.issues
                            .filter(issue => {
                              if (category === 'iicrc') return issue.category === 'IICRC_COMPLIANCE'
                              if (category === 'australian') return issue.category === 'AUSTRALIAN_STANDARD'
                              if (category === 'ohs') return issue.category === 'OH_S_POLICY' || issue.category === 'WHS_REQUIREMENT'
                              if (category === 'scope') return issue.category === 'SCOPE_OF_WORKS'
                              if (category === 'billing') return issue.category === 'BILLING_ITEM'
                              if (category === 'docs') return issue.category === 'DOCUMENTATION'
                              return false
                            })
                            .map((issue, idx) => (
                              <Card key={idx} className="border-l-4" style={{
                                borderLeftColor: issue.severity === 'CRITICAL' ? '#ef4444' :
                                                issue.severity === 'HIGH' ? '#f97316' :
                                                issue.severity === 'MEDIUM' ? '#eab308' : '#3b82f6'
                              }}>
                                <CardContent className="pt-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge className={getSeverityColor(issue.severity)}>{issue.severity}</Badge>
                                      </div>
                                      <h4 className="font-semibold text-lg mb-2">{issue.elementName}</h4>
                                      {issue.standardReference && (
                                        <p className="text-sm text-muted-foreground mb-2">
                                          <strong>Standard:</strong> {issue.standardReference}
                                        </p>
                                      )}
                                      {issue.description && <p className="text-sm mb-2">{issue.description}</p>}
                                      {issue.suggestedLineItem && (
                                        <p className="text-sm text-muted-foreground">
                                          <strong>Line Item:</strong> {issue.suggestedLineItem}
                                        </p>
                                      )}
                                    </div>
                                    {issue.isBillable && (
                                      <div className="text-right">
                                        {issue.estimatedCost && (
                                          <div className="text-2xl font-bold text-green-600">
                                            ${issue.estimatedCost.toFixed(2)}
                                          </div>
                                        )}
                                        {issue.estimatedHours && (
                                          <div className="text-sm text-muted-foreground">
                                            {issue.estimatedHours.toFixed(1)}h
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                        </TabsContent>
                      ))}
                    </Tabs>
                  </CardContent>
                </Card>

                {/* Report Structure Analysis */}
                {selectedDocument.reportStructure && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Report Structure & Flow Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">Sections Found:</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedDocument.reportStructure.sections.map((section, idx) => (
                            <Badge key={idx} variant="outline">{section}</Badge>
                          ))}
                        </div>
                      </div>
                      {selectedDocument.reportStructure.missingSections.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2 text-red-600">Missing Sections:</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedDocument.reportStructure.missingSections.map((section, idx) => (
                              <Badge key={idx} variant="destructive">{section}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedDocument.reportStructure.flowIssues.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2 text-yellow-600">Flow Issues:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {selectedDocument.reportStructure.flowIssues.map((issue, idx) => (
                              <li key={idx} className="text-sm">{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Technician Pattern Analysis */}
                {selectedDocument.technicianPattern && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Technician Pattern Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-semibold mb-2">Reporting Style:</h4>
                        <p className="text-sm">{selectedDocument.technicianPattern.reportingStyle}</p>
                      </div>
                      <div>
                        <h4 className="font-semibold mb-2">Standardization Level:</h4>
                        <Badge className={
                          selectedDocument.technicianPattern.standardizationLevel === 'HIGH' ? 'bg-green-500' :
                          selectedDocument.technicianPattern.standardizationLevel === 'MEDIUM' ? 'bg-yellow-500' : 'bg-red-500'
                        }>
                          {selectedDocument.technicianPattern.standardizationLevel}
                        </Badge>
                      </div>
                      {selectedDocument.technicianPattern.strengths.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2 text-green-600">Strengths:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {selectedDocument.technicianPattern.strengths.map((strength, idx) => (
                              <li key={idx} className="text-sm">{strength}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {selectedDocument.technicianPattern.commonOmissions.length > 0 && (
                        <div>
                          <h4 className="font-semibold mb-2 text-red-600">Common Omissions:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {selectedDocument.technicianPattern.commonOmissions.map((omission, idx) => (
                              <li key={idx} className="text-sm">{omission}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="issues" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Top Issues Across All Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {summary.topIssues.map((issue, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getSeverityColor(issue.severity)}>
                            {issue.severity}
                          </Badge>
                          <span className="font-medium">{issue.elementName}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{issue.description}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Badge variant="outline">{issue.count}x</Badge>
                        {issue.isBillable && issue.totalCost > 0 && (
                          <Badge className="bg-green-500">
                            ${issue.totalCost.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {processing && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-lg font-medium">Analyzing PDFs...</p>
              <p className="text-sm text-muted-foreground">This may take a few moments</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

