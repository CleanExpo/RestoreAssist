"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"

interface AnimatedCardProps {
  children: ReactNode
  className?: string
  delay?: number
  gradient?: string
  hoverGradient?: string
}

export default function AnimatedCard({ 
  children, 
  className = "", 
  delay = 0,
  gradient = "from-slate-800/30 to-slate-800/60",
  hoverGradient = "from-slate-800/60 to-slate-800/80"
}: AnimatedCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      viewport={{ once: true }}
      className={`group p-8 rounded-2xl border border-slate-700/50 bg-gradient-to-br ${gradient} hover:bg-gradient-to-br ${hoverGradient} transition-all duration-500 hover:border-cyan-500/50 hover:shadow-2xl hover:shadow-cyan-500/10 ${className}`}
      whileHover={{ y: -5 }}
    >
      {children}
    </motion.div>
  )
}
