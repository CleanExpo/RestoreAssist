"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"

interface PhoneScreen {
  id: string
  label: string
  description: string
  features: string[]
}

const phoneScreens: PhoneScreen[] = [
  {
    id: "inspection",
    label: "INSPECTION REPORT",
    description: "Comprehensive damage assessment and documentation",
    features: [
      "AI-powered damage analysis",
      "IICRC S500 compliance",
      "Multi-hazard support",
      "Photo & data capture"
    ]
  },
  {
    id: "scoping",
    label: "SCOPING",
    description: "Detailed scope of work and restoration plan",
    features: [
      "Dynamic workflow engine",
      "Compliance auto-insertion",
      "Real-time cost calculation",
      "Authority to proceed docs"
    ]
  },
  {
    id: "estimating",
    label: "ESTIMATING",
    description: "Accurate cost estimates with regional pricing",
    features: [
      "NCC 2022 compliant",
      "Regional cost libraries",
      "Equipment & labour rates",
      "PDF & Excel export"
    ]
  },
]

interface MobileWorkflowCarouselProps {
  darkMode?: boolean
}

export default function MobileWorkflowCarousel({ darkMode = true }: MobileWorkflowCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(1) // Start with middle (SCOPING)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % phoneScreens.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Calculate positions for circular flow
  const getPhonePosition = (index: number) => {
    const offset = index - currentIndex
    if (offset === 0) {
      return { x: 0, y: 0, scale: 1, opacity: 1, blur: 0, zIndex: 10 }
    }
    if (offset === 1 || offset === -2) {
      return { x: 250, y: 30, scale: 0.85, opacity: 0.5, blur: 8, zIndex: 2 }
    }
    return { x: -250, y: 30, scale: 0.85, opacity: 0.5, blur: 8, zIndex: 1 }
  }

  return (
    <div className="relative w-full h-[600px] flex items-center justify-center overflow-hidden">
      {phoneScreens.map((screen, index) => {
        const position = getPhonePosition(index)
        const isActive = index === currentIndex

        return (
          <motion.div
            key={`${screen.id}-${index}`}
            className="absolute"
            animate={{
              x: position.x,
              y: position.y,
              scale: position.scale,
              opacity: position.opacity,
              zIndex: position.zIndex,
            }}
            transition={{
              duration: 0.8,
              ease: "easeInOut",
            }}
            style={{
              filter: `blur(${position.blur}px)`,
            }}
          >
            {/* Phone Frame */}
            <div className={`w-[280px] h-[560px] rounded-[3rem] p-2 shadow-2xl border-4 transition-colors ${darkMode ? 'bg-[#1C2E47]' : 'bg-[#F4F5F6]'} ${isActive ? 'border-[#8A6B4E]' : 'border-[#5A6A7B]'}`}>
              {/* Notch */}
              <div className={`absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 rounded-b-2xl z-20 transition-colors ${darkMode ? 'bg-[#1C2E47]' : 'bg-[#F4F5F6]'}`}></div>
              
              {/* Screen Content */}
              <div className={`w-full h-full rounded-[2.5rem] overflow-hidden relative border transition-colors ${darkMode ? 'bg-[#1C2E47] border-[#5A6A7B]/30' : 'bg-[#F4F5F6] border-[#5A6A7B]/20'}`}>
                <div className="absolute top-4 left-0 right-0 text-center z-10 px-4">
                  <p className={`text-xs font-bold transition-colors ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, sans-serif' }}>{screen.label}</p>
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-start pt-16 pb-4 px-4 overflow-y-auto">
                  {/* Description */}
                  <div className="w-full mb-4">
                    <p className={`text-[11px] text-center mb-4 leading-tight px-2 transition-colors ${darkMode ? 'text-[#C4C8CA]' : 'text-[#5A6A7B]'}`} style={{ fontFamily: '"Canva Sans", Inter, sans-serif' }}>
                      {screen.description}
                    </p>
                  </div>
                  
                  {/* Features List */}
                  <div className="w-full space-y-2.5">
                    {screen.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 px-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#8A6B4E] mt-1 shrink-0"></div>
                        <p className={`text-[10px] leading-snug flex-1 transition-colors ${darkMode ? 'text-[#F4F5F6]' : 'text-[#1C2E47]'}`} style={{ fontFamily: '"Canva Sans", Inter, sans-serif' }}>
                          {feature}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )
      })}

      {/* Curved Arrows showing flow */}
      <motion.svg
        className="absolute left-[80px] top-1/2 -translate-y-1/2 pointer-events-none"
        width="80"
        height="80"
        viewBox="0 0 100 100"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        <path
          d="M 30 50 Q 50 30, 70 50"
          fill="none"
          stroke="#5A6A7B"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M 65 45 L 70 50 L 65 55"
          fill="none"
          stroke="#5A6A7B"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
      <motion.svg
        className="absolute right-[80px] top-1/2 -translate-y-1/2 pointer-events-none"
        width="80"
        height="80"
        viewBox="0 0 100 100"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <path
          d="M 70 50 Q 50 70, 30 50"
          fill="none"
          stroke="#5A6A7B"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M 35 45 L 30 50 L 35 55"
          fill="none"
          stroke="#5A6A7B"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </div>
  )
}
