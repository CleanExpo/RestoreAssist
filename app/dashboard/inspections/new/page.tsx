"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import NIRTechnicianInputForm from "@/components/NIRTechnicianInputForm";
import { ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

export default function NewInspectionPage() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const sessionId = searchParams.get("sessionId");
  const interviewDataParam = searchParams.get("interviewData");
  const clientIdParam = searchParams.get("clientId");
  const reportIdParam = searchParams.get("reportId");
  const [reportPrefill, setReportPrefill] = useState<Record<string, unknown> | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(!!reportIdParam);
  const [clientError, setClientError] = useState<string | null>(null);
  const [loadingClient, setLoadingClient] = useState(!!clientIdParam);
  const [reportClientUnlinked, setReportClientUnlinked] = useState(false);
  const [clientPrefill, setClientPrefill] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [initialDataFromApi, setInitialDataFromApi] = useState<
    Record<string, unknown> | null | undefined
  >(undefined);
  const [loadingPrefill, setLoadingPrefill] = useState(!!sessionId);

  const initialDataFromUrl = useMemo(() => {
    if (!interviewDataParam) return undefined;
    try {
      return JSON.parse(decodeURIComponent(interviewDataParam)) as Record<
        string,
        unknown
      >;
    } catch {
      return undefined;
    }
  }, [interviewDataParam]);

  useEffect(() => {
    if (!clientIdParam) {
      setLoadingClient(false);
      setClientPrefill(null);
      return;
    }
    let cancelled = false;
    setLoadingClient(true);
    setClientError(null);
    fetch(`/api/clients/${encodeURIComponent(clientIdParam)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setClientError("Client not found or unavailable.");
          return;
        }
        const c = data.client ?? data;
        setClientPrefill({
          propertyAddress:
            typeof c.address === "string"
              ? c.address
              : typeof c.propertyAddress === "string"
                ? c.propertyAddress
                : undefined,
          propertyPostcode:
            typeof c.postcode === "string"
              ? c.postcode
              : typeof c.postalCode === "string"
                ? c.postalCode
                : undefined,
          clientId: clientIdParam,
          clientName: c.name,
        });
      })
      .catch(() => {
        if (!cancelled) setClientError("Could not verify the selected client.");
      })
      .finally(() => {
        if (!cancelled) setLoadingClient(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientIdParam]);

  useEffect(() => {
    if (!reportIdParam) return;
    let cancelled = false;
    setLoadingReport(true);
    setReportError(null);
    fetch(`/api/reports/${encodeURIComponent(reportIdParam)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Report not found or unavailable");
        return res.json();
      })
      .then((report) => {
        if (cancelled) return;
        if (clientIdParam && report.clientId && report.clientId !== clientIdParam) {
          setReportError("This report is not linked to the selected client.");
          return;
        }
        setReportClientUnlinked(Boolean(clientIdParam && !report.clientId));
        setReportPrefill({
          propertyAddress: report.propertyAddress,
          propertyPostcode: report.propertyPostcode,
          clientId: report.clientId ?? clientIdParam ?? undefined,
          damageDescription: report.description ?? "",
          inspectionDate: report.technicianAttendanceDate ?? undefined,
        });
      })
      .catch((error) => {
        if (!cancelled) setReportError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingReport(false);
      });
    return () => { cancelled = true; };
  }, [reportIdParam, clientIdParam]);

  useEffect(() => {
    if (!sessionId) {
      setLoadingPrefill(false);
      return;
    }
    let cancelled = false;
    setLoadingPrefill(true);
    fetch(`/api/interviews/${sessionId}/inspection-prefill`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load prefill");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data?.prefill) setInitialDataFromApi(data.prefill);
        else if (!cancelled) setInitialDataFromApi({});
      })
      .catch(() => {
        if (!cancelled) {
          setInitialDataFromApi(null);
          toast.error(
            "Couldn’t load interview data. You can still enter the job manually.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPrefill(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const initialData = useMemo(() => {
    const base =
      initialDataFromApi !== undefined
        ? (initialDataFromApi ?? undefined)
        : initialDataFromUrl;
    if (!clientPrefill && !clientIdParam && !reportPrefill) return base;
    return {
      ...(base ?? {}),
      ...(clientPrefill ?? {}),
      ...(clientIdParam ? { clientId: clientIdParam } : {}),
      ...(reportPrefill ?? {}),
    };
  }, [initialDataFromApi, initialDataFromUrl, clientPrefill, clientIdParam, reportPrefill]);

  return (
    <div
      className={cn(
        "space-y-6 w-full max-w-[1600px] mx-auto",
        "text-neutral-900 dark:text-neutral-100",
        "bg-white dark:bg-transparent",
      )}
    >
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/dashboard/inspections")}
          className={cn(
            "p-2 rounded-lg transition-colors",
            "hover:bg-neutral-100 dark:hover:bg-slate-800",
            "text-neutral-700 dark:text-neutral-300",
          )}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1
            className={cn(
              "text-2xl font-bold",
              "text-neutral-900 dark:text-white",
            )}
          >
            New Inspection
          </h1>
          <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>
            Capture field data for a National Inspection Report (NIR)
          </p>
        </div>
      </div>

      {reportError || clientError ? (
        <p role="alert" className="text-destructive">{reportError ?? clientError}</p>
      ) : loadingPrefill || loadingReport || loadingClient ||
          (clientIdParam && clientPrefill?.clientId !== clientIdParam) ? (
        <div
          className={cn(
            "flex items-center justify-center py-20 gap-3 rounded-xl border",
            "border-neutral-200 dark:border-slate-700",
            "bg-neutral-50 dark:bg-slate-900/50",
          )}
        >
          <Loader2 className="animate-spin text-cyan-500" size={28} />
          <span className={cn("text-neutral-600 dark:text-slate-400")}>
            Loading draft details...
          </span>
        </div>
      ) : (
        <>
        {reportIdParam && (
          <p className="rounded-lg border border-cyan-300 p-3 text-sm">
            This draft will use the existing report.
            {reportClientUnlinked && " Saving it will link that report to the selected client without changing its contact details."}
          </p>
        )}
        <NIRTechnicianInputForm
          reportId={reportIdParam ?? undefined}
          initialData={initialData ?? undefined}
          onComplete={(inspectionId: string) => {
            router.push(`/dashboard/inspections/${inspectionId}`);
          }}
        />
        </>
      )}
    </div>
  );
}
