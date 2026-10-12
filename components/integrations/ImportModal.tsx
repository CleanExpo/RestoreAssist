"use client";

import { useState, useEffect, useRef } from "react";
import { OAUTH_PROVIDERS } from "@/lib/integrations/identity";
import { describeOAuthCard, type LegacyIntegrationMetadata } from "@/lib/services/integrations/display";
import { RAIcon } from "@/components/brand/RAIcon";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Download,
  Users,
  Briefcase,
  ChevronRight,
} from "lucide-react";
import toast from "react-hot-toast";

interface ExternalClient {
  id: string;
  externalId: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contactId?: string;
}

interface ExternalJob {
  id: string;
  externalId: string;
  title: string;
  status?: string;
  clientExternalId?: string;
  address?: string;
  description?: string;
  claimId?: string;
}

interface ConnectedIntegration {
  provider: string;
  name: string;
  status: string;
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

const PROVIDER_NAMES: Record<string, string> = {
  XERO: "Xero",
  QUICKBOOKS: "QuickBooks",
  MYOB: "MYOB",
  SERVICEM8: "ServiceM8",
  ASCORA: "Ascora",
};

export default function ImportModal({
  isOpen,
  onClose,
  onImportComplete,
}: ImportModalProps) {
  const [step, setStep] = useState<"select-provider" | "select-data">(
    "select-provider",
  );
  const [connectedIntegrations, setConnectedIntegrations] = useState<
    ConnectedIntegration[]
  >([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"clients" | "jobs">("clients");
  const [clients, setClients] = useState<ExternalClient[]>([]);
  const [jobs, setJobs] = useState<ExternalJob[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [loadingIntegrations, setLoadingIntegrations] = useState(true);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [dataError, setDataError] = useState(false);
  const requestVersion = useRef(Symbol("initial"));
  const [loadingData, setLoadingData] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    setConnectedIntegrations([]);
    if (isOpen) {
      void fetchConnectedIntegrations();
      setStep("select-provider");
      setSelectedProvider(null);
      setClients([]);
      setJobs([]);
      setSelectedClientIds(new Set());
      setSelectedJobIds(new Set());
    }
    return () => { requestVersion.current = Symbol("closed"); };
  }, [isOpen]);

  const fetchConnectedIntegrations = async () => {
    const version = Symbol("request");
    requestVersion.current = version;
    setLoadingIntegrations(true);
    setIntegrationError(null);
    setConnectedIntegrations([]);
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      if (!response.ok) throw new Error("Integration metadata unavailable");
      const data = await response.json();
      if (data.truncated || !Array.isArray(data.integrations)) throw new Error("Incomplete integration metadata");
      if (version !== requestVersion.current) return;
      const rows = data.integrations as LegacyIntegrationMetadata[];
      const connected: ConnectedIntegration[] = [];
      for (const provider of OAUTH_PROVIDERS) {
        const state = describeOAuthCard(rows, provider);
        if (state.status === "AMBIGUOUS") {
          setIntegrationError("Multiple workspace connections need review before importing. No connection has been selected.");
          return;
        }
        if (state.connected) connected.push({ provider, name: PROVIDER_NAMES[provider], status: state.status });
      }
      setConnectedIntegrations(connected);
    } catch {
      if (version === requestVersion.current) {
        setIntegrationError("Integration status is unavailable. Retry before importing.");
      }
    } finally {
      if (version === requestVersion.current) setLoadingIntegrations(false);
    }
  };

  const handleSelectProvider = async (provider: string) => {
    if (!connectedIntegrations.some(connection => connection.provider === provider)) return;
    setSelectedProvider(provider);
    setStep("select-data");
    await fetchData(provider);
  };

  const fetchData = async (provider: string) => {
    const version = Symbol("request");
    requestVersion.current = version;
    const slug = provider.toLowerCase();
    setLoadingData(true);
    setDataError(false);
    setClients([]);
    setJobs([]);
    setSelectedClientIds(new Set());
    setSelectedJobIds(new Set());
    try {
      const [clientsRes, jobsRes] = await Promise.all([
        fetch(`/api/integrations/oauth/${slug}/clients`),
        fetch(`/api/integrations/oauth/${slug}/jobs`),
      ]);
      if (!clientsRes.ok || !jobsRes.ok) throw new Error("Import data unavailable");
      const [clientsData, jobsData] = await Promise.all([clientsRes.json(), jobsRes.json()]);
      if (!Array.isArray(clientsData.clients) || !Array.isArray(jobsData.jobs)) throw new Error("Invalid import data");
      if (version !== requestVersion.current) return;
      setClients(clientsData.clients);
      setJobs(jobsData.jobs);
    } catch {
      if (version === requestVersion.current) setDataError(true);
    } finally {
      if (version === requestVersion.current) setLoadingData(false);
    }
  };

  const handleImport = async () => {
    if (!selectedProvider) return;

    const clientIds = Array.from(selectedClientIds);
    const jobIds = Array.from(selectedJobIds);

    if (clientIds.length === 0 && jobIds.length === 0) {
      toast.error("Please select at least one item to import");
      return;
    }

    const slug = selectedProvider.toLowerCase();
    setImporting(true);
    try {
      // RA-7663 — count what the server says arrived, never what was ticked.
      const importOne = async (
        kind: "clients" | "jobs",
        ids: string[],
      ): Promise<{ imported: number; failed: number }> => {
        if (ids.length === 0) return { imported: 0, failed: 0 };
        const res = await fetch(`/api/integrations/oauth/${slug}/${kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "clients" ? { clientIds: ids } : { jobIds: ids },
          ),
        });
        const body = await res.json().catch(() => ({}));
        const imported = typeof body.imported === "number" ? body.imported : 0;
        const failed =
          typeof body.failed === "number"
            ? body.failed
            : Array.isArray(body.errors)
              ? body.errors.length
              : 0;
        // A refused request with no counts (auth, validation) imported nothing.
        if (!res.ok && typeof body.imported !== "number") {
          return { imported: 0, failed: ids.length };
        }
        return { imported, failed };
      };

      const [clientResult, jobResult] = await Promise.all([
        importOne("clients", clientIds),
        importOne("jobs", jobIds),
      ]);
      const totalImported = clientResult.imported + jobResult.imported;
      const totalFailed = clientResult.failed + jobResult.failed;

      if (totalImported > 0) onImportComplete?.();

      if (totalFailed > 0) {
        toast.error(
          `${totalFailed} could not be imported. Imported ${clientResult.imported} clients and ${jobResult.imported} jobs.`,
        );
      } else if (totalImported === 0) {
        toast.error("Nothing was imported");
      } else {
        toast.success(
          `Successfully imported ${clientResult.imported} clients and ${jobResult.imported} jobs`,
        );
        setSelectedClientIds(new Set());
        setSelectedJobIds(new Set());
        onClose();
      }
    } catch (error) {
      console.error("Error importing:", error);
      toast.error("Failed to import data");
    } finally {
      setImporting(false);
    }
  };

  const toggleClient = (id: string) => {
    const newSelected = new Set(selectedClientIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedClientIds(newSelected);
  };

  const toggleJob = (id: string) => {
    const newSelected = new Set(selectedJobIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedJobIds(newSelected);
  };

  const selectAllClients = () => {
    if (selectedClientIds.size === clients.filter((c) => !c.contactId).length) {
      setSelectedClientIds(new Set());
    } else {
      setSelectedClientIds(
        new Set(clients.filter((c) => !c.contactId).map((c) => c.externalId)),
      );
    }
  };

  const selectAllJobs = () => {
    if (selectedJobIds.size === jobs.filter((j) => !j.claimId).length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(
        new Set(jobs.filter((j) => !j.claimId).map((j) => j.externalId)),
      );
    }
  };

  const unimportedClients = clients.filter((c) => !c.contactId);
  const unimportedJobs = jobs.filter((j) => !j.claimId);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "select-provider"
              ? "Import Data"
              : `Import from ${PROVIDER_NAMES[selectedProvider || ""] || selectedProvider}`}
          </DialogTitle>
          <DialogDescription>
            {step === "select-provider"
              ? "Select a connected integration to import data from"
              : "Select clients and jobs to import into RestoreAssist"}
          </DialogDescription>
        </DialogHeader>

        {step === "select-provider" ? (
          <div className="flex-1 overflow-y-auto min-h-[200px] p-2">
            {loadingIntegrations ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : integrationError ? (
              <div role="alert" className="space-y-3 py-8 text-sm">
                <p>{integrationError}</p>
                <Button variant="outline" onClick={() => void fetchConnectedIntegrations()}>Retry status</Button>
              </div>
            ) : connectedIntegrations.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 dark:text-slate-400 font-medium mb-2">
                  No integrations ready to import
                </p>
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Connect Xero, QuickBooks, MYOB or ServiceM8 on the
                  Integrations page, then return here to import clients and jobs.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {connectedIntegrations.map((integration) => (
                  <button
                    key={integration.provider}
                    onClick={() => handleSelectProvider(integration.provider)}
                    className="w-full p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        <RAIcon
                          name={
                            integration.provider === "XERO" ||
                            integration.provider === "QUICKBOOKS" ||
                            integration.provider === "MYOB"
                              ? "invoice"
                              : "report"
                          }
                          size={24}
                          decorative
                        />
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {integration.name}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab("clients")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "clients"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
                }`}
              >
                <Users className="inline-block w-4 h-4 mr-2" />
                Clients ({unimportedClients.length})
              </button>
              <button
                onClick={() => setActiveTab("jobs")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "jobs"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400"
                }`}
              >
                <Briefcase className="inline-block w-4 h-4 mr-2" />
                Jobs ({unimportedJobs.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[300px]">
              {loadingData ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                </div>
              ) : dataError ? (
                <div role="alert" className="space-y-3 p-4 text-sm">
                  <p>Import data is unavailable. Retry before selecting items.</p>
                  <Button variant="outline" onClick={() => selectedProvider && void fetchData(selectedProvider)}>Retry data</Button>
                </div>
              ) : activeTab === "clients" ? (
                <div className="space-y-2 p-2">
                  {unimportedClients.length === 0 ? (
                    <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                      No new clients to import. Try syncing first.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <button
                          onClick={selectAllClients}
                          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {selectedClientIds.size === unimportedClients.length
                            ? "Deselect All"
                            : "Select All"}
                        </button>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {selectedClientIds.size} selected
                        </span>
                      </div>
                      {unimportedClients.map((client) => (
                        <div
                          key={client.id}
                          onClick={() => toggleClient(client.externalId)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedClientIds.has(client.externalId)
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedClientIds.has(client.externalId)}
                              onCheckedChange={() =>
                                toggleClient(client.externalId)
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-900 dark:text-white truncate">
                                {client.name}
                              </p>
                              {client.email && (
                                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                                  {client.email}
                                </p>
                              )}
                              {client.phone && (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  {client.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {unimportedJobs.length === 0 ? (
                    <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                      No new jobs to import. Try syncing first.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                        <button
                          onClick={selectAllJobs}
                          className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {selectedJobIds.size === unimportedJobs.length
                            ? "Deselect All"
                            : "Select All"}
                        </button>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {selectedJobIds.size} selected
                        </span>
                      </div>
                      {unimportedJobs.map((job) => (
                        <div
                          key={job.id}
                          onClick={() => toggleJob(job.externalId)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedJobIds.has(job.externalId)
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedJobIds.has(job.externalId)}
                              onCheckedChange={() => toggleJob(job.externalId)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-slate-900 dark:text-white truncate">
                                {job.title}
                              </p>
                              {job.status && (
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  Status: {job.status}
                                </p>
                              )}
                              {job.address && (
                                <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
                                  {job.address}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="border-t border-slate-200 dark:border-slate-700 pt-4">
          {step === "select-data" && (
            <Button
              variant="outline"
              onClick={() => setStep("select-provider")}
              disabled={importing}
              className="mr-auto"
            >
              Back
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          {step === "select-data" && (
            <Button
              onClick={handleImport}
              disabled={
                importing || loadingData || dataError ||
                (selectedClientIds.size === 0 && selectedJobIds.size === 0)
              }
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Import Selected
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
