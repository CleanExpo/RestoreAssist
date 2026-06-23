"use client";

import { useState } from "react";
import CheckoutCTA from "./CheckoutCTA";

type Tier = {
  name: "STANDARD" | "PREMIUM" | "ENTERPRISE";
  displayName: string;
  price: string;
  popular?: boolean;
  features: string[];
};

const DEFAULT_TIERS: Tier[] = [
  {
    name: "STANDARD",
    displayName: "Standard",
    price: "$99",
    features: ["Up to 20 reports/month", "Platform-managed AI", "Email support"],
  },
  {
    name: "PREMIUM",
    displayName: "Premium",
    price: "$199",
    popular: true,
    features: ["Up to 100 reports/month", "Advanced damage analysis", "Priority support"],
  },
  {
    name: "ENTERPRISE",
    displayName: "Enterprise",
    price: "Contact us",
    features: ["Unlimited reports", "All standards coverage", "Dedicated success manager"],
  },
];

export default function TierGrid({
  initialTier,
  currentTier,
}: {
  initialTier?: Tier["name"];
  currentTier?: Tier["name"] | null;
}) {
  const [selected, setSelected] = useState<Tier["name"]>(initialTier ?? "PREMIUM");

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {DEFAULT_TIERS.map((t) => (
        <button
          key={t.name}
          type="button"
          onClick={() => setSelected(t.name)}
          className={`relative rounded-lg border p-6 text-left transition ${
            selected === t.name ? "border-[#1C2E47] ring-2 ring-[#1C2E47]" : "border-slate-200"
          }`}
        >
          {t.popular && (
            <span className="absolute -top-3 right-4 rounded bg-[#1C2E47] px-2 py-0.5 text-xs text-white">
              Most popular
            </span>
          )}
          {currentTier === t.name && (
            <span className="absolute -top-3 left-4 rounded bg-green-600 px-2 py-0.5 text-xs text-white">
              Current plan
            </span>
          )}
          <h2 className="text-xl font-semibold">{t.displayName}</h2>
          <p className="mt-2 text-2xl font-bold">
            {t.price}
            <span className="text-sm font-normal text-muted-foreground">/mo</span>
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            {t.features.map((f) => (
              <li key={f}>• {f}</li>
            ))}
          </ul>
        </button>
      ))}
      <div className="md:col-span-3">
        <CheckoutCTA tier={selected} />
      </div>
    </div>
  );
}
