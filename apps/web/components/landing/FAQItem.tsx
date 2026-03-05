"use client"

import { motion } from "framer-motion"
import { Plus, Minus } from "lucide-react"

interface FAQItemProps {
  question: string
  answer: string
  isOpen: boolean
  onToggle: () => void
  delay?: number
}

export default function FAQItem({ question, answer, isOpen, onToggle, delay = 0 }: FAQItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay }}
      viewport={{ once: true }}
      className="border border-slate-700/50 bg-gradient-to-br from-slate-800/30 to-slate-800/50 rounded-2xl overflow-hidden hover:border-cyan-500/50 transition-all duration-300"
    >
      <button
        className="w-full p-6 text-left flex items-center justify-between hover:bg-slate-800/50 transition-colors duration-300"
        onClick={onToggle}
      >
        <h3 
          className="text-lg font-medium pr-4"
          style={{ fontFamily: 'Titillium Web, sans-serif' }}
        >
          {question}
        </h3>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          {isOpen ? <Minus size={24} className="text-cyan-400" /> : <Plus size={24} className="text-slate-400" />}
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="px-6 pb-6">
          <p className="text-slate-400 leading-relaxed font-light">{answer}</p>
        </div>
      </motion.div>
    </motion.div>
  )
}
