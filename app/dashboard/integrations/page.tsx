"use client"

import { useState, useEffect } from "react"
import { Check, X, Settings, XIcon, Plus, Trash2 } from "lucide-react"
import toast from "react-hot-toast"

interface Integration {
  id: string
  name: string
  description?: string
  icon?: string
  status: "CONNECTED" | "DISCONNECTED" | "ERROR"
  apiKey?: string
  config?: string
  createdAt: string
  updatedAt: string
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [showApiModal, setShowApiModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: ""
  })

  // Fetch integrations from API
  useEffect(() => {
    fetchIntegrations()
  }, [])

  const fetchIntegrations = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/integrations")
      if (response.ok) {
        const data = await response.json()
        setIntegrations(data.integrations)
      } else {
        toast.error("Failed to fetch integrations")
      }
    } catch (error) {
      console.error("Error fetching integrations:", error)
      toast.error("Failed to fetch integrations")
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = (integration: Integration) => {
    setSelectedIntegration(integration)
    setApiKey("")
    setShowApiModal(true)
  }

  const handleSaveConnection = async () => {
    if (!selectedIntegration) return

    try {
      const response = await fetch(`/api/integrations/${selectedIntegration.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selectedIntegration,
          apiKey,
          status: apiKey ? "CONNECTED" : "DISCONNECTED"
        })
      })

      if (response.ok) {
        const updatedIntegration = await response.json()
        setIntegrations(integrations.map(int => 
          int.id === selectedIntegration.id ? updatedIntegration : int
        ))
        setShowApiModal(false)
        toast.success("Integration updated successfully")
      } else {
        toast.error("Failed to update integration")
      }
    } catch (error) {
      console.error("Error updating integration:", error)
      toast.error("Failed to update integration")
    }
  }

  const handleDisconnect = async (id: string) => {
    try {
      const response = await fetch(`/api/integrations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "DISCONNECTED",
          apiKey: null
        })
      })

      if (response.ok) {
        const updatedIntegration = await response.json()
        setIntegrations(integrations.map(int => 
          int.id === id ? updatedIntegration : int
        ))
        toast.success("Integration disconnected")
      } else {
        toast.error("Failed to disconnect integration")
      }
    } catch (error) {
      console.error("Error disconnecting integration:", error)
      toast.error("Failed to disconnect integration")
    }
  }

  const handleAddIntegration = async () => {
    if (!formData.name) {
      toast.error("Name is required")
      return
    }

    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        const newIntegration = await response.json()
        setIntegrations([newIntegration, ...integrations])
        setFormData({ name: "", description: "", icon: "" })
        setShowAddModal(false)
        toast.success("Integration added successfully")
      } else {
        toast.error("Failed to add integration")
      }
    } catch (error) {
      console.error("Error adding integration:", error)
      toast.error("Failed to add integration")
    }
  }

  const handleDeleteIntegration = async (id: string) => {
    if (!confirm("Are you sure you want to delete this integration?")) return

    try {
      const response = await fetch(`/api/integrations/${id}`, {
        method: "DELETE"
      })

      if (response.ok) {
        setIntegrations(integrations.filter(int => int.id !== id))
        toast.success("Integration deleted successfully")
      } else {
        toast.error("Failed to delete integration")
      }
    } catch (error) {
      console.error("Error deleting integration:", error)
      toast.error("Failed to delete integration")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-2">Integrations</h1>
          <p className="text-slate-400">Connect your tools and services to Restore Assist</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
        >
          <Plus size={20} />
          Add Integration
        </button>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      ) : (
        <>
          {/* Integration Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {integrations.length === 0 ? (
              <div className="col-span-2 text-center py-12">
                <p className="text-slate-400">No integrations yet. Add your first integration to get started.</p>
              </div>
            ) : (
              integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{integration.icon || "🔗"}</div>
                      <div>
                        <h3 className="font-semibold">{integration.name}</h3>
                        <p className="text-sm text-slate-400 mt-1">{integration.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {integration.status === "CONNECTED" ? (
                        <Check size={20} className="text-emerald-400 flex-shrink-0" />
                      ) : (
                        <X size={20} className="text-slate-500 flex-shrink-0" />
                      )}
                      <button
                        onClick={() => handleDeleteIntegration(integration.id)}
                        className="p-1 hover:bg-slate-700 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} className="text-rose-400" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {integration.status === "CONNECTED" ? (
                      <>
                        <button
                          onClick={() => handleConnect(integration)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm"
                        >
                          <Settings size={16} />
                          Settings
                        </button>
                        <button
                          onClick={() => handleDisconnect(integration.id)}
                          className="flex-1 px-4 py-2 border border-rose-600 text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors text-sm"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleConnect(integration)}
                        className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-sm"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* API Key Modal */}
      {showApiModal && selectedIntegration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{selectedIntegration.name}</h2>
              <button onClick={() => setShowApiModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
                <p className="text-xs text-slate-400 mt-2">
                  Your API key is encrypted and stored securely. We'll never share it with third parties.
                </p>
              </div>
              <button className="w-full px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors text-sm">
                Test Connection
              </button>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowApiModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConnection}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Integration Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Add New Integration</h2>
              <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Integration Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Ascora CRM"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the integration"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Icon (Emoji)</label>
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="🔗"
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddIntegration}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                >
                  Add Integration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
