"use client"

import { motion } from "framer-motion"
import { Play, Clock, CheckCircle } from "lucide-react"
import SectionWrapper from "./SectionWrapper"
import SectionHeader from "./SectionHeader"

export default function VideoDemoSection() {
  return (
    <SectionWrapper id="video-demo" background="dark">
      <SectionHeader 
        title="See How It Works In Under 60 Seconds"
        subtitle="Watch a complete demonstration of generating professional damage reports with AI"
      />
      
      <div className="max-w-4xl mx-auto">
        {/* Video Placeholder */}
        <motion.div 
          className="relative bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden aspect-video mb-8"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          {/* Video Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-cyan-500/10 to-blue-500/10" />
          </div>
          
          {/* Play Button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.button
              className="w-20 h-20 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/50"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <Play size={32} className="text-white ml-1" />
            </motion.button>
          </div>
          
          {/* Video Info Overlay */}
          <div className="absolute bottom-6 left-6 right-6">
            <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl p-4">
              <h3 className="text-lg font-medium text-white mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                Learn how Restore Assist generates IICRC-compliant reports with accurate cost estimates in seconds
              </h3>
              <div className="flex items-center gap-4 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <Clock size={16} />
                  <span>60 seconds</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-400" />
                  <span>Full demonstration</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Demo Features */}
        <div className="grid md:grid-cols-3 gap-6">
          <motion.div 
            className="text-center p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            viewport={{ once: true }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Play size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
              Quick Setup
            </h3>
            <p className="text-slate-400 text-sm">
              See how easy it is to get started with your first report
            </p>
          </motion.div>

          <motion.div 
            className="text-center p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            viewport={{ once: true }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
              AI Generation
            </h3>
            <p className="text-slate-400 text-sm">
              Watch AI create professional reports in real-time
            </p>
          </motion.div>

          <motion.div 
            className="text-center p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
          >
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock size={24} className="text-white" />
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
              Fast Results
            </h3>
            <p className="text-slate-400 text-sm">
              Complete reports generated in under 15 seconds
            </p>
          </motion.div>
        </div>
      </div>
    </SectionWrapper>
  )
}
