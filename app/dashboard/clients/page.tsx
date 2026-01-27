"use client"

import { Crown, Filter, Plus, Search, Trash2, X, XIcon, Users, Copy, Edit, Eye } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import toast from "react-hot-toast"
import { cn } from "@/lib/utils"

interface Client {
  id: string
  name: string
  email: string
  phone?: string
  address?: string
  company?: string    
  contactPerson?: string
  notes?: string
  status: string
  createdAt: string
  updatedAt: string
  totalRevenue: number
  lastJob: string
  reportsCount: number
}

export default function ClientsPage() {
  const router = useRouter()
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [selectedClients, setSelectedClients] = useState<string[]>([])
  const [duplicating, setDuplicating] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    company: "",
    contactPerson: "",
    notes: "",
    status: "ACTIVE"
  })

  // Fetch clients from API
  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/clients")
      if (response.ok) {
        const data = await response.json()
        setClients(data.clients)
      } else {
        toast.error("Failed to fetch clients")
      }
    } catch (error) {
      console.error("Error fetching clients:", error)
      toast.error("Failed to fetch clients")
    } finally {
      setLoading(false)
    }
  }

  const filteredClients = useMemo(() => {
    return clients.filter((client) => {
      const matchesSearch = 
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        client.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.phone && client.phone.includes(searchTerm)) ||
        (client.company && client.company.toLowerCase().includes(searchTerm.toLowerCase()))
      
      const matchesStatus = !statusFilter || client.status === statusFilter
      
      return matchesSearch && matchesStatus
    })
  }, [searchTerm, statusFilter, clients])

  const handleAddClient = async () => {
    if (!formData.name || !formData.email) {
      toast.error("Name and email are required")
      return
    }

    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const newClient = await response.json()
        setClients([newClient, ...clients])
        setFormData({ name: "", email: "", phone: "", address: "", company: "", contactPerson: "", notes: "", status: "ACTIVE" })
        setShowAddModal(false)
        toast.success("Client added successfully")
        fetchClients() // Refresh to get updated list
      } else {
        const error = await response.json()
        if (response.status === 402 && error.upgradeRequired) {
          // Show upgrade modal instead of error toast
          setShowAddModal(false)
          setShowUpgradeModal(true)
        } else {
          toast.error(error.error || "Failed to add client")
        }
      }
    } catch (error) {
      console.error("Error adding client:", error)
      toast.error("Failed to add client")
    }
  }

  const handleEditClient = async () => {
    if (!selectedClient || !formData.name || !formData.email) {
      toast.error("Name and email are required")
      return
    }

    try {
      const response = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const updatedClient = await response.json()
        setClients(clients.map(c => c.id === selectedClient.id ? updatedClient : c))
        setShowEditModal(false)
        setSelectedClient(null)
        toast.success("Client updated successfully")
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to update client")
      }
    } catch (error) {
      console.error("Error updating client:", error)
      toast.error("Failed to update client")
    }
  }

  const handleDeleteClient = async () => {
    if (!selectedClient) return

    // Check if this is a report-based client (can't delete, it's derived from reports)
    if ((selectedClient as any)._isFromReport) {
      toast("This client was created from a report. It will disappear once all related reports are deleted or linked to a real client.", {
        icon: 'ℹ️',
        duration: 4000,
      })
      setShowDeleteModal(false)
      setSelectedClient(null)
      return
    }

    try {
      const response = await fetch(`/api/clients/${selectedClient.id}`, {
        method: "DELETE"
      })

      if (response.ok) {
        setClients(clients.filter(c => c.id !== selectedClient.id))
        setShowDeleteModal(false)
        setSelectedClient(null)
        toast.success("Client deleted successfully")
        fetchClients() // Refresh to get updated list
      } else {
        const error = await response.json()
        toast.error(error.error || "Failed to delete client")
      }
    } catch (error) {
      console.error("Error deleting client:", error)
      toast.error("Failed to delete client")
    }
  }

  const openEditModal = (client: Client) => {
    // Check if this is a report-based client (can't edit directly, need to create real client)
    if ((client as any)._isFromReport) {
      toast("This client was created from a report. Please create a new client record to edit.", {
        icon: 'ℹ️',
        duration: 4000,
      })
      // Pre-fill the form with the report client's data
      setFormData({
        name: client.name,
        email: client.email,
        phone: client.phone || "",
        address: client.address || "",
        company: client.company || "",
        contactPerson: client.contactPerson || "",
        notes: client.notes || "",
        status: client.status
      })
      setShowAddModal(true)
      return
    }
    
    setSelectedClient(client)
    setFormData({
      name: client.name,
      email: client.email,
      phone: client.phone || "",
      address: client.address || "",
      company: client.company || "",
      contactPerson: client.contactPerson || "",
      notes: client.notes || "",
      status: client.status
    })
    setShowEditModal(true)
  }

  const openDeleteModal = (client: Client) => {
    setSelectedClient(client)
    setShowDeleteModal(true)
  }

  // Duplicate client function
  const duplicateClient = async (clientId: string) => {
    try {
      setDuplicating(clientId)
      const response = await fetch(`/api/clients/${clientId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
      
      if (response.ok) {
        const newClient = await response.json()
        setClients([newClient, ...clients])
        toast.success("Client duplicated successfully")
      } else {
        toast.error("Failed to duplicate client")
      }
    } catch (error) {
      console.error('Error duplicating client:', error)
      toast.error("Failed to duplicate client")
    } finally {
      setDuplicating(null)
    }
  }

  // Bulk delete functions
  const handleBulkDelete = async () => {
    if (selectedClients.length === 0) return

    try {
      const response = await fetch('/api/clients/bulk-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids: selectedClients })
      })

      if (response.ok) {
        setClients(clients.filter(c => !selectedClients.includes(c.id)))
        setSelectedClients([])
        setShowBulkDeleteModal(false)
        toast.success(`${selectedClients.length} clients deleted successfully`)
      } else {
        toast.error("Failed to delete clients")
      }
    } catch (error) {
      console.error('Error deleting clients:', error)
      toast.error("Failed to delete clients")
    }
  }

  const toggleClientSelection = (clientId: string) => {
    setSelectedClients(prev => 
      prev.includes(clientId) 
        ? prev.filter(id => id !== clientId)
        : [...prev, clientId]
    )
  }

  const selectAllClients = () => {
    setSelectedClients(filteredClients.map(c => c.id))
  }

  const clearSelection = () => {
    setSelectedClients([])
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={cn("text-3xl font-semibold mb-2", "text-neutral-900 dark:text-white")}>Clients</h1>
          <p className={cn("text-neutral-600 dark:text-slate-400")}>Manage your restoration clients</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedClients.length > 0 && (
            <div className="flex items-center gap-2">
              <span className={cn("text-sm", "text-neutral-600 dark:text-slate-400")}>{selectedClients.length} selected</span>
              <button
                onClick={() => setShowBulkDeleteModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500/20 to-rose-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg hover:from-red-500/30 hover:to-rose-500/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md group"
              >
                <Trash2 size={16} className="transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                <span>Delete Selected</span>
              </button>
              <button
                onClick={clearSelection}
                className={cn(
                  "px-4 py-2 border rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md",
                  "border-neutral-300 dark:border-slate-600",
                  "hover:bg-neutral-100 dark:hover:bg-slate-800",
                  "text-neutral-700 dark:text-slate-300"
                )}
              >
                Clear
              </button>
            </div>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group"
          >
            <Plus size={20} className="transition-transform duration-200 group-hover:rotate-90 group-hover:scale-110" />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className={cn("absolute left-3 top-1/2 transform -translate-y-1/2", "text-neutral-500 dark:text-slate-400")} size={18} />
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
              "placeholder-neutral-500 dark:placeholder-slate-500"
            )}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className={cn("text-neutral-500 dark:text-slate-400")} size={18} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={cn(
              "px-3 py-2 border rounded-lg focus:outline-none focus:border-cyan-500",
              "bg-neutral-100 dark:bg-slate-800",
              "border-neutral-300 dark:border-slate-700",
              "text-neutral-900 dark:text-white"
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
          <div className={cn("rounded-lg border overflow-hidden", "border-neutral-200 dark:border-slate-700/50", "bg-white dark:bg-slate-800/30")}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn("border-b", "border-neutral-200 dark:border-slate-700", "bg-neutral-50 dark:bg-slate-900/50")}>
                    {/* <th className="text-left py-4 px-6 text-slate-400 font-medium">
                      <button
                        onClick={selectedClients.length === filteredClients.length ? clearSelection : selectAllClients}
                        className="flex items-center gap-2 hover:text-white transition-colors"
                      >
                        {selectedClients.length === filteredClients.length ? (
                          <CheckSquare size={16} />
                        ) : (
                          <Square size={16} />
                        )}
                        Select All
                      </button>
                    </th> */}
                    <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Client Name</th>
                    <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Email</th>
                    <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Phone</th>
                    <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Status</th>
                    <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Reports</th>
                    <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Total Revenue</th>
                    <th className={cn("text-left py-4 px-6 font-medium", "text-neutral-700 dark:text-slate-400")}>Last Job</th>
                    {/* <th className="text-left py-4 px-6 text-slate-400 font-medium">Actions</th> */}
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={9} className={cn("py-12 text-center", "text-neutral-600 dark:text-slate-400")}>
                        {searchTerm || statusFilter ? "No clients found matching your criteria" : "No clients found. Add your first client to get started."}
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client) => (
                      <tr key={client.id} className={cn("border-b transition-colors", "border-neutral-200 dark:border-slate-700/50", "hover:bg-neutral-50 dark:hover:bg-slate-700/30")}>
                        {/* <td className="py-4 px-6">
                          <button
                            onClick={() => toggleClientSelection(client.id)}
                            className="flex items-center gap-2 hover:text-white transition-colors"
                          >
                            {selectedClients.includes(client.id) ? (
                              <CheckSquare size={16} className="text-cyan-400" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </td> */}
                        <td className="py-4 px-6 font-medium">
                          {(client as any)._isFromReport ? (
                            <span className="text-cyan-400">{client.name}</span>
                          ) : (
                            <Link href={`/dashboard/clients/${client.id}`} className="text-cyan-400 hover:underline">
                              {client.name}
                            </Link>
                          )}
                          {client.company && (
                            <div className={cn("text-xs mt-1", "text-neutral-500 dark:text-slate-500")}>{client.company}</div>
                          )}
                          {(client as any)._isFromReport && (
                            <div className="text-xs text-amber-400 mt-1">From Report</div>
                          )}
                        </td>
                        <td className={cn("py-4 px-6", "text-neutral-600 dark:text-slate-400")}>{client.email}</td>
                        <td className={cn("py-4 px-6", "text-neutral-600 dark:text-slate-400")}>{client.phone || "—"}</td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            client.status === "ACTIVE" ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                            client.status === "INACTIVE" ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" :
                            client.status === "PROSPECT" ? "bg-blue-500/20 text-blue-600 dark:text-blue-400" :
                            cn("bg-neutral-200 dark:bg-slate-500/20", "text-neutral-600 dark:text-slate-400")
                          }`}>
                            {client.status}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium">
                            {client.reportsCount || 0}
                          </span>
                        </td>
                        <td className={cn("py-4 px-6 font-medium", "text-cyan-600 dark:text-cyan-400")}>
                          ${client.totalRevenue ? client.totalRevenue.toLocaleString() : '0'}
                        </td>
                        <td className={cn("py-4 px-6", "text-neutral-600 dark:text-slate-400")}>{client.lastJob || "—"}</td>
                        {/* <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <Link href={`/dashboard/clients/${client.id}`}>
                              <button className="p-1 hover:bg-slate-700 rounded transition-colors" title="View">
                                <Eye size={16} />
                              </button>
                            </Link>
                            <button 
                              onClick={() => openEditModal(client)}
                              className="p-1 hover:bg-slate-700 rounded transition-colors" 
                              title="Edit"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => duplicateClient(client.id)}
                              disabled={duplicating === client.id}
                              className="p-1 hover:bg-slate-700 rounded transition-colors disabled:opacity-50" 
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
                              className="p-1 hover:bg-slate-700 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} className="text-rose-400" />
                            </button>
                          </div>
                        </td> */}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className={cn("rounded-lg border max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto", "bg-white dark:bg-slate-800", "border-neutral-200 dark:border-slate-700")}>
            <div className="flex items-center justify-between mb-4">
              <h2 className={cn("text-xl font-semibold", "text-neutral-900 dark:text-white")}>Add New Client</h2>
              <button 
                onClick={() => setShowAddModal(false)} 
                className={cn("p-1 rounded transition-all duration-200 hover:scale-110 active:scale-95", "hover:bg-neutral-100 dark:hover:bg-slate-700", "text-neutral-700 dark:text-slate-300")}
                title="Close"
              >
                <X size={20} className="transition-transform duration-200" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Client Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter client name"
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                      "bg-white dark:bg-slate-700/50",
                      "border-neutral-300 dark:border-slate-600",
                      "text-neutral-900 dark:text-white",
                      "placeholder-neutral-500 dark:placeholder-slate-500"
                    )}
                  />
                </div>
                <div>
                  <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                      "bg-white dark:bg-slate-700/50",
                      "border-neutral-300 dark:border-slate-600",
                      "text-neutral-900 dark:text-white",
                      "placeholder-neutral-500 dark:placeholder-slate-500"
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Enter phone number"
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                      "bg-white dark:bg-slate-700/50",
                      "border-neutral-300 dark:border-slate-600",
                      "text-neutral-900 dark:text-white",
                      "placeholder-neutral-500 dark:placeholder-slate-500"
                    )}
                  />
                </div>
                <div>
                  <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className={cn(
                      "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                      "bg-white dark:bg-slate-700/50",
                      "border-neutral-300 dark:border-slate-600",
                      "text-neutral-900 dark:text-white"
                    )}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="PROSPECT">Prospect</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>
              <div>
                <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Company</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Enter company name"
                  className={cn(
                    "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                    "bg-white dark:bg-slate-700/50",
                    "border-neutral-300 dark:border-slate-600",
                    "text-neutral-900 dark:text-white",
                    "placeholder-neutral-500 dark:placeholder-slate-500"
                  )}
                />
              </div>
              <div>
                <label className={cn("block text-sm font-medium mb-2", "text-neutral-700 dark:text-slate-300")}>Contact Person</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="Enter contact person name"
                  className={cn(
                    "w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50",
                    "bg-white dark:bg-slate-700/50",
                    "border-neutral-300 dark:border-slate-600",
                    "text-neutral-900 dark:text-white",
                    "placeholder-neutral-500 dark:placeholder-slate-500"
                  )}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter address"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Enter any additional notes"
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddClient}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group"
                >
                  <Users className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Add Client</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Edit Client</h2>
              <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Client Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter client name"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Enter phone number"
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="PROSPECT">Prospect</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Company</label>
                <input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Enter company name"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Contact Person</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                  placeholder="Enter contact person name"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter address"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Enter any additional notes"
                  rows={3}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditClient}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group"
                >
                  <Edit className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Update Client</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Client Modal */}
      {showDeleteModal && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-red-400">Delete Client</h2>
              <button onClick={() => setShowDeleteModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-slate-300">
                Are you sure you want to delete <span className="font-medium text-white">{selectedClient.name}</span>? 
                This action cannot be undone.
              </p>
              {selectedClient.reportsCount > 0 && (
                <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4">
                  <p className="text-amber-300 text-sm">
                    ⚠️ This client has {selectedClient.reportsCount} report(s). 
                    You may want to archive instead of delete to preserve report history.
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteClient}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-rose-500 rounded-lg font-medium hover:shadow-lg hover:shadow-red-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group"
                >
                  <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Delete Client</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-red-400">Delete Selected Clients</h2>
              <button onClick={() => setShowBulkDeleteModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-slate-300">
                Are you sure you want to delete <span className="font-medium text-white">{selectedClients.length}</span> selected client(s)? 
                This action cannot be undone.
              </p>
              <div className="bg-amber-500/20 border border-amber-500/30 rounded-lg p-4">
                <p className="text-amber-300 text-sm">
                  ⚠️ This will permanently delete all selected clients and their associated data.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-red-500 to-rose-500 rounded-lg font-medium hover:shadow-lg hover:shadow-red-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group"
                >
                  <Trash2 className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Delete {selectedClients.length} Client(s)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-neutral-200 dark:border-slate-700 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
                  <Crown className="text-white" size={24} />
                </div>
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Upgrade Required</h2>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="p-1 hover:bg-neutral-100 dark:hover:bg-slate-700 rounded text-neutral-600 dark:text-slate-300">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-neutral-700 dark:text-slate-300">
                To create clients, you need an active subscription (Monthly or Yearly plan).
              </p>
              <p className="text-sm text-neutral-600 dark:text-slate-400">
                Upgrade now to unlock all features including unlimited clients, reports, API integrations, and priority support.
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 px-4 py-2 border border-neutral-300 dark:border-slate-600 rounded-lg hover:bg-neutral-50 dark:hover:bg-slate-700/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md text-neutral-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowUpgradeModal(false)
                    router.push('/dashboard/pricing')
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-orange-500/50 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 group text-white"
                >
                  <Crown className="w-4 h-4 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                  <span>Upgrade Now</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
