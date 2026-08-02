"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Download, Loader2, ChevronDown, Users } from "lucide-react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

export interface AnalyticsFiltersValue {
  dateRange: string;
  customFrom?: string;
  customTo?: string;
  hazardType?: string;
  status?: string;
  userId?: string; // For filtering by specific team member
}

interface AnalyticsFiltersProps {
  onFiltersChange: (filters: AnalyticsFiltersValue) => void;
  isLoading: boolean;
  onExport?: (format: "csv" | "excel" | "pdf") => Promise<void>;
}

const hazardTypes = [
  { value: "", label: "All Hazard Types" },
  { value: "Water", label: "Water Damage" },
  { value: "Fire", label: "Fire Damage" },
  { value: "Mould", label: "Mould" },
  { value: "Storm", label: "Storm" },
  { value: "Other", label: "Other" },
];

const statuses = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "COMPLETED", label: "Completed" },
];

type TeamMember = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "MANAGER" | "USER";
};

export default function AnalyticsFilters({
  onFiltersChange,
  isLoading,
  onExport,
}: AnalyticsFiltersProps) {
  const { data: session } = useSession();
  const [dateRange, setDateRange] = useState("30days");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [hazardType, setHazardType] = useState("");
  const [status, setStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";
  const isManager = session?.user?.role === "MANAGER";
  const canFilterByTeamMember = isAdmin || isManager;

  // Fetch team members for Admin and Manager
  useEffect(() => {
    if (canFilterByTeamMember) {
      const fetchTeamMembers = async () => {
        setLoadingMembers(true);
        try {
          const res = await fetch("/api/team/members");
          if (res.ok) {
            const json = await res.json();
            let filtered = (json.members || []).filter(
              (m: TeamMember) => m.id !== session?.user?.id,
            );

            // Admin: Show Managers and Technicians
            // Manager: Show only Technicians (their direct reports)
            if (isManager) {
              filtered = filtered.filter((m: TeamMember) => m.role === "USER");
            } else if (isAdmin) {
              filtered = filtered.filter((m: TeamMember) => m.role !== "ADMIN");
            }

            setTeamMembers(filtered);
          }
        } catch (err) {
          console.error("Failed to load team members:", err);
        } finally {
          setLoadingMembers(false);
        }
      };
      fetchTeamMembers();
    }
  }, [canFilterByTeamMember, isAdmin, isManager, session?.user?.id]);

  const handleDateRangeChange = (newRange: string) => {
    setDateRange(newRange);
    onFiltersChange({
      dateRange: newRange,
      customFrom: newRange === "custom" ? customFrom : undefined,
      customTo: newRange === "custom" ? customTo : undefined,
      hazardType: hazardType || undefined,
      status: status || undefined,
      userId: selectedUserId || undefined,
    });
  };

  const handleCustomDateChange = () => {
    if (customFrom && customTo) {
      onFiltersChange({
        dateRange: "custom",
        customFrom,
        customTo,
        hazardType: hazardType || undefined,
        status: status || undefined,
        userId: selectedUserId || undefined,
      });
    }
  };

  const handleFilterChange = (
    newHazard?: string,
    newStatus?: string,
    newUserId?: string,
  ) => {
    if (newHazard !== undefined) setHazardType(newHazard);
    if (newStatus !== undefined) setStatus(newStatus);
    if (newUserId !== undefined) setSelectedUserId(newUserId);

    onFiltersChange({
      dateRange,
      customFrom: dateRange === "custom" ? customFrom : undefined,
      customTo: dateRange === "custom" ? customTo : undefined,
      hazardType:
        newHazard !== undefined
          ? newHazard || undefined
          : hazardType || undefined,
      status:
        newStatus !== undefined ? newStatus || undefined : status || undefined,
      userId:
        newUserId !== undefined
          ? newUserId || undefined
          : selectedUserId || undefined,
    });
  };

  const handleExport = async (format: "csv" | "excel" | "pdf") => {
    if (!onExport) {
      toast.error("Export not configured");
      return;
    }

    try {
      setExportLoading(true);
      await onExport(format);
      toast.success(`Exporting as ${format.toUpperCase()}...`);
      setShowExportMenu(false);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(`Failed to export ${format}`);
    } finally {
      setExportLoading(false);
    }
  };

  const controlClass = cn(
    "h-9 px-3 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:opacity-50",
    "bg-background border border-neutral-200 dark:border-slate-700/60 text-foreground",
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Date range
          </label>
          <select
            value={dateRange}
            onChange={(e) => handleDateRangeChange(e.target.value)}
            disabled={isLoading}
            className={controlClass}
          >
            <option value="7days">Last 7 days</option>
            <option value="14days">Last 14 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom range</option>
          </select>
        </div>

        {dateRange === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              onBlur={handleCustomDateChange}
              className={controlClass}
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              onBlur={handleCustomDateChange}
              className={controlClass}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Hazard
          </label>
          <select
            value={hazardType}
            onChange={(e) => handleFilterChange(e.target.value, undefined)}
            disabled={isLoading}
            className={controlClass}
          >
            {hazardTypes.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => handleFilterChange(undefined, e.target.value)}
            disabled={isLoading}
            className={controlClass}
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {canFilterByTeamMember && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {isManager ? "Technician" : "Team member"}
            </label>
            <select
              value={selectedUserId}
              onChange={(e) =>
                handleFilterChange(undefined, undefined, e.target.value)
              }
              disabled={isLoading || loadingMembers}
              className={cn(controlClass, "min-w-[180px]")}
            >
              <option value="">
                All {isManager ? "technicians" : "team members"}
              </option>
              {loadingMembers ? (
                <option value="" disabled>
                  Loading…
                </option>
              ) : teamMembers.length > 0 ? (
                teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name || member.email} (
                    {member.role === "MANAGER" ? "Manager" : "Technician"})
                  </option>
                ))
              ) : (
                <option value="" disabled>
                  No {isManager ? "technicians" : "team members"} available
                </option>
              )}
            </select>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 size={14} className="animate-spin text-cyan-500" />
            <span className="text-xs">Updating…</span>
          </div>
        )}
      </div>

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowExportMenu(!showExportMenu)}
          disabled={exportLoading || isLoading}
          className={cn(
            "inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm font-medium transition-colors disabled:opacity-50",
            "border border-neutral-200 dark:border-slate-700/60 bg-background text-foreground hover:bg-muted",
          )}
        >
          {exportLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Download size={16} />
          )}
          Export
          <ChevronDown size={14} />
        </button>

        {showExportMenu && (
          <div className="absolute right-0 mt-2 w-48 rounded-md border border-neutral-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/50 shadow-lg z-50 overflow-hidden">
            <button
              type="button"
              onClick={() => handleExport("csv")}
              className="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              Export as CSV
            </button>
            <button
              type="button"
              onClick={() => handleExport("excel")}
              className="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              Export as Excel
            </button>
            <button
              type="button"
              onClick={() => handleExport("pdf")}
              className="block w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted"
            >
              Export as PDF
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
