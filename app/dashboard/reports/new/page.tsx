"use client"

import { useRouter } from "next/navigation"
import IICRCReportBuilder from "@/components/IICRCReportBuilder"
import toast from "react-hot-toast"

export default function NewReportPage() {
  const router = useRouter()

  const handleReportComplete = async (reportData: any) => {
    try {
      // Save report to database
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reportData),
      })

      if (response.ok) {
        const responseData = await response.json()
        
        // Show success message with AI generation status
        if (responseData.detailedReportGenerated) {
          toast.success("IICRC S500 compliant report created successfully with AI-generated detailed report!", {
            duration: 4000,
            style: {
              background: '#1e293b',
              color: '#10b981',
              border: '1px solid #059669'
            }
          })
        } else {
          toast.success("IICRC S500 compliant report created successfully! (AI generation failed - you can generate it manually)", {
            duration: 4000,
            style: {
              background: '#1e293b',
              color: '#fbbf24',
              border: '1px solid #d97706'
            }
          })
        }
        
        router.push("/dashboard/reports")
      } else {
        const errorData = await response.json()
        
        // Handle credit-related errors
        if (response.status === 402 && errorData.upgradeRequired) {
          toast.error(
            `Insufficient credits! You have ${errorData.creditsRemaining} credits remaining. Please upgrade your plan to create more reports.`,
            {
              duration: 6000,
              style: {
                background: '#1e293b',
                color: '#f87171',
                border: '1px solid #dc2626'
              }
            }
          )
          // Redirect to pricing page
          setTimeout(() => {
            router.push("/dashboard/pricing")
          }, 2000)
          return
        }
        
        // Handle other errors
        toast.error(errorData.error || "Failed to create report. Please try again.")
      }
    } catch (error) {
      console.error("Error creating report:", error)
      toast.error("Failed to create report. Please try again.")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <IICRCReportBuilder onReportComplete={handleReportComplete} />
    </div>
  )
}