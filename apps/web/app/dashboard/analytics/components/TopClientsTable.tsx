"use client"

import { useState } from "react"
import { ChevronUp, ChevronDown, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ClientData {
  clientId?: string
  name: string
  reports: number
  revenue: number | string
  avgValue?: number | string
}

interface TopClientsTableProps {
  data: ClientData[]
  loading?: boolean
}

type SortField = "name" | "reports" | "revenue" | "avgValue"
type SortDirection = "asc" | "desc"

export default function TopClientsTable({
  data,
  loading = false,
}: TopClientsTableProps) {
  const [sortField, setSortField] = useState<SortField>("revenue")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  if (loading) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <div className="h-[400px] flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mx-auto" />
            <p className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>Loading data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
        <h3 className={cn("font-semibold mb-4", "text-neutral-900 dark:text-slate-200")}>Top Clients by Revenue</h3>
        <div className={cn("flex items-center justify-center h-[300px]", "text-neutral-600 dark:text-slate-400")}>
          No client data available
        </div>
      </div>
    )
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("desc")
    }
  }

  // Convert revenue to numbers for sorting
  const parseRevenue = (rev: number | string): number => {
    if (typeof rev === "number") return rev
    return parseInt(rev.toString().replace(/\D/g, ""), 10)
  }

  const parseValue = (val: any): number => {
    if (typeof val === "number") return val
    if (typeof val === "string") return parseInt(val.replace(/\D/g, ""), 10)
    return 0
  }

  const sortedData = [...data].sort((a, b) => {
    let aVal: number | string
    let bVal: number | string

    switch (sortField) {
      case "name":
        aVal = a.name
        bVal = b.name
        break
      case "reports":
        aVal = a.reports
        bVal = b.reports
        break
      case "revenue":
        aVal = parseRevenue(a.revenue)
        bVal = parseRevenue(b.revenue)
        break
      case "avgValue":
        aVal = parseValue(a.avgValue)
        bVal = parseValue(b.avgValue)
        break
      default:
        aVal = parseRevenue(a.revenue)
        bVal = parseRevenue(b.revenue)
    }

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDirection === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }

    const aNum = typeof aVal === "number" ? aVal : 0
    const bNum = typeof bVal === "number" ? bVal : 0

    return sortDirection === "asc" ? aNum - bNum : bNum - aNum
  })

  const SortIcon = ({
    field,
  }: {
    field: SortField
  }) => {
    if (sortField !== field) return <div className="w-4 h-4" />
    return sortDirection === "asc" ? (
      <ChevronUp size={16} />
    ) : (
      <ChevronDown size={16} />
    )
  }

  return (
    <div className={cn("p-6 rounded-lg border", "border-neutral-200 dark:border-slate-700/50", "bg-white/50 dark:bg-slate-800/30")}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={cn("font-semibold text-lg", "text-neutral-900 dark:text-slate-200")}>Top Clients by Revenue</h3>
        <span className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>{data.length} clients</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={cn("border-b", "border-neutral-200 dark:border-slate-700")}>
              <th
                className={cn("px-4 py-3 text-left text-xs font-semibold cursor-pointer", "text-neutral-700 dark:text-slate-300", "hover:text-neutral-900 dark:hover:text-slate-200")}
                onClick={() => handleSort("name")}
              >
                <div className="flex items-center gap-2">
                  Client Name
                  <SortIcon field="name" />
                </div>
              </th>
              <th
                className={cn("px-4 py-3 text-right text-xs font-semibold cursor-pointer", "text-neutral-700 dark:text-slate-300", "hover:text-neutral-900 dark:hover:text-slate-200")}
                onClick={() => handleSort("reports")}
              >
                <div className="flex items-center justify-end gap-2">
                  Reports
                  <SortIcon field="reports" />
                </div>
              </th>
              <th
                className={cn("px-4 py-3 text-right text-xs font-semibold cursor-pointer", "text-neutral-700 dark:text-slate-300", "hover:text-neutral-900 dark:hover:text-slate-200")}
                onClick={() => handleSort("revenue")}
              >
                <div className="flex items-center justify-end gap-2">
                  Revenue
                  <SortIcon field="revenue" />
                </div>
              </th>
              <th className={cn("px-4 py-3 text-right text-xs font-semibold", "text-neutral-700 dark:text-slate-300")}>
                Avg Value
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((client, index) => (
              <tr
                key={index}
                className={cn("border-b transition-colors", "border-neutral-200 dark:border-slate-700/30", "hover:bg-neutral-50 dark:hover:bg-slate-700/10")}
              >
                <td className="px-4 py-3">
                  <div>
                    <p className={cn("font-medium", "text-neutral-900 dark:text-slate-200")}>{client.name}</p>
                    <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>
                      #{index + 1} Client
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300 text-xs font-medium">
                    {client.reports}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {typeof client.revenue === "number"
                      ? `$${client.revenue.toLocaleString()}`
                      : client.revenue}
                  </p>
                </td>
                <td className={cn("px-4 py-3 text-right", "text-neutral-700 dark:text-slate-300")}>
                  {typeof client.avgValue === "number"
                    ? `$${client.avgValue.toLocaleString()}`
                    : client.avgValue || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary footer */}
      <div className={cn("mt-4 pt-4 border-t flex justify-between text-sm", "border-neutral-200 dark:border-slate-700")}>
        <span className={cn("text-neutral-600 dark:text-slate-400")}>Total for top clients</span>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          ${sortedData
            .reduce((sum, client) => sum + parseRevenue(client.revenue), 0)
            .toLocaleString()}
        </span>
      </div>
    </div>
  )
}
