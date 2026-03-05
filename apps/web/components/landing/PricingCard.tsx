"use client"

import { motion } from "framer-motion"
import { CheckCircle } from "lucide-react"

interface PricingCardProps {
  name: string
  price: string
  period: string
  features: string[]
  cta: string
  popular?: boolean
  badge?: string
  delay?: number
}

export default function PricingCard({ 
  name, 
  price, 
  period, 
  features, 
  cta, 
  popular = false, 
  badge,
  delay = 0 
}: PricingCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      viewport={{ once: true }}
      className={`relative p-8 rounded-2xl border transition-all duration-500 ${
        popular
          ? "border-cyan-500/50 bg-gradient-to-br from-slate-800/60 to-slate-800/80 ring-2 ring-cyan-500/20 transform scale-105 hover:scale-110"
          : "border-slate-700/50 bg-gradient-to-br from-slate-800/30 to-slate-800/50 hover:bg-gradient-to-br hover:from-slate-800/50 hover:to-slate-800/70 hover:scale-105"
      }`}
      whileHover={{ y: -5 }}
    >
      {(popular || badge) && (
        <motion.div 
          className={`absolute -top-4 left-1/2 transform -translate-x-1/2 px-6 py-2 rounded-full text-sm font-medium ${
            popular 
              ? "bg-gradient-to-r from-blue-500 to-cyan-500" 
              : "bg-gradient-to-r from-emerald-500 to-cyan-500"
          }`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.5 }}
        >
          {popular ? "Most Popular" : badge}
        </motion.div>
      )}
      
      <h3 
        className="text-3xl font-medium mb-2"
        style={{ fontFamily: 'Titillium Web, sans-serif' }}
      >
        {name}
      </h3>
      
      <div className="mb-8">
        <span className="text-5xl font-medium">{price}</span>
        <span className="text-slate-400 ml-2 text-xl">{period}</span>
      </div>
      
      <ul className="space-y-4 mb-8">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-3 text-slate-300">
            <CheckCircle size={20} className="text-cyan-400 flex-shrink-0" />
            <span className="text-lg font-light">{feature}</span>
          </li>
        ))}
      </ul>
      
      <motion.button
        className={`w-full py-4 rounded-xl font-medium text-lg transition-all duration-300 ${
          popular
            ? "bg-gradient-to-r from-blue-500 to-cyan-500 hover:shadow-2xl hover:shadow-blue-500/50"
            : "border-2 border-slate-600 hover:bg-slate-700/50"
        }`}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        style={{ fontFamily: 'Titillium Web, sans-serif' }}
      >
        {cta}
      </motion.button>
    </motion.div>
  )
}
