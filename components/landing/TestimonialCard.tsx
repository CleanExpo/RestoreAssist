"use client"

import { motion } from "framer-motion"
import { Star } from "lucide-react"
import AnimatedCard from "./AnimatedCard"

interface TestimonialCardProps {
  quote: string
  author: string
  title: string
  company: string
  stat: string
  color: string
  delay?: number
}

export default function TestimonialCard({ 
  quote, 
  author, 
  title, 
  company, 
  stat, 
  color, 
  delay = 0 
}: TestimonialCardProps) {
  return (
    <AnimatedCard delay={delay}>
      <div className="mb-6">
        <div className="flex items-center gap-1 mb-4">
          {[...Array(5)].map((_, j) => (
            <Star key={j} size={20} className="text-yellow-400 fill-current" />
          ))}
        </div>
        <p className="text-slate-300 text-lg leading-relaxed italic font-light">"{quote}"</p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-lg">{author}</p>
          <p className="text-slate-400 text-sm">{title}</p>
          <p className="text-slate-500 text-sm">{company}</p>
        </div>
        <div className="text-right">
          <div className={`inline-block px-4 py-2 bg-gradient-to-r ${color} rounded-full text-white font-medium text-sm`}>
            {stat}
          </div>
        </div>
      </div>
    </AnimatedCard>
  )
}
