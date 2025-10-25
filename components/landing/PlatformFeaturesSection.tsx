"use client"

import { motion } from "framer-motion"
import { Brain, Shield, DollarSign, FileText, Zap, BarChart3 } from "lucide-react"
import SectionWrapper from "./SectionWrapper"
import SectionHeader from "./SectionHeader"
import FeatureCard from "./FeatureCard"

const features = [
  {
    icon: Brain,
    title: "AI-Powered Reports",
    description: "Claude Opus 4 generates professional reports with detailed scope of work and cost estimates in 10-15 seconds.",
    color: "from-purple-500 to-pink-500"
  },
  {
    icon: Shield,
    title: "NCC 2022 Compliant",
    description: "Every report automatically includes relevant NCC 2022 compliance notes and state-specific building regulations.",
    color: "from-emerald-500 to-cyan-500"
  },
  {
    icon: DollarSign,
    title: "Accurate Pricing",
    description: "Market-accurate 2024 Australian pricing database with realistic labour rates and material costs.",
    color: "from-green-500 to-emerald-500"
  },
  {
    icon: FileText,
    title: "Professional Output",
    description: "Industry-standard documentation with itemised estimates, scope of work, and Authority to Proceed.",
    color: "from-blue-500 to-cyan-500"
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Generate comprehensive damage assessments in seconds instead of hours of manual work.",
    color: "from-yellow-500 to-orange-500"
  },
  {
    icon: BarChart3,
    title: "Analytics & Tracking",
    description: "Track all your reports, monitor statistics, and export data for insurance claims.",
    color: "from-indigo-500 to-purple-500"
  }
]

export default function PlatformFeaturesSection() {
  return (
    <SectionWrapper id="platform-features" background="gradient">
      <SectionHeader 
        title="Everything You Need in One Platform"
        subtitle="Powerful features designed for restoration professionals"
      />
      
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {features.map((feature, index) => (
          <FeatureCard
            key={index}
            title={feature.title}
            description={feature.description}
            icon={feature.icon}
            color={feature.color}
            delay={index * 0.1}
          />
        ))}
      </div>

      {/* Additional CTA */}
      <motion.div 
        className="mt-16 text-center"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <motion.button
          className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full font-medium text-lg hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ fontFamily: 'Titillium Web, sans-serif' }}
        >
          Explore All Features
        </motion.button>
      </motion.div>
    </SectionWrapper>
  )
}
