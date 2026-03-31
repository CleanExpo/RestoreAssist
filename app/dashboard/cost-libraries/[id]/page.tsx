"use client"

import { useState, useEffect, use } from "react"
import { ArrowLeft, Search, Trash2, Download } from "lucide-react"
import Link from "next/link"
import toast from "react-hot-toast"

interface CostItem {
  id: string
  category: string
  description: string
  rate: number
  unit: string
  createdAt: string
}

interface CostLibrary {
  id: string
  name: string
  region: string
  description?: string
  isDefault: boolean
  items: CostItem[]
  _count: { items: number }
}

export default function CostLibraryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  const [library, setLibrary] = useState<CostLibrary | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")

  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/cost-libraries/${id}`)
        if (!res.ok) {
          toast.error("Failed to load cost library")
          return
        }
        const data = await res.json()
        const lib: CostLibrary = data.library ?? data
        setLibrary(lib)
      } catch (err) {
        console.error("Error fetching cost library:", err)
        toast.error("Failed to load cost library")
      } finally {
        setLoading(false)
      }
    }
    fetchLibrary()
  }, [id])

  const categories = library
    ? Array.from(new Set(library.items.map((i) => i.category))).sort()
    : []

  const filteredItems = library
    ? library.items.filter((item) => {
        const matchesSearch =
          search === "" ||
          item.description.toLowerCase().includes(search.toLowerCase()) ||
          item.category.toLowerCase().includes(search.toLowerCase())
        const matchesCategory =
          categoryFilter === "" || item.category === categoryFilter
        return matchesSearch && matchesCategory
      })
    : []

  const handleDeleteItem = async (itemId: string) => {
    if (!library) return
    try {
      const res = await fetch(`/api/cost-items/${itemId}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error("Failed to delete item")
        return
      }
      setLibrary({
        ...library,
        items: library.items.filter((i) => i.id !== itemId),
        _count: { items: library._count.items - 1 },
      })
      toast.success("Item deleted")
    } catch (err) {
      console.error("Error deleting cost item:", err)
      toast.error("Failed to delete item")
    }
  }

  const exportCSV = () => {
    if (!library) return
    const rows = [
      ["Category", "Description", "Rate (AUD)", "Unit"],
      ...filteredItems.map((i) => [
        i.category,
        i.description,
        i.rate.toFixed(2),
        i.unit,
      ]),
    ]
    const csv = rows
      .map((r) => r.map((cell) => `"${cell}"`).join(","))
      .join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${library.name}-items.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (!library) {
    return (
      <div className="space-y-6">
        <Link
          href="/dashboard/cost-libraries"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Back to Cost Libraries
        </Link>
        <p className="text-slate-400">Library not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/cost-libraries"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
      >
        <ArrowLeft size={16} />
        Back to Cost Libraries
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{library.name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="text-slate-400 text-sm">Region: {library.region}</span>
            <span className="text-slate-500 text-sm">•</span>
            <span className="text-slate-400 text-sm">
              {library._count.items} item{library._count.items !== 1 ? "s" : ""}
            </span>
            {library.isDefault && (
              <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">
                Default
              </span>
            )}
          </div>
          {library.description && (
            <p className="text-slate-400 text-sm mt-2">{library.description}</p>
          )}
        </div>
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm whitespace-nowrap"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search by description or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {/* Items table */}
      {filteredItems.length === 0 ? (
        <div className="p-12 rounded-lg border border-slate-700/50 bg-slate-800/30 text-center">
          <p className="text-slate-400">
            {library.items.length === 0
              ? "No items in this library yet."
              : "No items match your search."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/60">
                  <th className="text-left px-4 py-3 font-medium text-slate-300">
                    Category
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">
                    Description
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-slate-300">
                    Rate (AU$)
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-slate-300">
                    Unit
                  </th>
                  <th className="text-center px-4 py-3 font-medium text-slate-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-300">{item.category}</td>
                    <td className="px-4 py-3 text-slate-100">{item.description}</td>
                    <td className="px-4 py-3 text-right font-medium text-cyan-400">
                      ${item.rate.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{item.unit}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 hover:bg-slate-600 rounded transition-colors"
                        title="Delete item"
                      >
                        <Trash2 size={16} className="text-rose-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-slate-700/30 text-xs text-slate-500">
            Showing {filteredItems.length} of {library._count.items} item
            {library._count.items !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  )
}
