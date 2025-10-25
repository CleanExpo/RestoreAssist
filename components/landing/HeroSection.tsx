"use client"

import { motion } from "framer-motion"
import { CheckCircle, Clock, Gift, Shield, Zap } from "lucide-react"
import Link from "next/link"

export default function HeroSection() {
  return (
    <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden min-h-screen flex items-center">
      <div className="max-w-7xl mx-auto w-full">
        {/* Advanced Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Gradient Orbs */}
          <motion.div 
            className="absolute top-20 left-10 w-96 h-96 rounded-full opacity-20"
            style={{
              background: "radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, rgba(6, 182, 212, 0.1) 50%, transparent 100%)"
            }}
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.2, 0.4, 0.2],
              x: [0, 30, 0],
              y: [0, -20, 0]
            }}
            transition={{ 
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          
          <motion.div
            className="absolute bottom-0 right-10 w-[500px] h-[500px] rounded-full opacity-15"
            style={{
              background: "radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, rgba(59, 130, 246, 0.2) 50%, transparent 100%)"
            }}
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.1, 0.3, 0.1],
              x: [0, -40, 0],
              y: [0, 30, 0]
            }}
            transition={{ 
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2
            }}
          />
          
          <motion.div
            className="absolute top-1/2 left-1/2 w-80 h-80 rounded-full opacity-10"
            style={{
              background: "radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, rgba(59, 130, 246, 0.1) 50%, transparent 100%)"
            }}
            animate={{ 
              x: [0, 60, 0],
              y: [0, -40, 0],
              rotate: [0, 180, 360],
              scale: [1, 1.3, 1]
            }}
            transition={{ 
              duration: 12,
              repeat: Infinity,
              ease: "linear"
            }}
          />

          {/* Enhanced Floating Geometric Shapes - More Visible */}
          <motion.div
            className="absolute top-32 right-32 w-8 h-8 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full opacity-80 shadow-lg shadow-cyan-400/30"
            animate={{
              y: [0, -30, 0],
              x: [0, 15, 0],
              scale: [1, 1.3, 1],
              rotate: [0, 180, 360]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          
          <motion.div
            className="absolute bottom-32 left-32 w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rotate-45 opacity-70 shadow-lg shadow-purple-500/30"
            animate={{
              y: [0, 20, 0],
              x: [0, -12, 0],
              rotate: [45, 225, 405],
              scale: [1, 1.2, 1]
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1
            }}
          />

          <motion.div
            className="absolute top-1/3 left-1/4 w-6 h-6 bg-gradient-to-r from-cyan-400 to-teal-500 rounded-full opacity-80 shadow-lg shadow-teal-400/30"
            animate={{
              y: [0, -35, 0],
              x: [0, 20, 0],
              scale: [1, 1.5, 1]
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2
            }}
          />

          {/* Additional Large Geometric Shapes */}
          <motion.div
            className="absolute top-20 right-1/4 w-16 h-16 bg-gradient-to-r from-pink-500 to-rose-500 rounded-lg opacity-60 shadow-lg shadow-pink-500/30"
            animate={{
              y: [0, -25, 0],
              x: [0, 20, 0],
              rotate: [0, 90, 180, 270, 360],
              scale: [1, 1.2, 1]
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5
            }}
          />

          <motion.div
            className="absolute bottom-20 left-1/3 w-20 h-20 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full opacity-50 shadow-lg shadow-emerald-500/30"
            animate={{
              y: [0, 30, 0],
              x: [0, -25, 0],
              scale: [1, 1.4, 1],
              rotate: [0, -180, -360]
            }}
            transition={{
              duration: 7,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1.5
            }}
          />

          <motion.div
            className="absolute top-1/2 right-10 w-14 h-14 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg opacity-60 shadow-lg shadow-orange-500/30"
            animate={{
              y: [0, -20, 0],
              x: [0, 15, 0],
              rotate: [0, 45, 90, 135, 180],
              scale: [1, 1.3, 1]
            }}
            transition={{
              duration: 9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 3
            }}
          />

          {/* Floating Particles */}
          {[...Array(8)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-3 h-3 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full opacity-70 shadow-lg shadow-cyan-400/40"
              style={{
                left: `${15 + i * 12}%`,
                top: `${20 + i * 8}%`
              }}
              animate={{
                y: [0, -40, 0],
                x: [0, Math.sin(i) * 20, 0],
                scale: [1, 1.5, 1],
                opacity: [0.3, 0.8, 0.3]
              }}
              transition={{
                duration: 4 + i * 0.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.3
              }}
            />
          ))}
        </div>

        <div className="relative z-10 text-center">
          {/* Clean Badge */}
          <motion.div 
            className="inline-block mb-8 px-6 py-3 bg-slate-800/50 border border-slate-700/50 rounded-full backdrop-blur-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <span className="text-sm text-cyan-400 font-medium">✨ AI-Powered Damage Assessment</span>
          </motion.div>

          {/* Clean Main Headline */}
          <motion.h1 
            className="text-5xl md:text-6xl font-medium mb-8 leading-tight text-balance"
            style={{ 
              fontFamily: 'Titillium Web, sans-serif',
              fontWeight: 500
            }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <span className="block text-white">Transform Your Restoration</span>
            <motion.span 
              className="block bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent"
              animate={{ 
                backgroundPosition: ["0%", "100%", "0%"]
              }}
              transition={{ 
                duration: 4,
                repeat: Infinity,
                ease: "linear"
              }}
              style={{ backgroundSize: "200% 100%" }}
            >
              Reports in Seconds
            </motion.span>
          </motion.h1>

          {/* Clean Subheadline */}
          <motion.p 
            className="text-xl text-slate-300 mb-12 max-w-4xl mx-auto text-balance leading-relaxed font-light"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            Generate professional, compliant damage assessments in seconds with AI-powered precision. 
            <span className="text-cyan-400 font-medium"> Built for Australian restoration professionals.</span>
          </motion.p>

          {/* Clean CTA Buttons */}
          <motion.div 
            className="flex flex-col sm:flex-row gap-6 justify-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link
                href="/signup"
                className="px-10 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full font-medium text-lg hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300"
                style={{ fontFamily: 'Titillium Web, sans-serif' }}
              >
                Start Free Trial - 3 Reports
              </Link>
            </motion.div>
          </motion.div>

          {/* Clean Stats */}
          <motion.div 
            className="flex flex-col sm:flex-row items-center justify-center gap-8 text-lg text-slate-400 mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            <div className="flex items-center gap-3">
              <Zap size={20} className="text-cyan-400" />
              <span className="font-medium">10-15s Generation</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-emerald-400" />
              <span className="font-medium">100% NCC Compliant</span>
            </div>
            <div className="flex items-center gap-3">
              <Shield size={20} className="text-blue-400" />
              <span className="font-medium">8 States Covered</span>
            </div>
          </motion.div>

          {/* Clean Sample Report Preview */}
          <motion.div 
            className="mt-16 p-8 bg-slate-800/30 border border-slate-700/50 rounded-2xl backdrop-blur-sm"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1 }}
          >
            <h3 className="text-2xl font-medium mb-6 text-center" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
              Professional damage assessment in seconds
            </h3>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-slate-400 text-sm mb-2">Property</p>
                <p className="text-white font-medium">123 Main St, Sydney NSW</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Damage Type</p>
                <p className="text-white font-medium">Water Damage</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-2">Estimated Cost</p>
                <p className="text-cyan-400 font-bold text-xl">$8,750 AUD</p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full">NCC 2022 Compliant</span>
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full">NSW Building Code Verified</span>
                <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full">Insurance Ready Format</span>
              </div>
            </div>
          </motion.div>

          {/* Key Benefits Section */}
          <motion.div 
            className="mt-20"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.3 }}
          >
            <h2 className="text-3xl font-medium mb-12 text-center" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
              Why Choose Restore Assist?
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              {/* 3 FREE Reports */}
              <motion.div 
                className="p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl backdrop-blur-sm hover:border-cyan-500/30 transition-all duration-300"
                whileHover={{ y: -5 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.4 }}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg flex items-center justify-center">
                    <Gift size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-white" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                      3 FREE Reports
                    </h3>
                    <p className="text-cyan-400 text-sm font-medium">
                      No credit card required
                    </p>
                  </div>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Experience the power of AI-driven damage assessment with your complimentary trial reports
                </p>
              </motion.div>

              {/* Australian First */}
              <motion.div 
                className="p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl backdrop-blur-sm hover:border-emerald-500/30 transition-all duration-300"
                whileHover={{ y: -5 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.5 }}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-lg flex items-center justify-center">
                    <Shield size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-white" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                      Australian First
                    </h3>
                    <p className="text-emerald-400 text-sm font-medium">
                      Uniformed Reporting System
                    </p>
                  </div>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Standardised, compliant reports across all Australian states and damage types
                </p>
              </motion.div>

              {/* Massive Savings */}
              <motion.div 
                className="p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl backdrop-blur-sm hover:border-orange-500/30 transition-all duration-300"
                whileHover={{ y: -5 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.6 }}
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                    <Clock size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-medium text-white" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                      Massive Savings
                    </h3>
                    <p className="text-orange-400 text-sm font-medium">
                      Up to 95% time reduction
                    </p>
                  </div>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Slash report writing time from hours to seconds while maintaining professional quality
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
