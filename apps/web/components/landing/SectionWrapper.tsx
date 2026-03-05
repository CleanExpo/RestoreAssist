"use client"

import { ReactNode } from "react"

interface SectionWrapperProps {
  children: ReactNode
  className?: string
  id?: string
  background?: "default" | "dark" | "gradient"
}

export default function SectionWrapper({ 
  children, 
  className = "", 
  id,
  background = "default" 
}: SectionWrapperProps) {
  const backgroundClasses = {
    default: "",
    dark: "bg-slate-900/50",
    gradient: "bg-gradient-to-br from-slate-900/50 via-slate-800/30 to-slate-900/50"
  }

  return (
    <section 
      id={id}
      className={`py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden ${backgroundClasses[background]} ${className}`}
    >
      <div className="max-w-7xl mx-auto">
        {children}
      </div>
    </section>
  )
}
