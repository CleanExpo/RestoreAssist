"use client"

import { motion } from "framer-motion"

interface SectionHeaderProps {
  title: string
  subtitle?: string
  className?: string
}

export default function SectionHeader({ title, subtitle, className = "" }: SectionHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true }}
      className={`text-center mb-20 ${className}`}
    >
      <h2 
        className="text-5xl md:text-6xl font-medium mb-6"
        style={{ fontFamily: 'Titillium Web, sans-serif' }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-2xl text-slate-400 max-w-4xl mx-auto leading-relaxed font-light">
          {subtitle}
        </p>
      )}
    </motion.div>
  )
}
