"use client"

import { motion } from "framer-motion"
import { MapPin, Shield, CheckCircle } from "lucide-react"
import SectionWrapper from "./SectionWrapper"
import SectionHeader from "./SectionHeader"
import AnimatedCard from "./AnimatedCard"

const states = [
  { name: "NSW", fullName: "New South Wales", color: "from-blue-500 to-cyan-500" },
  { name: "VIC", fullName: "Victoria", color: "from-emerald-500 to-teal-500" },
  { name: "QLD", fullName: "Queensland", color: "from-orange-500 to-red-500" },
  { name: "WA", fullName: "Western Australia", color: "from-purple-500 to-pink-500" },
  { name: "SA", fullName: "South Australia", color: "from-green-500 to-emerald-500" },
  { name: "TAS", fullName: "Tasmania", color: "from-cyan-500 to-blue-500" },
  { name: "ACT", fullName: "Australian Capital Territory", color: "from-indigo-500 to-purple-500" },
  { name: "NT", fullName: "Northern Territory", color: "from-yellow-500 to-orange-500" }
]

export default function StatesCoverageSection() {
  return (
    <SectionWrapper id="states-coverage" background="gradient">
      <SectionHeader 
        title="Complete Coverage Across Australia"
        subtitle="State-specific compliance and regulations for all Australian territories"
      />
      
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {states.map((state, index) => (
          <AnimatedCard key={index} delay={index * 0.1}>
            <div className="text-center">
              <div className={`w-16 h-16 bg-gradient-to-r ${state.color} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                <MapPin size={32} className="text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
                {state.name}
              </h3>
              <p className="text-slate-300 text-sm font-medium">
                {state.fullName}
              </p>
            </div>
          </AnimatedCard>
        ))}
      </div>

      {/* Compliance Info */}
      <motion.div 
        className="mt-16 grid md:grid-cols-3 gap-8"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <div className="text-center p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="w-12 h-12 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield size={24} className="text-white" />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
            NCC 2022 Compliance
          </h3>
          <p className="text-slate-400 text-sm">
            All reports automatically include relevant National Construction Code requirements
          </p>
        </div>

        <div className="text-center p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={24} className="text-white" />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
            State Regulations
          </h3>
          <p className="text-slate-400 text-sm">
            Automatic inclusion of state-specific building codes and WHS regulations
          </p>
        </div>

        <div className="text-center p-6 bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin size={24} className="text-white" />
          </div>
          <h3 className="text-lg font-medium mb-2" style={{ fontFamily: 'Titillium Web, sans-serif' }}>
            Regional Pricing
          </h3>
          <p className="text-slate-400 text-sm">
            Accurate cost estimates based on local market rates and regional variations
          </p>
        </div>
      </motion.div>
    </SectionWrapper>
  )
}
