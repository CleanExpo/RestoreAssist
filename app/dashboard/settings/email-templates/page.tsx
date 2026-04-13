"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Send, CheckCircle } from "lucide-react";
import {
  inspectionSubmittedEmail,
  scopeReadyEmail,
  invoiceGeneratedEmail,
  dryingGoalAchievedEmail,
  reportReadyEmail,
} from "@/lib/email-templates";

// ── Sample data for previews ──────────────────────────────────────────────

const SAMPLE = {
  inspectionNumber: "NIR-2026-03-0042",
  address: "14 Harbour View Terrace, Manly NSW 2095",
  technicianName: "Jordan Blake",
  scopeItemCount: 18,
  invoiceNumber: "RA-2026-0099",
  totalIncGST: 8450.0,
  dueDate: "15 Apr 2026",
  completionDate: "31 Mar 2026",
};

const TEMPLATES = [
  {
    id: "inspection_submitted",
    label: "Inspection Submitted",
    html: inspectionSubmittedEmail({
      inspectionNumber: SAMPLE.inspectionNumber,
      address: SAMPLE.address,
      technicianName: SAMPLE.technicianName,
    }),
  },
  {
    id: "scope_ready",
    label: "Scope Ready",
    html: scopeReadyEmail({
      inspectionNumber: SAMPLE.inspectionNumber,
      address: SAMPLE.address,
      scopeItemCount: SAMPLE.scopeItemCount,
      portalUrl: "https://restoreassist.com.au/dashboard/inspections/preview",
    }),
  },
  {
    id: "invoice_generated",
    label: "Invoice Generated",
    html: invoiceGeneratedEmail({
      invoiceNumber: SAMPLE.invoiceNumber,
      address: SAMPLE.address,
      totalIncGST: SAMPLE.totalIncGST,
      dueDate: SAMPLE.dueDate,
    }),
  },
  {
    id: "drying_goal_achieved",
    label: "Drying Goal Achieved",
    html: dryingGoalAchievedEmail({
      inspectionNumber: SAMPLE.inspectionNumber,
      address: SAMPLE.address,
      completionDate: SAMPLE.completionDate,
    }),
  },
  {
    id: "report_ready",
    label: "Report Ready",
    html: reportReadyEmail({
      inspectionNumber: SAMPLE.inspectionNumber,
      address: SAMPLE.address,
      reportUrl:
        "https://restoreassist.com.au/dashboard/inspections/preview/report",
    }),
  },
] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"];

// ── Page component ────────────────────────────────────────────────────────

export default function EmailTemplatesPage() {
  const { data: session } = useSession();
  const [sending, setSending] = useState<TemplateId | null>(null);
  const [sent, setSent] = useState<TemplateId | null>(null);

  async function handleTestSend(eventId: TemplateId) {
    const email = session?.user?.email;
    if (!email) return;

    setSending(eventId);
    setSent(null);

    try {
      const res = await fetch("/api/notifications/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: eventId,
          recipientEmail: email,
          // Provide dummy IDs — route handles missing gracefully for test sends
          inspectionId: "preview",
          invoiceId: "preview",
        }),
      });
      const data = (await res.json()) as { sent?: boolean; reason?: string };
      if (data.sent) {
        setSent(eventId);
        setTimeout(() => setSent(null), 3000);
      }
    } catch {
      // Silently ignore — this is a preview tool
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Email Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Preview the 5 transactional email templates sent during the
          restoration lifecycle. Use &ldquo;Send test&rdquo; to deliver a live
          preview to{" "}
          <span className="font-medium text-slate-700">
            {session?.user?.email ?? "your account email"}
          </span>
          .
        </p>
      </div>

      <Tabs defaultValue={TEMPLATES[0].id}>
        <TabsList className="mb-4 flex flex-wrap gap-1 h-auto">
          {TEMPLATES.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="text-xs sm:text-sm">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TEMPLATES.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4 pb-4">
                <div>
                  <CardTitle className="text-base">{t.label}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Event:{" "}
                    <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                      {t.id}
                    </code>
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={sending === t.id || !session?.user?.email}
                  onClick={() => handleTestSend(t.id)}
                  className="shrink-0"
                >
                  {sending === t.id ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Sending…
                    </>
                  ) : sent === t.id ? (
                    <>
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-600" />
                      Sent!
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5 mr-1.5" />
                      Send test
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <iframe
                  srcDoc={t.html}
                  title={`Preview: ${t.label}`}
                  className="w-full rounded-b-lg border-t"
                  style={{ height: 520, border: "none" }}
                  sandbox="allow-same-origin"
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
