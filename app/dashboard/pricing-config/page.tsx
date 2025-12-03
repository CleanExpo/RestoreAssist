"use client"

import PricingConfiguration from "@/components/PricingConfiguration"

export default function PricingConfigPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-2">Pricing Configuration</h1>
        <p className="text-slate-400">Configure your labour rates, equipment rental prices, and chemical treatment costs</p>
      </div>
      <PricingConfiguration />
    </div>
  )
}

