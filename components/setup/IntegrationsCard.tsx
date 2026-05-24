"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, KeyRound } from "lucide-react";

interface Provider {
  key: string;
  name: string;
  description: string;
}

const PROVIDERS: Provider[] = [
  { key: "xero", name: "Xero", description: "Invoice + payment sync" },
  { key: "myob", name: "MYOB", description: "AccountRight ledger sync" },
  {
    key: "quickbooks",
    name: "QuickBooks",
    description: "Customer + invoice sync",
  },
  { key: "servicem8", name: "ServiceM8", description: "Job import" },
  { key: "ascora", name: "Ascora", description: "Work orders + line items" },
];

export function IntegrationsCard() {
  const [byokOpen, setByokOpen] = useState(false);

  async function handleConnect(providerKey: string) {
    try {
      const res = await fetch(
        `/api/integrations/oauth/${providerKey}/connect`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
        }
      }
    } catch {
      // non-blocking — user can retry from the full Integrations page
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your existing tools</CardTitle>
        <p className="text-sm text-muted-foreground">
          All optional. You can do this later from Settings.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handleConnect(p.key)}
              aria-label={`Connect ${p.name}`}
              className="rounded-md border border-border p-3 text-left transition hover:border-foreground/40 flex items-center justify-between gap-2"
            >
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-sm">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.description}
                </span>
              </span>
              <ChevronRight
                className="w-4 h-4 text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setByokOpen((v) => !v)}
            aria-expanded={byokOpen}
            aria-controls="byok-section"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <KeyRound className="w-4 h-4" aria-hidden="true" />
            <span>BYOK AI keys (optional)</span>
            <ChevronRight
              className={`w-4 h-4 transition-transform ${byokOpen ? "rotate-90" : ""}`}
              aria-hidden="true"
            />
          </button>
          {byokOpen && (
            <div id="byok-section" className="mt-3 space-y-2 text-sm">
              <p className="text-muted-foreground">
                Add your own OpenAI / Anthropic / Gemini key to use premium
                models. We&apos;ll keep using our default Gemma if you skip
                this.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href =
                    "/dashboard/settings/ai-providers?return=/setup";
                }}
              >
                Manage AI keys →
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
