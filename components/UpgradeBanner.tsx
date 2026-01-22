"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Crown, X, Zap, FileText, Upload, Settings, Sparkles, ArrowRight, Check } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

interface UpgradeBannerProps {
  onDismiss?: () => void
  variant?: "inline" | "floating"
}

export default function UpgradeBanner({ onDismiss, variant = "inline" }: UpgradeBannerProps) {
  const router = useRouter()
  const [isDismissed, setIsDismissed] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)

  useEffect(() => {
    // Check subscription status
    const checkSubscription = async () => {
      try {
        const response = await fetch("/api/user/profile")
        if (response.ok) {
          const data = await response.json()
          setSubscriptionStatus(data.profile?.subscriptionStatus)
        }
      } catch (error) {
        console.error("Error fetching subscription status:", error)
      }
    }
    checkSubscription()
  }, [])

  // Only show for trial/free users
  if (subscriptionStatus !== "TRIAL" && subscriptionStatus !== null) {
    return null
  }

  if (isDismissed) {
    return null
  }

  const handleDismiss = () => {
    setIsDismissed(true)
    if (onDismiss) {
      onDismiss()
    }
  }

  const upgradeFeatures = [
    {
      icon: Zap,
      title: "Unlimited Quick Fill",
      description: "AI-powered form auto-fill for all your reports"
    },
    {
      icon: FileText,
      title: "Enhanced & Optimized Reports",
      description: "Access to all report types with advanced features"
    },
    {
      icon: Upload,
      title: "PDF Upload & Processing",
      description: "Upload and extract data from PDF documents"
    },
    {
      icon: Settings,
      title: "Full Profile & Pricing Control",
      description: "Edit business profile and configure pricing rates"
    },
    {
      icon: Sparkles,
      title: "Premium API Integrations",
      description: "Connect with Claude, GPT, and other premium AI models"
    }
  ]

  if (variant === "floating") {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/10 border-b border-amber-500/30 backdrop-blur-sm"
        >
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="p-2 bg-gradient-to-br from-amber-500/20 to-yellow-500/20 rounded-lg border border-amber-500/30">
                  <Crown className="w-5 h-5 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-300">
                    Unlock Premium Features
                  </p>
                  <p className="text-xs text-amber-200/80">
                    Upgrade to access Quick Fill, Enhanced Reports, PDF uploads, and more
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push("/dashboard/pricing")}
                  className="px-4 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-lg font-medium text-white hover:shadow-lg hover:shadow-amber-500/50 transition-all text-sm flex items-center gap-2"
                >
                  Upgrade Now
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={handleDismiss}
                  className="p-1.5 hover:bg-amber-500/20 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-amber-300" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-xl border p-6",
        "border-amber-500/30 dark:border-amber-500/30",
        "bg-gradient-to-br from-amber-50 via-yellow-50/50 to-amber-50",
        "dark:from-amber-500/10 dark:via-yellow-500/5 dark:to-amber-500/10"
      )}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10 dark:opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(251, 191, 36, 0.3) 1px, transparent 0)`,
          backgroundSize: '24px 24px'
        }} />
      </div>

      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-4 flex-1">
            <div className={cn(
              "p-3 rounded-xl border flex-shrink-0",
              "bg-gradient-to-br from-amber-100 to-yellow-100 border-amber-300",
              "dark:from-amber-500/20 dark:to-yellow-500/20 dark:border-amber-500/30"
            )}>
              <Crown className={cn("w-6 h-6 text-amber-600 dark:text-amber-400")} />
            </div>
            <div className="flex-1">
              <h3 className={cn(
                "text-xl font-bold mb-2",
                "bg-gradient-to-r from-amber-600 to-yellow-600 bg-clip-text text-transparent",
                "dark:from-amber-300 dark:to-yellow-300"
              )}>
                Unlock Premium Features
              </h3>
              <p className={cn(
                "text-sm",
                "text-amber-800/80 dark:text-amber-200/80"
              )}>
                Upgrade to get access to powerful features that will transform your workflow
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className={cn(
              "p-2 rounded-lg transition-colors flex-shrink-0",
              "hover:bg-amber-100 dark:hover:bg-amber-500/20"
            )}
          >
            <X className={cn("w-5 h-5 text-amber-700 dark:text-amber-300")} />
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {upgradeFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "flex items-start gap-3 p-4 rounded-lg border transition-colors",
                "bg-white/50 border-amber-200/50 hover:border-amber-400/50",
                "dark:bg-slate-800/30 dark:border-slate-700/50 dark:hover:border-amber-500/30"
              )}
            >
              <div className={cn(
                "p-2 rounded-lg border flex-shrink-0",
                "bg-amber-50 border-amber-200",
                "dark:bg-amber-500/10 dark:border-amber-500/20"
              )}>
                <feature.icon className={cn("w-5 h-5 text-amber-600 dark:text-amber-400")} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={cn(
                  "font-semibold mb-1 text-sm",
                  "text-neutral-900 dark:text-white"
                )}>
                  {feature.title}
                </h4>
                <p className={cn(
                  "text-xs",
                  "text-neutral-600 dark:text-slate-400"
                )}>
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* CTA */}
        <div className={cn(
          "flex items-center justify-between gap-4 pt-4 border-t",
          "border-amber-300/50 dark:border-amber-500/20"
        )}>
          <div>
            <p className={cn(
              "text-sm font-medium mb-1",
              "text-amber-800 dark:text-amber-200"
            )}>
              Ready to upgrade?
            </p>
            <p className={cn(
              "text-xs",
              "text-amber-700/80 dark:text-amber-200/70"
            )}>
              Choose a plan that fits your needs and unlock all premium features
            </p>
          </div>
          <button
            onClick={() => router.push("/dashboard/pricing")}
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-lg font-semibold text-white hover:shadow-lg hover:shadow-amber-500/50 transition-all flex items-center gap-2 whitespace-nowrap"
          >
            View Plans
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
