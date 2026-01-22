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
  Crown,
  XIcon
} from "lucide-react"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"
import UpgradeBanner from "@/components/UpgradeBanner"

interface SubscriptionStatus {
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAST_DUE'
  subscriptionPlan?: string
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [dashboardData, setDashboardData] = useState({
    totalReports: 0,
    totalClients: 0,
    totalRevenue: 0,
    avgReportValue: 0,
    recentReports: [],
    recentClients: [],
    loading: true
  })
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const [showGuidedModal, setShowGuidedModal] = useState(false)
  const [guidedStep, setGuidedStep] = useState<'api' | 'pricing' | 'client' | 'report'>('api')

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const upgradeFlag = searchParams.get('upgrade')
      const upgradeSuccessFlag = searchParams.get('upgrade_success')
      fetchSubscriptionStatus()
      fetchDashboardData()
      
      // Show guided modal if coming from successful payment
      if (upgradeSuccessFlag === 'true') {
        setTimeout(() => {
          setShowGuidedModal(true)
        }, 1500)
      } else if (upgradeFlag === 'true') {
        // Show upgrade modal if coming from signup or if user doesn't have active subscription
        setTimeout(() => {
          setShowUpgradeModal(true)
        }, 1000)
      }
    }
  }, [status, session, searchParams])

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch("/api/user/profile")
      if (response.ok) {
        const data = await response.json()
        setSubscription({
          subscriptionStatus: data.profile?.subscriptionStatus,
          subscriptionPlan: data.profile?.subscriptionPlan
        })
        
        // Check if user needs to upgrade (not ACTIVE)
        if (data.profile?.subscriptionStatus !== 'ACTIVE') {
          // Show upgrade modal after a delay if not already shown
          setTimeout(() => {
            const upgradeFlag = searchParams.get('upgrade')
            if (!upgradeFlag) {
              setShowUpgradeModal(true)
            }
          }, 2000)
        }
      }
    } catch (error) {
      console.error("Error fetching subscription status:", error)
    }
  }

  const hasActiveSubscription = () => {
    return subscription?.subscriptionStatus === 'ACTIVE'
  }

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
      
      // Calculate Total Revenue: Sum of all available cost sources
      // Priority: estimatedCost (from cost estimation) > equipmentCostTotal > totalCost
      const reportsWithCost = reports.map((report: any) => {
        // Try multiple cost sources in priority order
        if (report.estimatedCost) return report.estimatedCost
        if (report.equipmentCostTotal) return report.equipmentCostTotal
        if (report.totalCost) return report.totalCost
        // Try to parse costEstimationData if available
        if (report.costEstimationData) {
          try {
            const costData = typeof report.costEstimationData === 'string' 
              ? JSON.parse(report.costEstimationData) 
              : report.costEstimationData
            if (costData?.totals?.totalIncGST) return costData.totals.totalIncGST
          } catch (e) {
            // Ignore parse errors
          }
        }
        return 0
      })
      
      const totalRevenue = reportsWithCost.reduce((sum: number, cost: number) => sum + cost, 0)
      const avgReportValue = totalReports > 0 ? totalRevenue / totalReports : 0
      
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
        avgReportValue,
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

  const stats = [
    { 
      label: "Reports Generated", 
      value: dashboardData.loading ? "..." : dashboardData.totalReports.toString(), 
      icon: FileText, 
      color: "text-cyan-400" 
    },
    { 
      label: "Total Clients", 
      value: dashboardData.loading ? "..." : dashboardData.totalClients.toString(), 
      icon: Users, 
      color: "text-emerald-400" 
    },
    { 
      label: "Avg Report Value", 
      value: dashboardData.loading ? "..." : `$${Math.round(dashboardData.avgReportValue || 0).toLocaleString()}`, 
      icon: DollarSign, 
      color: "text-blue-400" 
    },
    { 
      label: "Active Reports", 
      value: dashboardData.loading ? "..." : dashboardData.recentReports.filter((r: any) => r.status !== 'Draft').length.toString(), 
      icon: CheckCircle, 
      color: "text-orange-400" 
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
    <div className={cn("min-h-screen", "bg-gradient-to-br from-neutral-50 via-white to-neutral-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950")}>
      {/* Header */}
      <div className={cn("border-b backdrop-blur-sm", "border-neutral-200 dark:border-slate-800/50", "bg-white/30 dark:bg-slate-900/30")}>
        <div className="px-6 py-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 
              className={cn("text-3xl font-medium mb-2", "text-neutral-900 dark:text-white")}
              style={{ fontFamily: 'Titillium Web, sans-serif' }}
            >
              Dashboard Overview
            </h1>
            <p className={cn("text-neutral-600 dark:text-slate-400")}>
              Welcome back, {session?.user?.name?.split(' ')[0]}! Here's what's happening with your restoration reports.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <main>
        <div className=" mx-auto space-y-8">
          {/* Upgrade Banner for Free Users */}
          {!hasActiveSubscription() && (
            <UpgradeBanner variant="inline" />
          )}
          
          {/* Stats Grid */}
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
                className={cn("border rounded-xl p-6 transition-all duration-300", "bg-white/50 dark:bg-slate-800/50", "border-neutral-200 dark:border-slate-700/50", "hover:border-neutral-300 dark:hover:border-slate-600/50")}
              >
                <div className="flex items-center justify-between mb-4">
                  <stat.icon size={24} className={`${stat.color} opacity-80`} />
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className={cn("text-sm font-medium", "text-neutral-600 dark:text-slate-400")}>{stat.label}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Main Content Grid */}
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Quick Actions */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-2"
            >
              <div className={cn("border rounded-xl p-6", "bg-white/50 dark:bg-slate-800/50", "border-neutral-200 dark:border-slate-700/50")}>
                <h2 
                  className={cn("text-xl font-medium mb-6", "text-neutral-900 dark:text-white")}
                  style={{ fontFamily: 'Titillium Web, sans-serif' }}
                >
                  Quick Actions
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {quickActions.map((action, index) => (
                    <motion.a
                      key={action.title}
                      href={action.href}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.6, delay: 0.3 + index * 0.1 }}
                      className={cn(
                        "group p-4 border rounded-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-cyan-500/10 active:scale-[0.98]",
                        "bg-neutral-50 dark:bg-slate-700/30",
                        "border-neutral-200 dark:border-slate-600/30",
                        "hover:border-neutral-300 dark:hover:border-slate-500/50",
                        "hover:bg-neutral-100 dark:hover:bg-slate-700/50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-r ${action.color} flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3`}>
                          <action.icon size={20} className={cn("transition-transform duration-200 group-hover:scale-110", "text-neutral-700 dark:text-white")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={cn("font-medium transition-colors duration-200", "text-neutral-900 dark:text-white", "group-hover:text-cyan-600 dark:group-hover:text-cyan-400")}>
                            {action.title}
                          </h3>
                          <p className={cn("text-sm mt-1", "text-neutral-600 dark:text-slate-400")}>
                            {action.description}
                          </p>
                        </div>
                        <ArrowRight size={16} className={cn("transition-all duration-200 flex-shrink-0 group-hover:translate-x-1 group-hover:scale-110", "text-neutral-600 dark:text-slate-400", "group-hover:text-cyan-600 dark:group-hover:text-cyan-400")} />
                      </div>
                    </motion.a>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Recent Activity */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="space-y-6"
            >
              <div className={cn("border rounded-xl p-6", "bg-white/50 dark:bg-slate-800/50", "border-neutral-200 dark:border-slate-700/50")}>
                <h3 
                  className={cn("text-lg font-medium mb-4", "text-neutral-900 dark:text-white")}
                  style={{ fontFamily: 'Titillium Web, sans-serif' }}
                >
                  Recent Activity
                </h3>
                <div className="space-y-3">
                  {dashboardData.loading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400"></div>
                    </div>
                  ) : getRecentActivity().length > 0 ? (
                    getRecentActivity().map((activity, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.6, delay: 0.5 + index * 0.1 }}
                        className="flex items-center gap-3"
                      >
                        <div className={`w-2 h-2 rounded-full ${
                          activity.status === 'success' ? 'bg-emerald-400' : 'bg-orange-400'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-medium", "text-neutral-900 dark:text-white")}>{activity.action}</p>
                          <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>{activity.time}</p>
                        </div>
                      </motion.div>
                    ))
                  ) : (
                    <div className="text-center py-4">
                      <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>No recent activity</p>
                      <p className={cn("text-xs mt-1", "text-neutral-500 dark:text-slate-500")}>Create your first report to get started</p>
                    </div>
                  )}
            </div>
      </div>

              {/* Getting Started */}
              <div className={cn("border rounded-xl p-6", "bg-white/50 dark:bg-slate-800/50", "border-neutral-200 dark:border-slate-700/50")}>
                <h3 
                  className={cn("text-lg font-medium mb-4", "text-neutral-900 dark:text-white")}
                  style={{ fontFamily: 'Titillium Web, sans-serif' }}
                >
                  Getting Started
                </h3>
                <div className="space-y-3">
                  <div className={cn(
                    "flex items-center gap-3 p-3 rounded-lg",
                    dashboardData.totalReports > 0 
                      ? 'bg-emerald-500/20 border border-emerald-500/30' 
                      : cn("bg-neutral-100 dark:bg-slate-700/30", "border border-neutral-200 dark:border-transparent")
                  )}>
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center",
                      dashboardData.totalReports > 0 
                        ? 'bg-emerald-500/20' 
                        : 'bg-cyan-500/20'
                    )}>
                      <span className={cn(
                        "text-xs font-bold",
                        dashboardData.totalReports > 0 
                          ? 'text-emerald-400' 
                          : 'text-cyan-400'
                      )}>1</span>
                    </div>
                    <p className={cn(
                      "text-sm",
                      dashboardData.totalReports > 0 
                        ? 'text-emerald-600 dark:text-emerald-300' 
                        : cn("text-neutral-700 dark:text-slate-300")
                    )}>
                      {dashboardData.totalReports > 0 
                        ? `Create your first report ✓ (${dashboardData.totalReports} created)` 
                        : 'Create your first report'}
                    </p>
                  </div>
                  
                  <div className={cn(
                    "flex items-center gap-3 p-3 rounded-lg",
                    dashboardData.totalClients > 0 
                      ? 'bg-emerald-500/20 border border-emerald-500/30' 
                      : cn("bg-neutral-100 dark:bg-slate-700/30", "border border-neutral-200 dark:border-transparent")
                  )}>
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center",
                      dashboardData.totalClients > 0 
                        ? 'bg-emerald-500/20' 
                        : 'bg-neutral-200 dark:bg-slate-600/50'
                    )}>
                      <span className={cn(
                        "text-xs font-bold",
                        dashboardData.totalClients > 0 
                          ? 'text-emerald-400' 
                          : cn("text-neutral-600 dark:text-slate-400")
                      )}>2</span>
                    </div>
                    <p className={cn(
                      "text-sm",
                      dashboardData.totalClients > 0 
                        ? 'text-emerald-600 dark:text-emerald-300' 
                        : cn("text-neutral-600 dark:text-slate-400")
                    )}>
                      {dashboardData.totalClients > 0 
                        ? `Add clients ✓ (${dashboardData.totalClients} added)` 
                        : 'Add your first client'}
                    </p>
                  </div>
                  
                  <div className={cn("flex items-center gap-3 p-3 rounded-lg", "bg-neutral-100 dark:bg-slate-700/30", "border border-neutral-200 dark:border-transparent")}>
                    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center", "bg-neutral-200 dark:bg-slate-600/50")}>
                      <span className={cn("text-xs font-bold", "text-neutral-600 dark:text-slate-400")}>3</span>
                    </div>
                    <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Explore analytics & insights</p>
                  </div>
                </div>
            </div>
            </motion.div>
        </div>

          {/* Performance Overview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className={cn("border rounded-xl p-6", "bg-white/50 dark:bg-slate-800/50", "border-neutral-200 dark:border-slate-700/50")}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 
                className={cn("text-xl font-medium", "text-neutral-900 dark:text-white")}
                style={{ fontFamily: 'Titillium Web, sans-serif' }}
              >
                Performance Overview
              </h2>
              <div className={cn("flex items-center gap-2 text-sm", "text-neutral-600 dark:text-slate-400")}>
                <Activity size={16} />
                <span>Last 30 days</span>
        </div>
      </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <TrendingUp size={24} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold text-cyan-400 mb-1">
                  {dashboardData.loading ? "..." : `${Math.round((dashboardData.totalReports / Math.max(dashboardData.totalClients, 1)) * 100)}%`}
                </h3>
                <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Reports per Client</p>
      </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle size={24} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold text-emerald-400 mb-1">
                  {dashboardData.loading ? "..." : `${dashboardData.recentReports.filter((r: any) => r.status !== 'Draft').length}/${dashboardData.totalReports || 1}`}
                </h3>
                <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Completed Reports</p>
              </div>

              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
                  <DollarSign size={24} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold text-orange-400 mb-1">
                  {dashboardData.loading ? "..." : `$${Math.round(dashboardData.totalRevenue || 0).toLocaleString()}`}
                </h3>
                <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Total Value</p>
              </div>
        </div>
          </motion.div>
        </div>
      </main>

      {/* Guided Setup Modal (After Successful Payment) - Improved */}
      {showGuidedModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 max-w-lg w-full shadow-2xl">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                    <CheckCircle className="text-white" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Welcome! Let's Get Started</h2>
                    <p className="text-sm text-gray-500 dark:text-slate-400">Complete setup in 3 steps</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowGuidedModal(false)
                    toast.success("Setup skipped! You can complete it anytime from Settings.", { duration: 3000 })
                  }} 
                  className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-gray-500 dark:text-slate-400"
                  title="Close"
                >
                  <XIcon size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {guidedStep === 'api' && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold shadow-lg">
                      1
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Zap className="w-5 h-5 text-cyan-500" />
                        Connect API Key
                      </h3>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">High Impact</p>
                    </div>
                  </div>
                  <p className="text-gray-700 dark:text-slate-300">
                    Add your Anthropic API key to enable AI-powered report generation and unlock personalized features.
                  </p>
                  <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-slate-400">
                      <strong className="text-gray-900 dark:text-white">Impact:</strong> Personalizes report generation, enables advanced AI features, and improves report quality significantly.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">⏱️ Est. 2 minutes</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        setShowGuidedModal(false)
                        toast.success("Setup skipped! You can complete it anytime from Settings.", { duration: 3000 })
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 text-sm font-medium"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => {
                        setShowGuidedModal(false)
                        router.push('/dashboard/integrations?onboarding=true')
                      }}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg font-medium hover:shadow-lg hover:shadow-cyan-500/50 transition-all text-white text-sm flex items-center justify-center gap-2"
                    >
                      <Zap className="w-4 h-4" />
                      Add API Key
                    </button>
                    <button
                      onClick={() => setGuidedStep('pricing')}
                      className="px-4 py-2 border border-cyan-500/50 text-cyan-600 dark:text-cyan-400 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-500/10 transition-colors text-sm font-medium"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}
              
              {guidedStep === 'pricing' && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold shadow-lg">
                      2
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-emerald-500" />
                        Configure Pricing
                      </h3>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">High Impact</p>
                    </div>
                  </div>
                  <p className="text-gray-700 dark:text-slate-300">
                    Set up your business rates for labour, equipment, and services to ensure accurate cost estimations.
                  </p>
                  <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-slate-400">
                      <strong className="text-gray-900 dark:text-white">Impact:</strong> Ensures accurate cost estimations and professional quotes for your clients.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">⏱️ Est. 5 minutes</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setGuidedStep('api')}
                      className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 text-sm font-medium"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={() => {
                        setShowGuidedModal(false)
                        toast.success("Setup skipped! You can complete it anytime from Settings.", { duration: 3000 })
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 text-sm font-medium"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => {
                        setShowGuidedModal(false)
                        router.push('/dashboard/pricing-config?onboarding=true')
                      }}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg font-medium hover:shadow-lg hover:shadow-emerald-500/50 transition-all text-white text-sm flex items-center justify-center gap-2"
                    >
                      <DollarSign className="w-4 h-4" />
                      Configure
                    </button>
                    <button
                      onClick={() => setGuidedStep('report')}
                      className="px-4 py-2 border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors text-sm font-medium"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}
              
              {guidedStep === 'report' && (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold shadow-lg">
                      3
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-500" />
                        Create First Report
                      </h3>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1">Medium Impact</p>
                    </div>
                  </div>
                  <p className="text-gray-700 dark:text-slate-300">
                    Generate your first professional restoration report to test the system and see how it works with your settings.
                  </p>
                  <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3">
                    <p className="text-xs text-gray-600 dark:text-slate-400">
                      <strong className="text-gray-900 dark:text-white">Impact:</strong> Test the system and see how reports are generated with your configured settings.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">⏱️ Est. 10 minutes</p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setGuidedStep('pricing')}
                      className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 text-sm font-medium"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={() => {
                        setShowGuidedModal(false)
                        toast.success("Setup skipped! You can complete it anytime from Settings.", { duration: 3000 })
                      }}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300 text-sm font-medium"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => {
                        setShowGuidedModal(false)
                        router.push('/dashboard/reports/new?onboarding=true')
                      }}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-white text-sm flex items-center justify-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      Create Report
                    </button>
                  </div>
                </>
              )}
            </div>
            
            {/* Progress Indicator */}
            <div className="px-6 pb-6">
              <div className="flex items-center justify-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full transition-all ${guidedStep === 'api' ? 'bg-cyan-500 w-8' : 'bg-gray-300 dark:bg-slate-600'}`}></div>
                <div className={`w-2.5 h-2.5 rounded-full transition-all ${guidedStep === 'pricing' ? 'bg-emerald-500 w-8' : 'bg-gray-300 dark:bg-slate-600'}`}></div>
                <div className={`w-2.5 h-2.5 rounded-full transition-all ${guidedStep === 'report' ? 'bg-blue-500 w-8' : 'bg-gray-300 dark:bg-slate-600'}`}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-neutral-200 dark:border-slate-700 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
                  <Crown className="text-white" size={24} />
                </div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Upgrade Required</h2>
              </div>
              <button 
                onClick={() => setShowUpgradeModal(false)} 
                className="p-1 hover:bg-neutral-100 dark:hover:bg-slate-700 rounded transition-all duration-200 hover:scale-110 active:scale-95 text-neutral-600 dark:text-slate-300"
                title="Close"
              >
                <XIcon size={20} className="transition-transform duration-200" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-neutral-700 dark:text-slate-300">
                To create reports and clients, you need an active subscription (Monthly or Yearly plan).
              </p>
              <p className="text-sm text-neutral-600 dark:text-slate-400">
                Upgrade now to unlock all features including unlimited reports, client management, API integrations, and priority support.
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 px-4 py-2 border border-neutral-300 dark:border-slate-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md text-neutral-700 dark:text-slate-300"
                >
                  Maybe Later
                </button>
                <button
                  onClick={() => {
                    setShowUpgradeModal(false)
                    router.push('/dashboard/pricing')
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-orange-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group text-white"
                >
                  <Crown className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Upgrade Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}