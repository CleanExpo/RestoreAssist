"use client"

import { useSearchParams } from "next/navigation"
import PricingConfiguration from "@/components/PricingConfiguration"
import OnboardingGuide from "@/components/OnboardingGuide"

export default function PricingConfigPage() {
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'

  return (
    <>
      {/* Onboarding Guide - Contextual Sidebar */}
      <OnboardingGuide
        step={3}
        totalSteps={4}
        title="Pricing Configuration"
        description="Configure your company rates for labor, equipment, and services. These rates will be used to generate accurate cost estimates in your reports."
        value="Accurate pricing ensures your reports include realistic cost projections that help with insurance claims and project planning."
      >
        <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Pricing Configuration</h1>
          <p className="text-slate-400">Configure your labour rates, equipment rental prices, and chemical treatment costs</p>
        </div>
        <PricingConfiguration isOnboarding={isOnboarding} />
        </div>
      </OnboardingGuide>
    </>
  )
}

