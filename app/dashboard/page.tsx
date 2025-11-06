"use client"

import { motion } from "framer-motion"
import {
  FileText,
  Plus,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Users,
  DollarSign,
  BarChart3,
  Zap,
  Shield,
  Calendar,
  ArrowRight,
  Activity,
  PlayCircle,
  Target
} from "lucide-react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { QuickStartPanel, PhaseProgressBar } from "@/components/orchestrator"
import type { InputMethod, PhaseProgress, OrchestratorStats } from "@/components/orchestrator/types"

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [dashboardData, setDashboardData] = useState({
    totalReports: 0,
    totalClients: 0,
    totalRevenue: 0,
    recentReports: [],
    recentClients: [],
    loading: true
  })
  const [showQuickStart, setShowQuickStart] = useState(false)

  // Mock orchestrator stats (replace with actual API call)
  const orchestratorStats: OrchestratorStats = {
    activeProcesses: 3,
    completedToday: 7,
    averageTimePerReport: '12 min',
    iicrcCompliantPercentage: 98
  }

  // Mock active workflow data (replace with actual API call)
  const mockProgress: PhaseProgress = {
    currentPhase: 'processing',
    completedPhases: ['initiation'],
    progressPercentage: 45,
    estimatedTimeRemaining: '5 min'
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      toast.success(`Welcome back, ${session.user.name?.split(' ')[0]}!`)
      fetchDashboardData()
    }
  }, [status, session])

  const fetchDashboardData = async () => {
    try {
      setDashboardData(prev => ({ ...prev, loading: true }))
      
      // Fetch reports data
      const reportsResponse = await fetch('/api/reports')
      const reportsData = reportsResponse.ok ? await reportsResponse.json() : { reports: [] }
      
      // Fetch clients data
      const clientsResponse = await fetch('/api/clients')
      const clientsData = clientsResponse.ok ? await clientsResponse.json() : { clients: [] }
      
      const reports = reportsData.reports || []
      const clients = clientsData.clients || []
      
      // Calculate metrics
      const totalReports = reports.length
      const totalClients = clients.length
      const totalRevenue = reports.reduce((sum: number, report: any) => sum + (report.totalCost || 0), 0)
      
      // Get recent reports (last 5)
      const recentReports = reports
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
      
      // Get recent clients (last 5)
      const recentClients = clients
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
      
      setDashboardData({
        totalReports,
        totalClients,
        totalRevenue,
        recentReports,
        recentClients,
        loading: false
      })
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      setDashboardData(prev => ({ ...prev, loading: false }))
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  const handleMethodSelect = async (method: InputMethod) => {
    console.log('Selected method:', method)

    try {
      // Show loading toast
      toast.loading(`Initialising ${method} workflow...`, { id: 'workflow-init' })

      // Simulate workflow initialization
      await new Promise(resolve => setTimeout(resolve, 500))

      setShowQuickStart(false)

      // Route to appropriate workflow page based on method
      switch (method) {
        case 'text':
          toast.success('Text input workflow ready', { id: 'workflow-init' })
          router.push('/dashboard/reports/new?method=text')
          break

        case 'pdf':
          toast.success('PDF upload workflow ready', { id: 'workflow-init' })
          router.push('/dashboard/reports/new?method=pdf')
          break

        case 'word':
          toast.success('Word upload workflow ready', { id: 'workflow-init' })
          router.push('/dashboard/reports/new?method=word')
          break

        case 'api':
          toast.info('Field App API integration coming soon', { id: 'workflow-init' })
          break

        default:
          toast.error('Unknown input method', { id: 'workflow-init' })
      }
    } catch (error) {
      console.error('Error initialising workflow:', error)
      toast.error('Failed to start workflow. Please try again.', { id: 'workflow-init' })
    }
  }

  const stats = [
    {
      label: "Active Processes",
      value: orchestratorStats.activeProcesses.toString(),
      icon: Activity,
      color: "text-blue-400",
      trend: "+2 from yesterday"
    },
    {
      label: "Completed Today",
      value: orchestratorStats.completedToday.toString(),
      icon: CheckCircle,
      color: "text-emerald-400",
      trend: "On track"
    },
    {
      label: "Avg Time Per Report",
      value: orchestratorStats.averageTimePerReport,
      icon: Clock,
      color: "text-cyan-400",
      trend: "-3 min this week"
    },
    {
      label: "IICRC Compliant",
      value: `${orchestratorStats.iicrcCompliantPercentage}%`,
      icon: Target,
      color: "text-purple-400",
      trend: "Excellent"
    }
  ]

  const getRecentActivity = () => {
    const activities: Array<{
      action: string;
      time: string;
      status: 'success' | 'pending';
      type: 'report' | 'client';
    }> = []
    
    // Add recent reports
    dashboardData.recentReports.slice(0, 3).forEach((report: any) => {
      const timeAgo = getTimeAgo(new Date(report.createdAt))
      activities.push({
        action: `Report "${report.title}" created`,
        time: timeAgo,
        status: report.status === 'Draft' ? 'pending' : 'success',
        type: 'report'
      })
    })
    
    // Add recent clients
    dashboardData.recentClients.slice(0, 2).forEach((client: any) => {
      const timeAgo = getTimeAgo(new Date(client.createdAt))
      activities.push({
        action: `Client "${client.name}" added`,
        time: timeAgo,
        status: 'success',
        type: 'client'
      })
    })
    
    return activities.sort((a, b) => {
      const timeA = a.time.includes('min') ? parseInt(a.time) : 0
      const timeB = b.time.includes('min') ? parseInt(b.time) : 0
      return timeA - timeB
    }).slice(0, 5)
  }

  const getTimeAgo = (date: Date) => {
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  const quickActions = [
    { 
      title: "Create New Report", 
      description: "Start a professional damage assessment",
      icon: Plus,
      color: "from-blue-500 to-cyan-500",
      href: "/dashboard/reports/new"
    },
    // { 
    //   title: "View Templates", 
    //   description: "Browse IICRC compliant templates",
    //   icon: FileText,
    //   color: "from-emerald-500 to-teal-500",
    //   href: "/dashboard/templates"
    // },
    { 
      title: "Analytics", 
      description: "Track your reporting performance",
      icon: BarChart3,
      color: "from-purple-500 to-pink-500",
      href: "/dashboard/analytics"
    },
    { 
      title: "Settings", 
      description: "Configure your preferences",
      icon: Users,
      color: "from-orange-500 to-red-500",
      href: "/dashboard/settings"
    }
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Hero Section with Gradient - v0 Inspired */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 rounded-2xl p-8 md:p-12 mb-8 overflow-hidden"
      >
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/20 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs font-medium mb-4">
            AI-Powered Orchestrator
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Welcome to RestoreAssist
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl mb-6">
            Streamline your restoration workflow with our intelligent orchestrator system for professional IICRC-compliant reports.
          </p>
          <div className="flex flex-wrap gap-3">
            <motion.button
              onClick={() => setShowQuickStart(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors shadow-lg flex items-center gap-2"
            >
              <PlayCircle className="w-5 h-5" />
              Start New Assessment
            </motion.button>
            <motion.a
              href="/dashboard/analytics"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 bg-white/10 backdrop-blur-sm text-white rounded-lg font-medium hover:bg-white/20 transition-colors border border-white/20"
            >
              View Analytics
            </motion.a>
          </div>
        </div>
      </motion.div>

      {/* Quick Start Panel Modal */}
      {showQuickStart && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowQuickStart(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="bg-white dark:bg-slate-900 rounded-2xl p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <QuickStartPanel onMethodSelect={handleMethodSelect} />
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowQuickStart(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Main Content */}
      <main>
        <div className=" mx-auto space-y-8">
          {/* Stats Grid - v0 Inspired Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 + index * 0.1 }}
                className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600/50 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${
                    index === 0 ? 'from-blue-400/20 to-blue-600/20' :
                    index === 1 ? 'from-emerald-400/20 to-emerald-600/20' :
                    index === 2 ? 'from-cyan-400/20 to-cyan-600/20' :
                    'from-purple-400/20 to-purple-600/20'
                  }`}>
                    <stat.icon size={24} className={`${stat.color}`} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">{stat.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">{stat.trend}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Active Workflows Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2
                className="text-2xl font-semibold text-slate-900 dark:text-white"
                  >
                Active Workflows
              </h2>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                {orchestratorStats.activeProcesses} in progress
              </span>
            </div>

            {orchestratorStats.activeProcesses > 0 ? (
              <div className="space-y-8">
                {/* Example Active Workflow */}
                <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                        Water Damage Assessment - 123 Main St
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        Started 8 minutes ago via Text Input
                      </p>
                    </div>
                    <div className="px-3 py-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 text-xs font-medium rounded-full">
                      Processing
                    </div>
                  </div>
                  <PhaseProgressBar progress={mockProgress} showDetails={false} />
                </div>

                {/* Additional Workflows (Collapsed) */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          Fire Damage - Commercial
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400">15 min ago</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 dark:text-slate-400">Q&A Phase</span>
                      <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400">75%</span>
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-700/30 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          Mould Assessment - Residential
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400">22 min ago</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-600 dark:text-slate-400">Initiation</span>
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">20%</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                  <Activity size={28} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  No Active Workflows
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
                  Start a new assessment to begin your first workflow
                </p>
                <button
                  onClick={() => setShowQuickStart(true)}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
                >
                  <PlayCircle className="w-5 h-5" />
                  Start New Assessment
                </button>
              </div>
            )}
          </motion.div>

          {/* Main Content Grid */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Recent Tools - v0 Inspired */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-2"
            >
              <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2
                    className="text-xl font-semibold text-slate-900 dark:text-white"
                          >
                    Recent Tools
                  </h2>
                  <a href="/dashboard/reports" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    View All
                  </a>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {quickActions.map((action, index) => (
                    <motion.a
                      key={action.title}
                      href={action.href}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
                      className="group relative bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600/30 rounded-xl p-5 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-500/50 transition-all duration-300"
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center flex-shrink-0 shadow-lg`}>
                          <action.icon size={22} className="text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {action.title}
                          </h3>
                          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
                            {action.description}
                          </p>
                          <div className="mt-3 inline-flex items-center text-xs text-blue-600 dark:text-blue-400 font-medium">
                            Open <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      </div>
                    </motion.a>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Activity & Progress Sidebar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="space-y-6"
            >
              {/* Recent Activity */}
              <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6">
                <h3
                  className="text-lg font-semibold text-slate-900 dark:text-white mb-4"
                      >
                  Recent Activity
                </h3>
                <div className="space-y-4">
                  {dashboardData.loading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 dark:border-cyan-400"></div>
                    </div>
                  ) : getRecentActivity().length > 0 ? (
                    getRecentActivity().map((activity, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.5 + index * 0.1 }}
                        className="flex items-start gap-3 pb-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0 last:pb-0"
                      >
                        <div className={`w-2 h-2 rounded-full mt-1.5 ${
                          activity.status === 'success' ? 'bg-emerald-500' : 'bg-orange-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-900 dark:text-white text-sm font-medium">{activity.action}</p>
                          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">{activity.time}</p>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                        <Activity size={20} className="text-slate-400" />
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">No recent activity</p>
                      <p className="text-slate-500 dark:text-slate-500 text-xs mt-1">Create your first report to get started</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Active Projects */}
              <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3
                    className="text-lg font-semibold text-slate-900 dark:text-white"
                          >
                    Active Projects
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{dashboardData.recentReports.filter((r: any) => r.status !== 'Draft').length} active</span>
                </div>
                <div className="space-y-3">
                  {dashboardData.recentReports.slice(0, 3).map((report: any, index: number) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        report.status === 'Draft' ? 'bg-orange-100 dark:bg-orange-500/20' : 'bg-emerald-100 dark:bg-emerald-500/20'
                      }`}>
                        <FileText size={16} className={report.status === 'Draft' ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{report.title || 'Untitled Report'}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{report.status || 'In Progress'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
        </div>

          {/* Learn & Resources Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2
                className="text-2xl font-semibold text-slate-900 dark:text-white"
                  >
                Learn
              </h2>
              <a href="/dashboard/help" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                View All <ArrowRight size={14} />
              </a>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="group text-center p-6 bg-slate-50 dark:bg-slate-700/30 rounded-xl hover:shadow-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all cursor-pointer">
                <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-lg">
                  <TrendingUp size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-cyan-400 mb-2">
                  {dashboardData.loading ? "..." : `${Math.round((dashboardData.totalReports / Math.max(dashboardData.totalClients, 1)) * 100)}%`}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Reports per Client</p>
                <p className="text-slate-500 dark:text-slate-500 text-xs mt-2">Efficiency metric</p>
              </div>

              <div className="group text-center p-6 bg-slate-50 dark:bg-slate-700/30 rounded-xl hover:shadow-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all cursor-pointer">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-lg">
                  <CheckCircle size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-emerald-400 mb-2">
                  {dashboardData.loading ? "..." : `${dashboardData.recentReports.filter((r: any) => r.status !== 'Draft').length}/${dashboardData.totalReports || 1}`}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Completed Reports</p>
                <p className="text-slate-500 dark:text-slate-500 text-xs mt-2">Success rate tracking</p>
              </div>

              <div className="group text-center p-6 bg-slate-50 dark:bg-slate-700/30 rounded-xl hover:shadow-md hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all cursor-pointer">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform shadow-lg">
                  <DollarSign size={28} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-orange-400 mb-2">
                  {dashboardData.loading ? "..." : `$${dashboardData.totalRevenue.toLocaleString()}`}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Total Revenue</p>
                <p className="text-slate-500 dark:text-slate-500 text-xs mt-2">Financial overview</p>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  )
}