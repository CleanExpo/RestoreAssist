"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import Header from "@/components/landing/Header"
import Footer from "@/components/landing/Footer"
import { MermaidDiagram } from "@/components/diagrams/MermaidDiagram"

const waterDamageWorkflow = `flowchart TD
    A[Job Created] --> B[Initial Assessment]
    B --> C{Water Category}
    C -->|Cat 1 - Clean| D[Standard Protocol]
    C -->|Cat 2 - Grey Water| E[Enhanced Protocol]
    C -->|Cat 3 - Black Water| F[Specialist Protocol]
    D & E & F --> G[Moisture Mapping]
    G --> H[Equipment Placement]
    H --> I[Daily Monitoring]
    I --> J{Drying Complete?}
    J -->|No| I
    J -->|Yes| K[Final Inspection]
    K --> L[Documentation Package]
    L --> M[Invoice Generated]
    M --> N[Job Closed]`

const contractorComplianceChecklist = `flowchart TD
    A[Contractor Onboarding] --> B{IICRC Certified?}
    B -->|Yes| C[Verify Certificate Number]
    B -->|No| D[Flag Non-Compliant]
    C --> E{NRPG Registered?}
    D --> E
    E -->|Yes| F[Verify NRPG Membership]
    E -->|No| G[Require Registration]
    F --> H[Check Insurance Coverage]
    G --> H
    H --> I{Public Liability Current?}
    I -->|Yes| J[Verify Workers Comp]
    I -->|No| K[Request Updated Policy]
    J --> L{All Licences Valid?}
    K --> L
    L -->|Yes| M[Contractor Approved]
    L -->|No| N[Licence Remediation]
    N --> O[Re-Submit for Review]
    O --> L
    M --> P[Annual Review Scheduled]
    P --> Q{Review Due?}
    Q -->|Yes| H
    Q -->|No| R[Continue Operations]`

const insuranceClaimProcess = `flowchart TD
    A[Damage Reported] --> B[Initial Site Inspection]
    B --> C[Photo & Video Documentation]
    C --> D[Moisture Readings Recorded]
    D --> E[Scope of Works Drafted]
    E --> F{Insurer Approval Required?}
    F -->|Yes| G[Submit Scope to Insurer]
    F -->|No - Under Threshold| H[Proceed with Works]
    G --> I{Scope Approved?}
    I -->|Yes| H
    I -->|Variations Requested| J[Revise Scope]
    J --> G
    H --> K[Daily Progress Reports]
    K --> L[Equipment Logs Updated]
    L --> M{Works Complete?}
    M -->|No| K
    M -->|Yes| N[Final Moisture Readings]
    N --> O[Completion Certificate]
    O --> P[Documentation Package Compiled]
    P --> Q[Invoice Generated from Scope]
    Q --> R[Submit to Insurer / Client]
    R --> S{Payment Received?}
    S -->|Yes| T[Job Archived]
    S -->|No| U[Follow Up]
    U --> S`

const diagrams = [
  {
    title: "Water Damage Restoration Workflow",
    chart: waterDamageWorkflow,
    description:
      "The complete water damage restoration workflow from job creation through to closure. Each job follows a standardised process based on the IICRC S500 water category classification, ensuring the correct protocol is applied and all steps are documented.",
  },
  {
    title: "Contractor Compliance Checklist Flow",
    chart: contractorComplianceChecklist,
    description:
      "The contractor onboarding and compliance verification process. Every contractor must hold valid IICRC certification, NRPG registration, public liability insurance, and workers compensation coverage before being approved to operate on the platform.",
  },
  {
    title: "Insurance Claim Audit Trail",
    chart: insuranceClaimProcess,
    description:
      "The end-to-end insurance claim process showing how documentation flows from initial damage report through to final payment. This audit trail ensures every step is recorded and verifiable for insurer review.",
  },
]

export default function DiagramsClient() {
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? "bg-[#1C2E47]" : "bg-[#F4F5F6]"}`}>
      <Header darkMode={darkMode} setDarkMode={setDarkMode} />

      {/* Hero Section */}
      <section className="pt-48 pb-20 px-6 relative z-10 min-h-[40vh] flex items-center bg-[#C4C8CA]/30 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-20 right-10 w-72 h-72 bg-[#8A6B4E]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-96 h-96 bg-[#8A6B4E]/8 rounded-full blur-3xl"></div>
        </div>
        <div className="max-w-7xl mx-auto w-full relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className={`text-5xl md:text-6xl font-bold mb-6 leading-tight ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
            style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Compliance Workflow Diagrams
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className={`text-xl md:text-2xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
            style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
          >
            Visual audit trails for every stage of the restoration process.
          </motion.p>
        </div>
      </section>

      {/* Diagrams Section */}
      <section className="py-20 px-6 relative bg-[#C4C8CA]/30 overflow-hidden">
        <div className="max-w-7xl mx-auto relative z-10 space-y-16">
          {diagrams.map((diagram, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
            >
              <h2
                className={`text-3xl font-bold mb-4 ${darkMode ? "text-[#F4F5F6]" : "text-[#1C2E47]"}`}
                style={{ fontFamily: '"Open Sauce Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              >
                {diagram.title}
              </h2>
              <p
                className={`text-base leading-relaxed mb-6 max-w-3xl ${darkMode ? "text-[#C4C8CA]" : "text-[#5A6A7B]"}`}
                style={{ fontFamily: '"Canva Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
              >
                {diagram.description}
              </p>
              <MermaidDiagram chart={diagram.chart} />
            </motion.div>
          ))}
        </div>
      </section>

      <Footer darkMode={darkMode} />
    </div>
  )
}
