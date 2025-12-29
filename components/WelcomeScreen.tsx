"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, ArrowRight, CheckCircle, Zap, Building2, KeyRound, DollarSign, FileText } from "lucide-react"
// @ts-ignore - canvas-confetti types
import confetti from "canvas-confetti"

interface WelcomeScreenProps {
  onContinue: () => void
}

export default function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    // Trigger confetti on mount
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.5 }
    })
  }, [])

  const slides = [
    {
      icon: Sparkles,
      title: "Welcome to Restore Assist! 🎉",
      description: "Your professional forensic restoration reporting platform. Let's get you set up in just 4 quick steps.",
      color: "from-cyan-500 to-blue-500"
    },
    {
      icon: Building2,
      title: "Step 1: Business Profile",
      description: "Add your business details, logo, and contact information. This will appear on all your reports.",
      color: "from-blue-500 to-purple-500"
    },
    {
      icon: KeyRound,
      title: "Step 2: AI Integration",
      description: "Connect your AI API key (Anthropic, OpenAI, or Gemini) to enable intelligent report generation.",
      color: "from-purple-500 to-pink-500"
    },
    {
      icon: DollarSign,
      title: "Step 3: Pricing Setup",
      description: "Configure your company rates for labour, equipment, and services for accurate cost estimates.",
      color: "from-pink-500 to-orange-500"
    },
    {
      icon: FileText,
      title: "Step 4: Create Your First Report",
      description: "Generate your first professional forensic assessment report with AI-powered insights.",
      color: "from-orange-500 to-cyan-500"
    }
  ]

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1)
    } else {
      onContinue()
    }
  }

  const handleSkip = () => {
    onContinue()
  }

  const currentSlideData = slides[currentSlide] || slides[0]
  const IconComponent = currentSlideData.icon

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
    >
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20 }}
        className="relative w-full max-w-2xl mx-4"
      >
        {/* Progress Dots */}
        <div className="flex justify-center gap-2 mb-8">
          {slides.map((_, index) => (
            <motion.div
              key={index}
              initial={{ scale: 0.8 }}
              animate={{ 
                scale: index === currentSlide ? 1.2 : 0.8,
                opacity: index <= currentSlide ? 1 : 0.5
              }}
              className={`h-2 rounded-full transition-all ${
                index === currentSlide 
                  ? 'w-8 bg-cyan-400' 
                  : index < currentSlide 
                  ? 'w-2 bg-green-400' 
                  : 'w-2 bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Slide Content */}
        <div className="relative bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border border-cyan-500/20 rounded-3xl p-12 shadow-2xl min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className={`inline-flex p-4 rounded-2xl bg-gradient-to-br ${currentSlideData.color} mb-6`}
              >
                <IconComponent className="w-12 h-12 text-white" />
              </motion.div>

              <h2 className="text-3xl font-bold text-white mb-4">
                {currentSlideData.title}
              </h2>

              <p className="text-lg text-slate-300 leading-relaxed max-w-md mx-auto mb-8">
                {currentSlideData.description}
              </p>

              {/* Step List for Step 1 */}
              {currentSlide === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="grid grid-cols-2 gap-4 mt-8 max-w-md mx-auto"
                >
                  {[
                    { icon: Building2, text: "Business Details" },
                    { icon: KeyRound, text: "AI Integration" },
                    { icon: DollarSign, text: "Pricing Setup" },
                    { icon: FileText, text: "First Report" }
                  ].map((item, idx) => {
                    const ItemIcon = item.icon
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 + idx * 0.1 }}
                        className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50"
                      >
                        <ItemIcon className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm text-slate-300">{item.text}</span>
                      </motion.div>
                    )
                  })}
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="flex items-center justify-between mt-12 pt-8 border-t border-slate-700/50">
            <button
              onClick={handleSkip}
              className="px-6 py-2.5 text-slate-400 hover:text-white transition-colors text-sm font-medium"
            >
              Skip Tour
            </button>

            <motion.button
              onClick={handleNext}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl font-semibold text-white hover:shadow-lg hover:shadow-cyan-500/50 transition-all flex items-center gap-2"
            >
              {currentSlide < slides.length - 1 ? (
                <>
                  Next
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Get Started
                  <Zap className="w-4 h-4" />
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
