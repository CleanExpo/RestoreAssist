"use client";

import {
  Filter,
  Plus,
  Search,
  Trash2,
  Copy,
  Edit,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  clientFormSchema,
  CLIENT_FORM_DEFAULTS,
  applyServerFieldError,
  type ClientFormValues,
} from "@/lib/clients/form";
import type { Client, ClientWithReportFlag } from "@/lib/clients/types";
import { AddClientModal } from "@/components/clients/add-client-modal";
import { EditClientModal } from "@/components/clients/edit-client-modal";
import { DeleteClientModal } from "@/components/clients/delete-client-modal";
import { BulkDeleteModal } from "@/components/clients/bulk-delete-modal";
import { UpgradeModal } from "@/components/clients/upgrade-modal";

// RA-1204 — Relative-time formatter for the "Last report: 3 days ago"
// preview under each client name. Uses Intl.RelativeTimeFormat (native,
// no dependency) with en-AU for Australian English. Returns null when
// there is no reference date so callers can skip rendering.
const RELATIVE_TIME_FORMATTER =
  typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function"
    ? new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" })
    : null;

function formatRelativeFromNow(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diffMs = then - Date.now();
  const absSec = Math.abs(diffMs) / 1000;

  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; sec: number }> = [
    { unit: "year", sec: 60 * 60 * 24 * 365 },
    { unit: "month", sec: 60 * 60 * 24 * 30 },
    { unit: "week", sec: 60 * 60 * 24 * 7 },
    { unit: "day", sec: 60 * 60 * 24 },
    { unit: "hour", sec: 60 * 60 },
    { unit: "minute", sec: 60 },
  ];

  for (const { unit, sec } of units) {
    if (absSec >= sec) {
      const value = Math.round(diffMs / 1000 / sec);
      return RELATIVE_TIME_FORMATTER
        ? RELATIVE_TIME_FORMATTER.format(value, unit)
        : `${Math.abs(value)} ${unit}${Math.abs(value) === 1 ? "" : "s"} ago`;
    }
  }
  return RELATIVE_TIME_FORMATTER
    ? RELATIVE_TIME_FORMATTER.format(0, "second")
    : "just now";
}

// RA-1204 — "N open" amber badge when openJobCount > 0, "No open jobs"
// green when there are completed reports but none outstanding, nothing
// for brand-new clients (avoids noisy empty-state). Colours match the
// existing status-pill palette for consistency.
function renderOpenJobsBadge(client: {
  openJobCount?: number;
  reportsCount?: number;
}) {
  const open = client.openJobCount ?? 0;
  const total = client.reportsCount ?? 0;
  if (open > 0) {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
      >
        {open} open
      </Badge>
    );
  }
  if (total > 0) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      >
        No open jobs
      </Badge>
    );
  }
  return null;
}

export default function ClientsPage() {
  const router = useRouter();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  // RA-1215 — shared form instance for Add + Edit modals so validation
  // errors render inline against the offending field instead of a toast.
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: CLIENT_FORM_DEFAULTS,
    mode: "onBlur",
  });

  // Fetch clients from API
  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/clients");
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients);
      } else {
        toast.error("Failed to fetch clients");
      }
    } catch (error) {
      console.error("Error fetching clients:", error);
      toast.error("Failed to fetch clients");
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchesSearch =
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.phone && client.phone.includes(searchTerm)) ||
        (client.company &&
          client.company.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesStatus = !statusFilter || client.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [searchTerm, statusFilter, clients]);

  // RA-1215 — field-level (400) errors render inline via form.setError.
  // Network / 5xx / 402-upgrade retain toast (non-field signals).
  const handleAddClient = form.handleSubmit(async (values) => {
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        const newClient = await response.json();
        setClients([newClient, ...clients]);
        form.reset(CLIENT_FORM_DEFAULTS);
        setShowAddModal(false);
        toast.success("Client added successfully");
        fetchClients(); // Refresh to get updated list
        return;
      }

      const error = await response.json().catch(() => ({}));
      if (response.status === 402 && error.upgradeRequired) {
        setShowAddModal(false);
        setShowUpgradeModal(true);
        return;
      }
      if (response.status >= 400 && response.status < 500) {
        const message = error?.error || "Failed to add client";
        if (!applyServerFieldError(form, message)) {
          form.setError("root", { type: "server", message });
        }
        return;
      }
      toast.error(error?.error || "Failed to add client");
    } catch (error) {
      console.error("Error adding client:", error);
      toast.error("Failed to add client");
    }
  });

  const handleEditClient = form.handleSubmit(async (values) => {
    if (!selectedClient) {
      return;
    }

    try {
      const response = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        const updatedClient = await response.json();
        setClients(
          clients.map((c) => (c.id === selectedClient.id ? updatedClient : c)),
        );
        setShowEditModal(false);
        setSelectedClient(null);
        toast.success("Client updated successfully");
        return;
      }

      const error = await response.json().catch(() => ({}));
      if (response.status >= 400 && response.status < 500) {
        const message = error?.error || "Failed to update client";
        if (!applyServerFieldError(form, message)) {
          form.setError("root", { type: "server", message });
        }
        return;
      }
      toast.error(error?.error || "Failed to update client");
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error("Failed to update client");
    }
  });

  const handleDeleteClient = async () => {
    if (!selectedClient) return;

    // Check if this is a report-based client (can't delete, it's derived from reports)
    if ((selectedClient as ClientWithReportFlag)._isFromReport) {
      toast(
        "This client was created from a report. It will disappear once all related reports are deleted or linked to a real client.",
        {
          icon: "ℹ️",
          duration: 4000,
        },
      );
      setShowDeleteModal(false);
      setSelectedClient(null);
      return;
    }

    try {
      const response = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setClients(clients.filter((c) => c.id !== selectedClient.id));
        setShowDeleteModal(false);
        setSelectedClient(null);
        toast.success("Client deleted successfully");
        fetchClients(); // Refresh to get updated list
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to delete client");
      }
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Failed to delete client");
    }
  };

  const openEditModal = (client: Client) => {
    const values: ClientFormValues = {
      name: client.name,
      email: client.email,
      phone: client.phone || "",
      address: client.address || "",
      company: client.company || "",
      contactPerson: client.contactPerson || "",
      notes: client.notes || "",
      status: client.status,
    };

    // Check if this is a report-based client (can't edit directly, need to create real client)
    if ((client as ClientWithReportFlag)._isFromReport) {
      toast(
        "This client was created from a report. Please create a new client record to edit.",
        {
          icon: "ℹ️",
          duration: 4000,
        },
      );
      // Pre-fill the form with the report client's data
      form.reset(values);
      setShowAddModal(true);
      return;
    }

    setSelectedClient(client);
    form.reset(values);
    setShowEditModal(true);
  };

  const openDeleteModal = (client: Client) => {
    setSelectedClient(client);
    setShowDeleteModal(true);
  };

  // Duplicate client function
  const duplicateClient = async (clientId: string) => {
    try {
      setDuplicating(clientId);
      const response = await fetch(`/api/clients/${clientId}/duplicate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const newClient = await response.json();
        setClients([newClient, ...clients]);
        toast.success("Client duplicated successfully");
      } else {
        toast.error("Failed to duplicate client");
      }
    } catch (error) {
      console.error("Error duplicating client:", error);
      toast.error("Failed to duplicate client");
    } finally {
      setDuplicating(null);
    }
  };

  // Bulk delete functions
  const handleBulkDelete = async () => {
    if (selectedClients.length === 0) return;

    try {
      const response = await fetch("/api/clients/bulk-delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedClients }),
      });

      if (response.ok) {
        setClients(clients.filter((c) => !selectedClients.includes(c.id)));
        setSelectedClients([]);
        setShowBulkDeleteModal(false);
        toast.success(`${selectedClients.length} clients deleted successfully`);
      } else {
        toast.error("Failed to delete clients");
      }
    } catch (error) {
      console.error("Error deleting clients:", error);
      toast.error("Failed to delete clients");
    }
  };

  const clearSelection = () => {
    setSelectedClients([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className={cn(
              "text-3xl font-semibold mb-2",
              "text-neutral-900 dark:text-white",
            )}
          >
            Clients
          </h1>
          <p className={cn("text-neutral-600 dark:text-slate-400")}>
            Manage your restoration clients
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedClients.length > 0 && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-sm",
                  "text-neutral-600 dark:text-slate-400",
                )}
              >
                {selectedClients.length} selected
              </span>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg hover:from-red-500/30 hover:to-rose-500/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md group"
              >
                <Trash2
                  size={16}
                  className="transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12"
                />
                <span>Delete Selected</span>
              </button>
              <button
                onClick={clearSelection}
                className={cn(
                  "px-4 py-2 border rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md",
                  "border-neutral-300 dark:border-slate-600",
                  "hover:bg-neutral-100 dark:hover:bg-slate-800",
                  "text-neutral-700 dark:text-slate-300",
                )}
              >
                Clear
              </button>
            </div>
          )}
          <button
            onClick={() => {
              form.reset(CLIENT_FORM_DEFAULTS);
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group"
          >
            <Plus
              size={20}
              className="transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110"
            />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search
            className={cn(
              "absolute left-3 top-1/2 transform -translate-y-1/2",
              "text-neutral-500 dark:text-slate-400",
            )}
            size={18}
          />
          <input
            type="text"
            placeholder="Search clients by name, email, phone, company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
              "bg-neutral-100 dark:bg-slate-800",
              "border-neutral-300 dark:border-slate-700",
              "text-neutral-900 dark:text-white",
              "placeholder-neutral-500 dark:placeholder-slate-500",
            )}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter
            className={cn("text-neutral-500 dark:text-slate-400")}
            size={18}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={cn(
              "px-3 py-2 border rounded-lg focus:outline-none focus:border-cyan-500",
              "bg-neutral-100 dark:bg-slate-800",
              "border-neutral-300 dark:border-slate-700",
              "text-neutral-900 dark:text-white",
            )}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="PROSPECT">Prospect</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      ) : (
        <>
          {/* Clients Table */}
          <div
            className={cn(
              "rounded-lg border overflow-hidden",
              "border-neutral-200 dark:border-slate-700/50",
              "bg-white dark:bg-slate-800/30",
            )}
          >
            {/* RA-1217 — mobile card layout below sm breakpoint.
                The 7-column clients table was horizontally-scrolling on phones.
                Field techs reviewing client history on-site now get a stacked
                card per client. Desktop/tablet retains the table below. */}
            <div className="sm:hidden space-y-3 p-4">
              {filteredClients.length === 0 ? (
                <div className="text-center py-8 text-neutral-600 dark:text-slate-400">
                  {searchTerm || statusFilter
                    ? "No clients found matching your criteria"
                    : "No clients found. Add your first client to get started."}
                </div>
              ) : (
                filteredClients.map((client) => {
                  const fromReport = (client as ClientWithReportFlag)
                    ._isFromReport;
                  const statusClass =
                    client.status === "ACTIVE"
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : client.status === "INACTIVE"
                        ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                        : client.status === "PROSPECT"
                          ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                          : "bg-neutral-200 dark:bg-slate-500/20 text-neutral-600 dark:text-slate-400";
                  const NameWrap = fromReport
                    ? ({ children }: { children: React.ReactNode }) => (
                        <span className="text-cyan-500 dark:text-cyan-400">
                          {children}
                        </span>
                      )
                    : ({ children }: { children: React.ReactNode }) => (
                        <Link
                          href={`/dashboard/clients/${client.id}`}
                          className="text-cyan-500 dark:text-cyan-400 hover:underline"
                        >
                          {children}
                        </Link>
                      );
                  return (
                    <div
                      key={client.id}
                      className={cn(
                        "rounded-xl border p-4",
                        "border-neutral-200 dark:border-slate-700/50",
                        "bg-white dark:bg-slate-900/50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-medium text-neutral-900 dark:text-white truncate">
                              <NameWrap>{client.name}</NameWrap>
                            </div>
                            {renderOpenJobsBadge(client)}
                          </div>
                          {client.company && (
                            <div className="text-xs text-neutral-500 dark:text-slate-500 truncate mt-0.5">
                              {client.company}
                            </div>
                          )}
                          {client.lastReportAt && (
                            <div className="text-xs text-neutral-500 dark:text-slate-500 mt-0.5">
                              Last report:{" "}
                              {formatRelativeFromNow(client.lastReportAt)}
                            </div>
                          )}
                          {fromReport && (
                            <div className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">
                              From Report
                            </div>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${statusClass}`}
                        >
                          {client.status}
                        </span>
                      </div>
                      <div className="text-sm text-neutral-600 dark:text-slate-400 truncate">
                        {client.email}
                      </div>
                      {client.phone && (
                        <div className="text-sm text-neutral-600 dark:text-slate-400 truncate">
                          {client.phone}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-neutral-100 dark:border-slate-800 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium">
                          {client.reportsCount || 0} reports
                        </span>
                        <span className="font-medium text-cyan-600 dark:text-cyan-400">
                          $
                          {client.totalRevenue
                            ? client.totalRevenue.toLocaleString()
                            : "0"}
                        </span>
                        <span className="text-neutral-500 dark:text-slate-500 truncate">
                          {client.lastJob || "No jobs yet"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className={cn(
                      "border-b",
                      "border-neutral-200 dark:border-slate-700",
                      "bg-neutral-50 dark:bg-slate-900/50",
                    )}
                  >
                    <th
                      className={cn(
                        "text-left py-4 px-6 font-medium",
                        "text-neutral-700 dark:text-slate-400",
                      )}
                    >
                      Client Name
                    </th>
                    <th
                      className={cn(
                        "text-left py-4 px-6 font-medium",
                        "text-neutral-700 dark:text-slate-400",
                      )}
                    >
                      Email
                    </th>
                    <th
                      className={cn(
                        "text-left py-4 px-6 font-medium",
                        "text-neutral-700 dark:text-slate-400",
                      )}
                    >
                      Phone
                    </th>
                    <th
                      className={cn(
                        "text-left py-4 px-6 font-medium",
                        "text-neutral-700 dark:text-slate-400",
                      )}
                    >
                      Status
                    </th>
                    <th
                      className={cn(
                        "text-left py-4 px-6 font-medium",
                        "text-neutral-700 dark:text-slate-400",
                      )}
                    >
                      Reports
                    </th>
                    <th
                      className={cn(
                        "text-left py-4 px-6 font-medium",
                        "text-neutral-700 dark:text-slate-400",
                      )}
                    >
                      Total Revenue
                    </th>
                    <th
                      className={cn(
                        "text-left py-4 px-6 font-medium",
                        "text-neutral-700 dark:text-slate-400",
                      )}
                    >
                      Last Job
                    </th>
                    <th
                      className={cn(
                        "text-left py-4 px-6 font-medium",
                        "text-neutral-700 dark:text-slate-400",
                      )}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className={cn(
                          "py-12 text-center",
                          "text-neutral-600 dark:text-slate-400",
                        )}
                      >
                        {searchTerm || statusFilter
                          ? "No clients found matching your criteria"
                          : "No clients found. Add your first client to get started."}
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client) => (
                      <tr
                        key={client.id}
                        className={cn(
                          "border-b transition-colors",
                          "border-neutral-200 dark:border-slate-700/50",
                          "hover:bg-neutral-50 dark:hover:bg-slate-700/30",
                        )}
                      >
                        <td className="py-4 px-6 font-medium">
                          {/* RA-1204 — Name cell now previews workload
                              (open-jobs badge) + recency ("Last report:
                              3 days ago"). Previously screen reader and
                              keyboard users had to follow the View link
                              to see any context. */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {(client as ClientWithReportFlag)._isFromReport ? (
                              <span className="text-cyan-400">
                                {client.name}
                              </span>
                            ) : (
                              <Link
                                href={`/dashboard/clients/${client.id}`}
                                className="text-cyan-400 hover:underline"
                              >
                                {client.name}
                              </Link>
                            )}
                            {renderOpenJobsBadge(client)}
                          </div>
                          {client.company && (
                            <div
                              className={cn(
                                "text-xs mt-1",
                                "text-neutral-500 dark:text-slate-500",
                              )}
                            >
                              {client.company}
                            </div>
                          )}
                          {client.lastReportAt && (
                            <div
                              className={cn(
                                "text-xs mt-1",
                                "text-neutral-500 dark:text-slate-500",
                              )}
                            >
                              Last report:{" "}
                              {formatRelativeFromNow(client.lastReportAt)}
                            </div>
                          )}
                          {(client as ClientWithReportFlag)._isFromReport && (
                            <div className="text-xs text-amber-400 mt-1">
                              From Report
                            </div>
                          )}
                        </td>
                        <td
                          className={cn(
                            "py-4 px-6",
                            "text-neutral-600 dark:text-slate-400",
                          )}
                        >
                          {client.email}
                        </td>
                        <td
                          className={cn(
                            "py-4 px-6",
                            "text-neutral-600 dark:text-slate-400",
                          )}
                        >
                          {client.phone || "—"}
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              client.status === "ACTIVE"
                                ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                : client.status === "INACTIVE"
                                  ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                                  : client.status === "PROSPECT"
                                    ? "bg-blue-500/20 text-blue-600 dark:text-blue-400"
                                    : cn(
                                        "bg-neutral-200 dark:bg-slate-500/20",
                                        "text-neutral-600 dark:text-slate-400",
                                      )
                            }`}
                          >
                            {client.status}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium">
                            {client.reportsCount || 0}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "py-4 px-6 font-medium",
                            "text-cyan-600 dark:text-cyan-400",
                          )}
                        >
                          $
                          {client.totalRevenue
                            ? client.totalRevenue.toLocaleString()
                            : "0"}
                        </td>
                        <td
                          className={cn(
                            "py-4 px-6",
                            "text-neutral-600 dark:text-slate-400",
                          )}
                        >
                          {client.lastJob || "—"}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <Link href={`/dashboard/clients/${client.id}`}>
                              <button
                                className="p-1 hover:bg-neutral-100 dark:hover:bg-slate-700 rounded transition-colors"
                                title="View"
                              >
                                <Eye size={16} />
                              </button>
                            </Link>
                            <button
                              onClick={() => openEditModal(client)}
                              className="p-1 hover:bg-neutral-100 dark:hover:bg-slate-700 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => duplicateClient(client.id)}
                              disabled={duplicating === client.id}
                              className="p-1 hover:bg-neutral-100 dark:hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                              title="Duplicate"
                            >
                              {duplicating === client.id ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-500"></div>
                              ) : (
                                <Copy size={16} />
                              )}
                            </button>
                            <button
                              onClick={() => openDeleteModal(client)}
                              className="p-1 hover:bg-neutral-100 dark:hover:bg-slate-700 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} className="text-rose-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <AddClientModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        form={form}
        onSubmit={handleAddClient}
      />

      <EditClientModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        form={form}
        onSubmit={handleEditClient}
      />

      <DeleteClientModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        client={selectedClient}
        onConfirm={handleDeleteClient}
      />

      <BulkDeleteModal
        open={showBulkDeleteModal}
        onOpenChange={setShowBulkDeleteModal}
        count={selectedClients.length}
        onConfirm={handleBulkDelete}
      />

      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        onUpgrade={() => {
          setShowUpgradeModal(false);
          router.push("/dashboard/pricing");
        }}
      />
    </div>
  );
}
