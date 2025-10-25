"use client"

import { motion } from "framer-motion"
import { LucideIcon } from "lucide-react"
import AnimatedCard from "./AnimatedCard"

interface FeatureCardProps {
  title: string
  description: string
  icon: LucideIcon
  color: string
  delay?: number
}

export default function FeatureCard({ title, description, icon: Icon, color, delay = 0 }: FeatureCardProps) {
  return (
    <AnimatedCard delay={delay}>
      <div className="flex items-start gap-6">
        <motion.div 
          className={`w-16 h-16 bg-gradient-to-r ${color} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}
          whileHover={{ rotate: 5 }}
        >
          <Icon size={32} className="text-white" />
        </motion.div>
        <div>
          <h3 
            className="text-xl font-medium mb-3"
            style={{ fontFamily: 'Titillium Web, sans-serif' }}
          >
            {title}
          </h3>
          <p className="text-slate-400 leading-relaxed font-light">
            {description}
          </p>
        </div>
      </div>
    </AnimatedCard>
  )
}
