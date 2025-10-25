"use client"

import { motion } from "framer-motion"
import { CheckCircle, Gift, Shield, Clock } from "lucide-react"
import Link from "next/link"
import SectionWrapper from "./SectionWrapper"
import SectionHeader from "./SectionHeader"

const benefits = [
  {
    icon: Gift,
    title: "3 Free Trial Reports",
    description: "No Card Required"
  },
  {
    icon: Shield,
    title: "24/7 Support",
    description: "Always here to help"
  },
  {
    icon: Clock,
    title: "Instant Setup",
    description: "Start in minutes"
  }
]

export default function FinalCTASection() {
  return (
    <SectionWrapper id="final-cta" background="gradient">
      <SectionHeader 
        title="Ready to Transform Your Damage Assessments?"
        subtitle="Join Australian restoration professionals using AI to generate professional, compliant reports in seconds."
      />
      
      <div className="max-w-4xl mx-auto text-center">
        {/* CTA Buttons */}
        <motion.div 
          className="flex flex-col sm:flex-row gap-6 justify-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
        >
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              href="/signup"
              className="px-6 py-4 bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 rounded-md font-medium text-xl hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 transform hover:scale-105"
              style={{ fontFamily: 'Titillium Web, sans-serif' }}
            >
              Start Free Trial
            </Link>
          </motion.div>
        </motion.div>

        {/* Key Benefits */}
        <motion.div 
          className="grid md:grid-cols-3 gap-8 mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
        >
          {benefits.map((benefit, index) => (
            <motion.div 
              key={index}
              className="text-center p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl"
              whileHover={{ y: -5 }}
              transition={{ duration: 0.3 }}
            >
              <div className="w-16 h-16 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <benefit.icon size={32} className="text-white" />
              </div>
              <h3 className="text-xl font-medium mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                {benefit.title}
              </h3>
              <p className="text-slate-400">
                {benefit.description}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Trust Badges */}
        <motion.div 
          className="flex flex-wrap justify-center gap-6"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          viewport={{ once: true }}
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-full">
            <CheckCircle size={20} className="text-emerald-400" />
            <span className="text-slate-300 font-medium">Australian Owned</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-full">
            <CheckCircle size={20} className="text-emerald-400" />
            <span className="text-slate-300 font-medium">IICRC Compliant</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-full">
            <CheckCircle size={20} className="text-emerald-400" />
            <span className="text-slate-300 font-medium">NCC 2022 Verified</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-full">
            <CheckCircle size={20} className="text-emerald-400" />
            <span className="text-slate-300 font-medium">ISO 27001 Security</span>
          </div>
        </motion.div>
      </div>
    </SectionWrapper>
  )
}
