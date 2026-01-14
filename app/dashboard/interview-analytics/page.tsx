'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  TrendingUp,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  RefreshCw,
} from 'lucide-react'
import { useInterviewAnalytics } from '@/lib/forms/hooks'
import type {
  UserAnalyticsSummary,
  TemplatePerformanceAnalytics,
} from '@/lib/forms/analytics'

/**
 * Interview Analytics Dashboard
 * Admin dashboard for monitoring interview system performance
 * Route: /dashboard/interview-analytics
 */
export default function InterviewAnalyticsDashboard() {
  const [aggregateStats, setAggregateStats] = useState<any>(null)
  const [templateStats, setTemplateStats] = useState<TemplatePerformanceAnalytics[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const { data: userAnalytics, isLoading: isLoadingUser } = useInterviewAnalytics({
    type: 'user',
    autoFetch: false,
  })

  /**
   * Fetch analytics data
   */
  const fetchAnalytics = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch aggregate statistics
      const aggregateResponse = await fetch('/api/forms/interview/analytics?type=aggregate')
      if (!aggregateResponse.ok) {
        throw new Error('Failed to fetch aggregate statistics')
      }
      const aggregateData = await aggregateResponse.json()
      setAggregateStats(aggregateData)

      // Fetch template-specific analytics
      // In a real app, you'd fetch all templates from the database first
      // For now, we'll just use the aggregate data

      setLastRefresh(new Date())
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch analytics'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Load analytics on mount
   */
  useEffect(() => {
    fetchAnalytics()
  }, [])

  /**
   * Format percentage
   */
  const formatPercentage = (value: number): string => {
    return `${Math.round(value)}%`
  }

  /**
   * Format currency
   */
  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      maximumFractionDigits: 0,
    }).format(value)
  }

  /**
   * Format duration in minutes/hours
   */
  const formatDuration = (seconds: number): string => {
    const minutes = Math.round(seconds / 60)
    if (minutes < 60) {
      return `${minutes}m`
    }
    const hours = (minutes / 60).toFixed(1)
    return `${hours}h`
  }

  if (isLoading) {
    return (
      <div className="py-8">
        <div className="flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <p className="ml-2 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="py-8 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Interview Analytics</h1>
          <p className="mt-2 text-gray-600">Monitor guided interview performance and usage metrics</p>
          {lastRefresh && (
            <p className="mt-1 text-xs text-gray-500">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <Button onClick={fetchAnalytics} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      {aggregateStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Total Sessions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900">{aggregateStats.totalSessions}</p>
              <p className="text-xs text-gray-500 mt-1">
                {aggregateStats.completedSessions} completed
              </p>
            </CardContent>
          </Card>

          {/* Completion Rate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">
                {formatPercentage(aggregateStats.completionRate)}
              </p>
              <Progress
                value={aggregateStats.completionRate}
                className="mt-2 h-1"
              />
            </CardContent>
          </Card>

          {/* Avg Duration */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Avg Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">
                {formatDuration(aggregateStats.averageSessionDuration)}
              </p>
              <p className="text-xs text-gray-500 mt-1">per session</p>
            </CardContent>
          </Card>

          {/* Avg Fields Populated */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Fields Populated</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-purple-600">
                {aggregateStats.averageFieldsPopulated}
              </p>
              <p className="text-xs text-gray-500 mt-1">per session</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Analytics Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span>Templates</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            <span>Users</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {aggregateStats && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sessions Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>Sessions Summary</CardTitle>
                    <CardDescription>Breakdown of all interview sessions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Completed</span>
                        <Badge className="bg-green-100 text-green-800">
                          {aggregateStats.completedSessions}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Total Sessions</span>
                        <span className="font-semibold text-gray-900">
                          {aggregateStats.totalSessions}
                        </span>
                      </div>
                      <Progress
                        value={
                          aggregateStats.totalSessions > 0
                            ? (aggregateStats.completedSessions / aggregateStats.totalSessions) *
                              100
                            : 0
                        }
                        className="h-2"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Confidence Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>Field Confidence</CardTitle>
                    <CardDescription>Average confidence in auto-populated fields</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="text-center">
                        <p className="text-4xl font-bold text-blue-600">
                          {formatPercentage(aggregateStats.averageFieldConfidence)}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">average confidence</p>
                      </div>
                      <Progress
                        value={aggregateStats.averageFieldConfidence}
                        className="h-2"
                      />
                      <p className="text-xs text-gray-500">
                        {aggregateStats.averageFieldConfidence >= 80
                          ? 'Excellent field mapping confidence'
                          : aggregateStats.averageFieldConfidence >= 70
                            ? 'Good field mapping confidence'
                            : 'Consider improving field mapping'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Templates */}
              {aggregateStats.topPerformingTemplates?.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Top Performing Templates</CardTitle>
                    <CardDescription>
                      Templates with highest completion rates
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {aggregateStats.topPerformingTemplates.map(
                        (template: any, index: number) => (
                          <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {template.templateId}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                {template.sessionCount} sessions
                              </p>
                            </div>
                            <Badge className="bg-green-100 text-green-800">
                              {formatPercentage(template.completionRate)}
                            </Badge>
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <CardTitle>Template Performance Metrics</CardTitle>
              <CardDescription>
                Detailed performance analysis for each form template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Template-specific analytics will show detailed performance metrics for each form
                  template once interviews have been conducted.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Performance Metrics</CardTitle>
              <CardDescription>
                Analytics for individual users and their interview patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  User-specific analytics will show individual performance metrics when accessed
                  from a user profile or admin view.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Performance Tips */}
      {aggregateStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Performance Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {aggregateStats.completionRate >= 80 ? (
                <p className="text-green-700">
                  ✓ Excellent completion rate - users are successfully completing interviews
                </p>
              ) : aggregateStats.completionRate >= 60 ? (
                <p className="text-yellow-700">
                  ⚠ Completion rate could be improved - consider simplifying questions or providing better guidance
                </p>
              ) : (
                <p className="text-red-700">
                  ✗ Low completion rate - urgent review needed for interview flow and questions
                </p>
              )}

              {aggregateStats.averageFieldConfidence >= 80 ? (
                <p className="text-green-700">
                  ✓ High field confidence - auto-population is working well
                </p>
              ) : (
                <p className="text-yellow-700">
                  ⚠ Field mapping confidence could be improved - review answer-to-field mappings
                </p>
              )}

              {aggregateStats.averageSessionDuration < 600 ? (
                <p className="text-green-700">
                  ✓ Fast average completion - interview flow is efficient
                </p>
              ) : (
                <p className="text-yellow-700">
                  ⚠ Average session duration is high - consider streamlining the interview
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
