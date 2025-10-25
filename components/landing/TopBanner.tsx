"use client"

import { motion } from "framer-motion"
import { Gift, Shield, Clock } from "lucide-react"

export default function TopBanner() {
  return (
    <motion.section 
      className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700/50 py-4 relative mt-32"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          {/* 3 FREE Reports */}
          <motion.div 
            className="flex items-center justify-center gap-4"
            whileHover={{ scale: 1.05 }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center">
              <Gift size={24} className="text-white" />
            </div>
            <div className="text-left">
              <h3 className="text-2xl font-bold text-white" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                3 FREE Reports
              </h3>
              <p className="text-slate-300 text-sm">
                No credit card required
              </p>
              <p className="text-slate-400 text-xs">
                Experience the power of AI-driven damage assessment with your complimentary trial reports
              </p>
            </div>
          </motion.div>

          {/* Australian First */}
          <motion.div 
            className="flex items-center justify-center gap-4"
            whileHover={{ scale: 1.05 }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center">
              <Shield size={24} className="text-white" />
            </div>
            <div className="text-left">
              <h3 className="text-2xl font-bold text-white" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                Australian First
              </h3>
              <p className="text-slate-300 text-sm">
                Uniformed Reporting System
              </p>
              <p className="text-slate-400 text-xs">
                Standardised, compliant reports across all Australian states and damage types
              </p>
            </div>
          </motion.div>

          {/* Massive Savings */}
          <motion.div 
            className="flex items-center justify-center gap-4"
            whileHover={{ scale: 1.05 }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center">
              <Clock size={24} className="text-white" />
            </div>
            <div className="text-left">
              <h3 className="text-2xl font-bold text-white" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                Massive Savings
              </h3>
              <p className="text-slate-300 text-sm">
                Up to 95% time reduction
              </p>
              <p className="text-slate-400 text-xs">
                Slash report writing time from hours to seconds while maintaining professional quality
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  )
}
