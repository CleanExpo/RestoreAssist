"use client"

import { motion } from "framer-motion"
import { Droplets, Flame, Wind, Waves, Bug, Zap } from "lucide-react"
import SectionWrapper from "./SectionWrapper"
import SectionHeader from "./SectionHeader"
import AnimatedCard from "./AnimatedCard"

const damageTypes = [
  {
    icon: Droplets,
    title: "Water Damage",
    range: "$2K - $15K+",
    description: "Flooding, burst pipes, storm damage, and water intrusion restoration services.",
    color: "from-blue-500 to-cyan-500"
  },
  {
    icon: Flame,
    title: "Fire Damage",
    range: "$10K - $100K+",
    description: "Smoke, soot, and fire damage restoration with specialized cleaning protocols.",
    color: "from-orange-500 to-red-500"
  },
  {
    icon: Wind,
    title: "Storm Damage",
    range: "$5K - $50K+",
    description: "Roof damage, structural repairs, and debris removal from severe weather events.",
    color: "from-purple-500 to-pink-500"
  },
  {
    icon: Waves,
    title: "Flood Damage",
    range: "$15K - $150K+",
    description: "Major flooding restoration with comprehensive water extraction and drying.",
    color: "from-cyan-500 to-blue-500"
  },
  {
    icon: Bug,
    title: "Mould Damage",
    range: "$3K - $30K+",
    description: "Mould remediation, containment, and specialized cleaning services.",
    color: "from-green-500 to-emerald-500"
  }
]

export default function DamageTypesSection() {
  return (
    <SectionWrapper id="damage-types" background="dark">
      <SectionHeader 
        title="Comprehensive Coverage for All Damage Types"
        subtitle="Expert AI-powered assessment for water, fire, storm, flood, and mould damage across Australia"
      />
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {damageTypes.map((damage, index) => (
          <AnimatedCard key={index} delay={index * 0.1}>
            <div className="text-center">
              <div className={`w-20 h-20 bg-gradient-to-r ${damage.color} rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                <damage.icon size={40} className="text-white" />
              </div>
              <h3 className="text-2xl font-medium mb-3" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                {damage.title}
              </h3>
              <p className="text-cyan-400 font-bold text-xl mb-4">
                Typical Range: {damage.range}
              </p>
              <p className="text-slate-400 leading-relaxed font-light">
                {damage.description}
              </p>
            </div>
          </AnimatedCard>
        ))}
      </div>

      {/* Additional Info */}
      <motion.div 
        className="mt-16 text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <div className="inline-flex items-center gap-3 px-6 py-3 bg-slate-800/50 border border-slate-700/50 rounded-full">
          <Zap size={20} className="text-cyan-400" />
          <span className="text-slate-300 font-medium">
            All damage types supported with AI-powered assessment and NCC 2022 compliance
          </span>
        </div>
      </motion.div>
    </SectionWrapper>
  )
}
