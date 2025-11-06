"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import toast from "react-hot-toast"
import { QuickStartPanel } from "@/components/orchestrator"
import type { InputMethod } from "@/components/orchestrator/types"

/**
 * Start Assessment Page
 *
 * This page provides the entry point for creating new damage assessments
 * using the orchestrator workflow. Users can select from multiple input methods:
 * - Text Input: Manual entry of assessment details
 * - PDF Upload: Import existing PDF reports
 * - Word Upload: Import Microsoft Word documents
 * - Field App API: Connect field data collection apps
 *
 * All methods support IICRC-compliant reporting standards.
 * Uses Australian English spelling throughout.
 */
export default function StartAssessmentPage() {
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)

  /**
   * Handle input method selection
   * Routes to appropriate workflow based on selected method
   */
  const handleMethodSelect = async (method: InputMethod) => {
    setIsProcessing(true)

    try {
      // Show loading toast
      toast.loading(`Initialising ${method} workflow...`, { id: 'workflow-init' })

      // Simulate workflow initialization
      await new Promise(resolve => setTimeout(resolve, 800))

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
          setIsProcessing(false)
          break

        default:
          toast.error('Unknown input method', { id: 'workflow-init' })
          setIsProcessing(false)
      }
    } catch (error) {
      console.error('Error initialising workflow:', error)
      toast.error('Failed to start workflow. Please try again.', { id: 'workflow-init' })
      setIsProcessing(false)
    }
  }

  /**
   * Navigate back to dashboard
   */
  const handleBack = () => {
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 rounded-2xl p-8 mb-8 relative overflow-hidden"
      >
        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-400/20 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative z-10">
          {/* Back Button */}
          <motion.button
            onClick={handleBack}
            disabled={isProcessing}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="mb-6 px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg font-medium hover:bg-white/30 transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </motion.button>

          {/* Title */}
          <div className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white text-xs font-medium mb-4">
            Orchestrator Workflow
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
            Start New Assessment
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl">
            Select your preferred input method to begin creating an IICRC-compliant damage assessment report.
          </p>
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl p-8"
      >
        <QuickStartPanel onMethodSelect={handleMethodSelect} />
      </motion.div>

      {/* Additional Information Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="mt-8 grid md:grid-cols-3 gap-6"
      >
        {/* Feature 1 */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            IICRC Compliant
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            All reports generated meet IICRC S500 standards for water damage restoration documentation.
          </p>
        </div>

        {/* Feature 2 */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            AI-Powered Processing
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Intelligent orchestrator automatically processes and structures your assessment data.
          </p>
        </div>

        {/* Feature 3 */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl p-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Time-Saving Workflow
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Complete comprehensive assessments in minutes, not hours, with guided workflows.
          </p>
        </div>
      </motion.div>

      {/* Processing Overlay */}
      {isProcessing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Initialising Workflow
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Please wait while we prepare your assessment workflow...
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}
