'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  Play,
  Shield,
  Terminal,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface CronJob {
  id: string
  name: string
  description: string
  path: string
}

interface JobRunState {
  status: 'idle' | 'running' | 'success' | 'error'
  message?: string
}

export default function CronJobsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [jobStates, setJobStates] = useState<Record<string, JobRunState>>({})

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (session?.user?.role !== 'ADMIN') {
      router.push('/dashboard')
      return
    }
    fetchJobs()
  }, [status, session, router])

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/admin/cron-jobs')
      if (response.ok) {
        const data = await response.json()
        setJobs(data.jobs)
      }
    } catch (error) {
      console.error('Error fetching cron jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const runJob = async (jobId: string) => {
    setJobStates(prev => ({ ...prev, [jobId]: { status: 'running' } }))
    try {
      const response = await fetch('/api/admin/cron-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      })
      const data = await response.json()
      if (data.success) {
        setJobStates(prev => ({
          ...prev,
          [jobId]: { status: 'success', message: `Completed with HTTP ${data.status}` },
        }))
      } else {
        setJobStates(prev => ({
          ...prev,
          [jobId]: { status: 'error', message: data.error ?? `HTTP ${data.status}` },
        }))
      }
    } catch (err) {
      setJobStates(prev => ({
        ...prev,
        [jobId]: { status: 'error', message: String(err) },
      }))
    } finally {
      // Auto-clear feedback after 4 seconds
      setTimeout(() => {
        setJobStates(prev => ({ ...prev, [jobId]: { status: 'idle' } }))
      }, 4000)
    }
  }

  const getStatusBadge = (state: JobRunState) => {
    if (state.status === 'success') {
      return (
        <Badge className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400">
          <CheckCircle className="h-3 w-3" />
          {state.message ?? 'Success'}
        </Badge>
      )
    }
    if (state.status === 'error') {
      return (
        <Badge className="gap-1 bg-red-500/10 text-red-600 dark:text-red-400">
          <AlertCircle className="h-3 w-3" />
          {state.message ?? 'Error'}
        </Badge>
      )
    }
    return null
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Shield className="h-12 w-12 text-neutral-400" />
        <p className="text-neutral-600 dark:text-neutral-400">Admin access required</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard/admin')}
          className="gap-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            Cron Job Management
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Monitor and manually trigger scheduled background jobs
          </p>
        </div>
        <Badge className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Shield className="h-3 w-3" />
          Admin Only
        </Badge>
      </div>

      {/* Info banner */}
      <Card className="bg-cyan-500/5 border-cyan-200 dark:border-cyan-800/60">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Terminal className="h-4 w-4 text-cyan-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              These jobs run automatically on a schedule. Use "Run Now" to trigger them manually for testing or
              to catch up on missed runs. Each job executes with the configured{' '}
              <code className="text-xs bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded font-mono">CRON_SECRET</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Jobs table */}
      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Clock className="h-5 w-5 text-cyan-500" />
            Scheduled Jobs
          </CardTitle>
          <CardDescription>{jobs.length} jobs configured</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {jobs.map((job) => {
              const state = jobStates[job.id] ?? { status: 'idle' }
              const isRunning = state.status === 'running'
              return (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-neutral-50 dark:bg-neutral-800 gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-neutral-900 dark:text-white text-sm">
                        {job.name}
                      </span>
                      <code className="text-xs text-neutral-400 font-mono hidden sm:inline">
                        {job.path}
                      </code>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {job.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {getStatusBadge(state)}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runJob(job.id)}
                      disabled={isRunning}
                      className={cn(
                        'gap-2',
                        !isRunning &&
                          'border-cyan-200 dark:border-cyan-800/60 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30'
                      )}
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Running…
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          Run Now
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
