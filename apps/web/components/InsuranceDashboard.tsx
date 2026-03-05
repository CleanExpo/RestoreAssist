"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  Shield, 
  Building, 
  Home, 
  Clock, 
  DollarSign, 
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Users,
  FileText,
  BarChart3,
  Activity
} from "lucide-react"

interface InsuranceDashboardProps {
  reports: any[]
}

export default function InsuranceDashboard({ reports }: InsuranceDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState("30days")
  const [insuranceStats, setInsuranceStats] = useState({
    totalReports: 0,
    propertyCoverage: 0,
    contentsCoverage: 0,
    liabilityCoverage: 0,
    businessInterruption: 0,
    averageCoverage: 0
  })

  useEffect(() => {
    calculateInsuranceStats()
  }, [reports, selectedPeriod])

  const calculateInsuranceStats = () => {
    const filteredReports = filterReportsByPeriod(reports, selectedPeriod)
    
    const stats = {
      totalReports: filteredReports.length,
      propertyCoverage: calculateCoveragePercentage(filteredReports, 'propertyCover'),
      contentsCoverage: calculateCoveragePercentage(filteredReports, 'contentsCover'),
      liabilityCoverage: calculateCoveragePercentage(filteredReports, 'liabilityCover'),
      businessInterruption: calculateCoveragePercentage(filteredReports, 'businessInterruption'),
      averageCoverage: 0
    }

    stats.averageCoverage = Math.round(
      (stats.propertyCoverage + stats.contentsCoverage + stats.liabilityCoverage + stats.businessInterruption) / 4
    )

    setInsuranceStats(stats)
  }

  const filterReportsByPeriod = (reports: any[], period: string) => {
    const now = new Date()
    const cutoffDate = new Date()

    switch (period) {
      case "7days":
        cutoffDate.setDate(now.getDate() - 7)
        break
      case "30days":
        cutoffDate.setDate(now.getDate() - 30)
        break
      case "90days":
        cutoffDate.setDate(now.getDate() - 90)
        break
      case "ytd":
        cutoffDate.setFullYear(now.getFullYear(), 0, 1)
        break
      default:
        return reports
    }

    return reports.filter(report => new Date(report.createdAt) >= cutoffDate)
  }

  const calculateCoveragePercentage = (reports: any[], coverageType: string) => {
    if (reports.length === 0) return 0
    
    const reportsWithCoverage = reports.filter(report => {
      const coverage = report[coverageType]
      if (!coverage) return false
      
      try {
        const parsed = JSON.parse(coverage)
        return Object.values(parsed).some((value: any) => value === true)
      } catch {
        return false
      }
    })
    
    return Math.round((reportsWithCoverage.length / reports.length) * 100)
  }

  const getCoverageDistribution = () => {
    const total = insuranceStats.totalReports
    if (total === 0) return []

    return [
      {
        type: "Property Coverage",
        percentage: insuranceStats.propertyCoverage,
        count: Math.round((insuranceStats.propertyCoverage / 100) * total),
        color: "text-blue-400",
        bgColor: "bg-blue-500/20",
        icon: Building
      },
      {
        type: "Contents Coverage",
        percentage: insuranceStats.contentsCoverage,
        count: Math.round((insuranceStats.contentsCoverage / 100) * total),
        color: "text-green-400",
        bgColor: "bg-green-500/20",
        icon: Home
      },
      {
        type: "Liability Coverage",
        percentage: insuranceStats.liabilityCoverage,
        count: Math.round((insuranceStats.liabilityCoverage / 100) * total),
        color: "text-amber-400",
        bgColor: "bg-amber-500/20",
        icon: Shield
      },
      {
        type: "Business Interruption",
        percentage: insuranceStats.businessInterruption,
        count: Math.round((insuranceStats.businessInterruption / 100) * total),
        color: "text-purple-400",
        bgColor: "bg-purple-500/20",
        icon: Clock
      }
    ]
  }

  const getRecentReports = () => {
    return reports
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
  }

  const getInsuranceSummary = () => {
    return {
      totalValue: reports.reduce((sum, report) => sum + (report.totalCost || 0), 0),
      averageClaim: reports.length > 0 ? 
        reports.reduce((sum, report) => sum + (report.totalCost || 0), 0) / reports.length : 0,
      coverageGaps: reports.filter(report => 
        !report.propertyCover && !report.contentsCover && !report.liabilityCover
      ).length
    }
  }

  const summary = getInsuranceSummary()
  const coverageDistribution = getCoverageDistribution()
  const recentReports = getRecentReports()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 
            className="text-2xl font-medium text-white"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            Insurance Coverage Dashboard
          </h2>
          <p className="text-slate-400">Small business insurance coverage analysis and insights</p>
        </div>
        
        <div className="flex gap-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500"
          >
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
            <option value="ytd">Year to date</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Shield className="text-cyan-400" size={24} />
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-cyan-400">{insuranceStats.averageCoverage}%</p>
            <p className="text-slate-400 text-sm font-medium">Average Coverage</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <DollarSign className="text-emerald-400" size={24} />
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-emerald-400">${summary.totalValue.toLocaleString()}</p>
            <p className="text-slate-400 text-sm font-medium">Total Value</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="text-orange-400" size={24} />
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-orange-400">${Math.round(summary.averageClaim).toLocaleString()}</p>
            <p className="text-slate-400 text-sm font-medium">Avg Claim Value</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <AlertTriangle className="text-red-400" size={24} />
            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-red-400">{summary.coverageGaps}</p>
            <p className="text-slate-400 text-sm font-medium">Coverage Gaps</p>
          </div>
        </motion.div>
      </div>

      {/* Coverage Distribution */}
      <div className="grid lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <h3 
            className="text-lg font-medium text-white mb-4"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            Coverage Distribution
          </h3>
          <div className="space-y-4">
            {coverageDistribution.map((coverage, index) => (
              <div key={coverage.type} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${coverage.bgColor}`} />
                  <coverage.icon size={16} className="text-slate-400" />
                  <span className="text-slate-300">{coverage.type}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${coverage.color}`}>{coverage.percentage}%</span>
                  <span className="text-slate-400 text-sm">({coverage.count})</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <h3 
            className="text-lg font-medium text-white mb-4"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            Coverage Analysis
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <span className="text-slate-300">Property Coverage</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-slate-600 rounded-full">
                  <div 
                    className="h-2 bg-blue-500 rounded-full" 
                    style={{ width: `${insuranceStats.propertyCoverage}%` }}
                  />
                </div>
                <span className="text-blue-400 font-bold">{insuranceStats.propertyCoverage}%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <span className="text-slate-300">Contents Coverage</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-slate-600 rounded-full">
                  <div 
                    className="h-2 bg-green-500 rounded-full" 
                    style={{ width: `${insuranceStats.contentsCoverage}%` }}
                  />
                </div>
                <span className="text-green-400 font-bold">{insuranceStats.contentsCoverage}%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <span className="text-slate-300">Liability Coverage</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-slate-600 rounded-full">
                  <div 
                    className="h-2 bg-amber-500 rounded-full" 
                    style={{ width: `${insuranceStats.liabilityCoverage}%` }}
                  />
                </div>
                <span className="text-amber-400 font-bold">{insuranceStats.liabilityCoverage}%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <span className="text-slate-300">Business Interruption</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-2 bg-slate-600 rounded-full">
                  <div 
                    className="h-2 bg-purple-500 rounded-full" 
                    style={{ width: `${insuranceStats.businessInterruption}%` }}
                  />
                </div>
                <span className="text-purple-400 font-bold">{insuranceStats.businessInterruption}%</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Reports with Insurance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
      >
        <h3 
          className="text-lg font-medium text-white mb-4"
          style={{ fontFamily: 'Titillium Web, sans-serif' }}
        >
          Recent Reports with Insurance Coverage
        </h3>
        <div className="space-y-3">
          {recentReports.map((report, index) => {
            const hasProperty = report.propertyCover && JSON.parse(report.propertyCover)
            const hasContents = report.contentsCover && JSON.parse(report.contentsCover)
            const hasLiability = report.liabilityCover && JSON.parse(report.liabilityCover)
            const hasInterruption = report.businessInterruption && JSON.parse(report.businessInterruption)
            
            const coverageCount = [hasProperty, hasContents, hasLiability, hasInterruption].filter(Boolean).length
            
            return (
              <div key={report.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    coverageCount >= 3 ? "bg-emerald-400" :
                    coverageCount >= 2 ? "bg-amber-400" : "bg-red-400"
                  }`} />
                  <div>
                    <p className="font-medium text-white">{report.reportNumber}</p>
                    <p className="text-sm text-slate-400">{report.clientName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-cyan-400">{coverageCount}/4 Coverage Types</p>
                  <p className="text-xs text-slate-400">
                    {coverageCount >= 3 ? "Well Covered" : 
                     coverageCount >= 2 ? "Partially Covered" : "Under Insured"}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* Insurance Recommendations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
      >
        <h3 
          className="text-lg font-medium text-white mb-4"
          style={{ fontFamily: 'Titillium Web, sans-serif' }}
        >
          Insurance Recommendations
        </h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-white mb-3">Essential Coverage</h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                Property insurance for business buildings
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                Contents insurance for equipment and stock
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                Public liability insurance
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
                Business interruption coverage
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-3">Additional Considerations</h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                Flood cover for weather events
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                Machinery breakdown protection
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                Glass and portable items coverage
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-blue-400 flex-shrink-0" />
                Theft and money protection
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
