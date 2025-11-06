"use client"

import { motion } from "framer-motion"
import { FileText, Upload, FileUp, Plug, Sparkles } from "lucide-react"
import { useState } from "react"

/**
 * Input method type definitions
 */
export type InputMethod = 'text' | 'pdf' | 'word' | 'api'

interface InputMethodCard {
  id: InputMethod
  title: string
  description: string
  icon: typeof FileText
  badge?: string
  gradient: string
  iconColor: string
}

interface QuickStartPanelProps {
  onMethodSelect?: (method: InputMethod) => void
  className?: string
}

/**
 * QuickStartPanel Component
 *
 * Displays 4 input method cards for initiating the orchestrator workflow.
 * Supports responsive layout (2x2 on mobile, 1x4 on desktop).
 * Implements smooth animations with Framer Motion.
 *
 * @component
 * @example
 * ```tsx
 * <QuickStartPanel onMethodSelect={(method) => console.log(method)} />
 * ```
 */
export default function QuickStartPanel({
  onMethodSelect,
  className = ""
}: QuickStartPanelProps) {
  const [hoveredCard, setHoveredCard] = useState<InputMethod | null>(null)

  const inputMethods: InputMethodCard[] = [
    {
      id: 'text',
      title: 'Text Input',
      description: 'Type or paste your damage assessment details',
      icon: FileText,
      badge: 'Most Common',
      gradient: 'from-blue-500 to-blue-600',
      iconColor: 'text-blue-500'
    },
    {
      id: 'pdf',
      title: 'PDF Upload',
      description: 'Upload existing damage reports in PDF format',
      icon: Upload,
      gradient: 'from-purple-500 to-purple-600',
      iconColor: 'text-purple-500'
    },
    {
      id: 'word',
      title: 'Word Upload',
      description: 'Import Microsoft Word documents (.docx)',
      icon: FileUp,
      gradient: 'from-cyan-500 to-cyan-600',
      iconColor: 'text-cyan-500'
    },
    {
      id: 'api',
      title: 'Field App API',
      description: 'Connect your field data collection app',
      icon: Plug,
      badge: 'Coming Soon',
      gradient: 'from-emerald-500 to-emerald-600',
      iconColor: 'text-emerald-500'
    }
  ]

  const handleCardClick = (method: InputMethod) => {
    if (onMethodSelect) {
      onMethodSelect(method)
    }
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Start New Assessment
          </h2>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Choose your preferred input method to begin the orchestrator workflow
        </p>
      </div>

      {/* Input Method Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {inputMethods.map((method, index) => {
          const Icon = method.icon
          const isHovered = hoveredCard === method.id

          return (
            <motion.button
              key={method.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: index * 0.1,
                ease: "easeOut"
              }}
              whileHover={{
                scale: 1.02,
                y: -4
              }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleCardClick(method.id)}
              onHoverStart={() => setHoveredCard(method.id)}
              onHoverEnd={() => setHoveredCard(null)}
              disabled={method.badge === 'Coming Soon'}
              className={`
                relative w-full h-[200px] rounded-2xl p-6
                bg-white dark:bg-slate-800/50
                border-2 border-slate-200 dark:border-slate-700/50
                hover:border-slate-300 dark:hover:border-slate-600
                hover:shadow-xl
                transition-all duration-300
                text-left
                disabled:opacity-60 disabled:cursor-not-allowed
                group
              `}
              aria-label={`Select ${method.title} input method`}
            >
              {/* Badge */}
              {method.badge && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className={`
                    absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium
                    ${method.badge === 'Most Common'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400'
                    }
                  `}
                >
                  {method.badge}
                </motion.div>
              )}

              {/* Icon Container */}
              <motion.div
                animate={{
                  scale: isHovered ? 1.1 : 1,
                  rotate: isHovered ? 5 : 0
                }}
                transition={{ duration: 0.3 }}
                className={`
                  w-12 h-12 rounded-xl mb-4
                  bg-gradient-to-br ${method.gradient}
                  flex items-center justify-center
                  shadow-lg
                  group-disabled:grayscale
                `}
              >
                <Icon className="w-6 h-6 text-white" strokeWidth={2} />
              </motion.div>

              {/* Content */}
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {method.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                  {method.description}
                </p>
              </div>

              {/* Hover Indicator */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{
                  opacity: isHovered ? 1 : 0,
                  y: isHovered ? 0 : 10
                }}
                className="absolute bottom-4 left-6 right-6 flex items-center justify-center"
              >
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {method.badge === 'Coming Soon' ? 'Not Available Yet' : 'Click to Start →'}
                </span>
              </motion.div>

              {/* Gradient Overlay on Hover */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: isHovered ? 0.05 : 0 }}
                className={`
                  absolute inset-0 rounded-2xl
                  bg-gradient-to-br ${method.gradient}
                  pointer-events-none
                `}
              />
            </motion.button>
          )
        })}
      </div>

      {/* Help Text */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-6 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl"
      >
        <p className="text-sm text-blue-900 dark:text-blue-300">
          <span className="font-semibold">Tip:</span> All methods support IICRC-compliant reporting.
          Choose the one that best fits your current workflow.
        </p>
      </motion.div>
    </div>
  )
}
