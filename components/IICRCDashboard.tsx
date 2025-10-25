"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Droplets,
  Wind,
  Thermometer,
  Shield,
  FileText,
  BarChart3,
  Activity
} from "lucide-react"

interface IICRCDashboardProps {
  reports: any[]
}

export default function IICRCDashboard({ reports }: IICRCDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState("30days")
  const [complianceStats, setComplianceStats] = useState({
    totalReports: 0,
    category1Reports: 0,
    category2Reports: 0,
    category3Reports: 0,
    averageDryingTime: 0,
    complianceRate: 0
  })

  useEffect(() => {
    calculateComplianceStats()
  }, [reports, selectedPeriod])

  const calculateComplianceStats = () => {
    const filteredReports = filterReportsByPeriod(reports, selectedPeriod)
    
    const stats = {
      totalReports: filteredReports.length,
      category1Reports: filteredReports.filter(r => r.waterCategory === "Category 1").length,
      category2Reports: filteredReports.filter(r => r.waterCategory === "Category 2").length,
      category3Reports: filteredReports.filter(r => r.waterCategory === "Category 3").length,
      averageDryingTime: calculateAverageDryingTime(filteredReports),
      complianceRate: calculateComplianceRate(filteredReports)
    }

    setComplianceStats(stats)
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

  const calculateAverageDryingTime = (reports: any[]) => {
    const reportsWithDryingTime = reports.filter(r => r.estimatedDryingTime)
    if (reportsWithDryingTime.length === 0) return 0
    
    const totalTime = reportsWithDryingTime.reduce((sum, report) => sum + (report.estimatedDryingTime || 0), 0)
    return Math.round(totalTime / reportsWithDryingTime.length)
  }

  const calculateComplianceRate = (reports: any[]) => {
    if (reports.length === 0) return 0
    
    const compliantReports = reports.filter(report => 
      report.waterCategory && 
      report.waterClass && 
      report.safetyHazards && 
      report.dryingPlan
    )
    
    return Math.round((compliantReports.length / reports.length) * 100)
  }

  const getCategoryDistribution = () => {
    const total = complianceStats.totalReports
    if (total === 0) return []

    return [
      {
        category: "Category 1",
        count: complianceStats.category1Reports,
        percentage: Math.round((complianceStats.category1Reports / total) * 100),
        color: "text-emerald-400",
        bgColor: "bg-emerald-500/20"
      },
      {
        category: "Category 2", 
        count: complianceStats.category2Reports,
        percentage: Math.round((complianceStats.category2Reports / total) * 100),
        color: "text-amber-400",
        bgColor: "bg-amber-500/20"
      },
      {
        category: "Category 3",
        count: complianceStats.category3Reports,
        percentage: Math.round((complianceStats.category3Reports / total) * 100),
        color: "text-red-400",
        bgColor: "bg-red-500/20"
      }
    ]
  }

  const getClassDistribution = () => {
    const classCounts = reports.reduce((acc, report) => {
      const waterClass = report.waterClass || "Unknown"
      acc[waterClass] = (acc[waterClass] || 0) + 1
      return acc
    }, {})

    return Object.entries(classCounts).map(([waterClass, count]) => ({
      class: waterClass,
      count: count as number,
      percentage: Math.round(((count as number) / complianceStats.totalReports) * 100)
    }))
  }

  const recentReports = reports
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 
            className="text-2xl font-medium text-white"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            IICRC S500 Compliance Dashboard
          </h2>
          <p className="text-slate-400">Professional water damage restoration standards tracking</p>
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
            <FileText className="text-cyan-400" size={24} />
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-cyan-400">{complianceStats.totalReports}</p>
            <p className="text-slate-400 text-sm font-medium">Total Reports</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <CheckCircle className="text-emerald-400" size={24} />
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-emerald-400">{complianceStats.complianceRate}%</p>
            <p className="text-slate-400 text-sm font-medium">Compliance Rate</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Clock className="text-orange-400" size={24} />
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-orange-400">{complianceStats.averageDryingTime}h</p>
            <p className="text-slate-400 text-sm font-medium">Avg Drying Time</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Shield className="text-blue-400" size={24} />
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold text-blue-400">100%</p>
            <p className="text-slate-400 text-sm font-medium">Safety Compliance</p>
          </div>
        </motion.div>
      </div>

      {/* Charts and Analysis */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Water Category Distribution */}
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
            Water Category Distribution
          </h3>
          <div className="space-y-3">
            {getCategoryDistribution().map((item, index) => (
              <div key={item.category} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${item.bgColor}`} />
                  <span className="text-slate-300">{item.category}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${item.color}`}>{item.count}</span>
                  <span className="text-slate-400 text-sm">({item.percentage}%)</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Water Class Distribution */}
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
            Water Class Distribution
          </h3>
          <div className="space-y-3">
            {getClassDistribution().map((item, index) => (
              <div key={item.class} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-cyan-500/20" />
                  <span className="text-slate-300">{item.class}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-cyan-400">{item.count}</span>
                  <span className="text-slate-400 text-sm">({item.percentage}%)</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Recent Reports */}
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
          Recent IICRC S500 Reports
        </h3>
        <div className="space-y-3">
          {recentReports.map((report, index) => (
            <div key={report.id} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${
                  report.waterCategory === "Category 1" ? "bg-emerald-400" :
                  report.waterCategory === "Category 2" ? "bg-amber-400" : "bg-red-400"
                }`} />
                <div>
                  <p className="font-medium text-white">{report.reportNumber}</p>
                  <p className="text-sm text-slate-400">{report.clientName}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-cyan-400">{report.waterCategory}</p>
                <p className="text-xs text-slate-400">{report.waterClass}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Compliance Checklist */}
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
          IICRC S500 Compliance Checklist
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-white mb-3">Assessment Requirements</h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Water category determination
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Water class classification
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Safety hazard identification
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Source identification and control
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-white mb-3">Documentation Requirements</h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Drying plan development
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Equipment sizing calculations
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Psychrometric monitoring
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-400" />
                Post-remediation verification
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
