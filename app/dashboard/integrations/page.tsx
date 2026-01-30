"use client"

import { useState, useEffect } from "react"
import { Check, X, XIcon, Plus, Trash2, Crown, RefreshCw, Loader2, ExternalLink, Download } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter, useSearchParams } from "next/navigation"
import ImportModal from "@/components/integrations/ImportModal"

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

interface ExternalIntegration {
  provider: string
  connected: boolean
  status: "CONNECTED" | "DISCONNECTED" | "ERROR" | "SYNCING"
  lastSyncAt?: string
  syncError?: string
  counts?: {
    clients: number
    jobs: number
  }
}

type ProviderSlug = 'xero' | 'quickbooks' | 'myob' | 'servicem8' | 'ascora'

const EXTERNAL_INTEGRATIONS: {
  slug: ProviderSlug
  name: string
  description: string
  icon: string
  category: 'bookkeeping' | 'jobmanagement'
}[] = [
  { slug: 'xero', name: 'Xero', description: 'Sync clients and invoices from Xero', icon: '📊', category: 'bookkeeping' },
  { slug: 'quickbooks', name: 'QuickBooks', description: 'Sync customers and transactions from QuickBooks', icon: '📊', category: 'bookkeeping' },
  { slug: 'myob', name: 'MYOB', description: 'Sync contacts and jobs from MYOB', icon: '📊', category: 'bookkeeping' },
  { slug: 'servicem8', name: 'ServiceM8', description: 'Sync clients and jobs from ServiceM8', icon: '📋', category: 'jobmanagement' },
  { slug: 'ascora', name: 'Ascora', description: 'Sync customers and work orders from Ascora', icon: '📋', category: 'jobmanagement' },
]

interface SubscriptionStatus {
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAST_DUE'
  subscriptionPlan?: string
}

export default function IntegrationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const successMessage = searchParams.get('success')
  const errorMessage = searchParams.get('error')
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [externalIntegrations, setExternalIntegrations] = useState<Record<ProviderSlug, ExternalIntegration>>({} as Record<ProviderSlug, ExternalIntegration>)
  const [loading, setLoading] = useState(true)
  const [syncingProvider, setSyncingProvider] = useState<ProviderSlug | null>(null)
  const [showApiModal, setShowApiModal] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [apiKeyType, setApiKeyType] = useState<'openai' | 'anthropic' | 'gemini'>('anthropic')
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null)
  const [newApiKeyType, setNewApiKeyType] = useState<'openai' | 'anthropic' | 'gemini'>('anthropic')
  const [newApiKey, setNewApiKey] = useState("")
  const [showAscoraModal, setShowAscoraModal] = useState(false)
  const [ascoraApiKey, setAscoraApiKey] = useState("")
  const [connectingAscora, setConnectingAscora] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // Show success/error messages from OAuth callback
  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage)
      router.replace('/dashboard/integrations')
    }
    if (errorMessage) {
      toast.error(errorMessage)
      router.replace('/dashboard/integrations')
    }
  }, [successMessage, errorMessage, router])

  // Fetch integrations and subscription status from API
  useEffect(() => {
    fetchIntegrations()
    fetchExternalIntegrations()
    fetchSubscriptionStatus()
  }, [])

  const fetchSubscriptionStatus = async () => {
    try {
      const response = await fetch("/api/user/profile")
      if (response.ok) {
        const data = await response.json()
        setSubscription({
          subscriptionStatus: data.profile?.subscriptionStatus,
          subscriptionPlan: data.profile?.subscriptionPlan
        })
      }
    } catch (error) {
      console.error("Error fetching subscription status:", error)
    }
  }

  const hasActiveSubscription = () => {
    return subscription?.subscriptionStatus === 'ACTIVE'
  }

  const fetchExternalIntegrations = async () => {
    try {
      const results: Record<ProviderSlug, ExternalIntegration> = {} as Record<ProviderSlug, ExternalIntegration>

      // Fetch all integrations from the main API
      const response = await fetch('/api/integrations')
      if (response.ok) {
        const data = await response.json()
        const allIntegrations = data.integrations || []

        // Map integrations to providers
        for (const integration of EXTERNAL_INTEGRATIONS) {
          const found = allIntegrations.find(
            (i: { provider: string }) => i.provider === integration.slug.toUpperCase()
          )
          if (found) {
            results[integration.slug] = {
              provider: integration.name,
              connected: found.status === 'CONNECTED',
              status: found.status,
              lastSyncAt: found.lastSyncAt,
              syncError: found.syncError,
            }
          } else {
            results[integration.slug] = {
              provider: integration.name,
              connected: false,
              status: 'DISCONNECTED',
            }
          }
        }
      } else {
        // Default all to disconnected
        for (const integration of EXTERNAL_INTEGRATIONS) {
          results[integration.slug] = {
            provider: integration.name,
            connected: false,
            status: 'DISCONNECTED',
          }
        }
      }

      setExternalIntegrations(results)
    } catch (error) {
      console.error("Error fetching external integrations:", error)
    }
  }

  const handleConnectExternal = async (slug: ProviderSlug) => {
    if (slug === 'ascora') {
      setShowAscoraModal(true)
      return
    }

    try {
      const response = await fetch(`/api/integrations/oauth/${slug}/connect`, {
        method: 'POST',
      })

      if (response.ok) {
        const data = await response.json()
        if (data.authUrl) {
          window.location.href = data.authUrl
        }
      } else if (response.status === 403) {
        // Subscription required - show upgrade modal
        const errorData = await response.json()
        if (errorData.upgradeRequired) {
          setShowUpgradeModal(true)
        } else {
          toast.error(errorData.error || 'Access denied')
        }
      } else {
        const errorData = await response.json()
        toast.error(errorData.error || 'Failed to initiate connection')
      }
    } catch (error) {
      console.error("Error connecting:", error)
      toast.error("Failed to initiate connection")
    }
  }

  const handleConnectAscora = async () => {
    if (!ascoraApiKey) {
      toast.error("API key is required")
      return
    }

    setConnectingAscora(true)
    try {
      // For Ascora, use the OAuth connect endpoint which will handle API key auth
      const response = await fetch('/api/integrations/oauth/ascora/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: ascoraApiKey }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.authUrl) {
          window.location.href = data.authUrl
        } else {
          toast.success('Connected to Ascora successfully')
          setShowAscoraModal(false)
          setAscoraApiKey("")
          fetchExternalIntegrations()
        }
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to connect to Ascora')
      }
    } catch (error) {
      console.error("Error connecting to Ascora:", error)
      toast.error("Failed to connect to Ascora")
    } finally {
      setConnectingAscora(false)
    }
  }

  const handleDisconnectExternal = async (slug: ProviderSlug) => {
    try {
      const response = await fetch(`/api/integrations/oauth/${slug}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (response.ok) {
        toast.success(`Disconnected from ${EXTERNAL_INTEGRATIONS.find(i => i.slug === slug)?.name}`)
        fetchExternalIntegrations()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to disconnect')
      }
    } catch (error) {
      console.error("Error disconnecting:", error)
      toast.error("Failed to disconnect integration")
    }
  }

  const handleSyncExternal = async (slug: ProviderSlug) => {
    setSyncingProvider(slug)
    try {
      const response = await fetch(`/api/integrations/oauth/${slug}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncClients: true, syncJobs: true }),
      })

      if (response.ok) {
        const data = await response.json()
        const clientsCount = data.clientsSynced || 0
        const jobsCount = data.jobsSynced || 0
        toast.success(`Synced ${clientsCount} clients and ${jobsCount} jobs`)
        fetchExternalIntegrations()
      } else if (response.status === 403) {
        // Subscription required
        const data = await response.json()
        if (data.upgradeRequired) {
          setShowUpgradeModal(true)
        } else {
          toast.error(data.error || 'Access denied')
        }
      } else {
        const data = await response.json()
        toast.error(data.error || 'Sync failed')
      }
    } catch (error) {
      console.error("Error syncing:", error)
      toast.error("Failed to sync integration")
    } finally {
      setSyncingProvider(null)
    }
  }

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
    if (!hasActiveSubscription()) {
      setShowUpgradeModal(true)
      return
    }

    setSelectedIntegration(integration)
    setApiKey("")
    if (integration.config) {
      try {
        const config = JSON.parse(integration.config)
        if (config.apiKeyType && ['openai', 'anthropic', 'gemini'].includes(config.apiKeyType)) {
          setApiKeyType(config.apiKeyType)
        }
      } catch {
        // Use default
      }
    }
    setShowApiModal(true)
  }

  const handleSaveConnection = async () => {
    if (!selectedIntegration) return

    if (!apiKey) {
      toast.error("API key is required")
      return
    }

    try {
      const config = {
        apiKeyType: apiKeyType
      }

      const response = await fetch(`/api/integrations/${selectedIntegration.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...selectedIntegration,
          apiKey,
          config: JSON.stringify(config),
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

        if (isOnboarding) {
          await new Promise(resolve => setTimeout(resolve, 1000))

          const onboardingResponse = await fetch('/api/onboarding/status')
          if (onboardingResponse.ok) {
            const onboardingData = await onboardingResponse.json()
            if (onboardingData.nextStep) {
              const nextStepRoute = onboardingData.steps[onboardingData.nextStep]?.route
              if (nextStepRoute) {
                toast.success('Step 2 complete! Redirecting to next step...', { duration: 2000 })
                setTimeout(() => {
                  router.push(`${nextStepRoute}?onboarding=true`)
                }, 2000)
                return
              }
            } else {
              toast.success('Onboarding complete! Redirecting to reports...', { duration: 2000 })
              setTimeout(() => {
                router.push('/dashboard/reports/new')
              }, 2000)
              return
            }
          }
        }

        const pricingResponse = await fetch('/api/pricing-config')
        if (pricingResponse.ok) {
          const pricingData = await pricingResponse.json()
          if (!pricingData.pricingConfig) {
            toast("Redirecting to pricing configuration...", { icon: "ℹ️" })
            setTimeout(() => {
              router.push('/dashboard/pricing-config')
            }, 500)
          }
        }
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
    if (newApiKeyType === 'openai' || newApiKeyType === 'gemini') {
      toast.error("This integration is coming soon!")
      return
    }

    if (!newApiKey) {
      toast.error("API key is required")
      return
    }

    const integrationData = {
      name: newApiKeyType === 'anthropic' ? 'Anthropic Claude' :
            newApiKeyType === 'openai' ? 'OpenAI GPT' :
            'Google Gemini',
      description: newApiKeyType === 'anthropic' ? 'AI-powered report generation with Claude' :
                   newApiKeyType === 'openai' ? 'AI-powered report generation with GPT' :
                   'AI-powered report generation with Gemini',
      icon: newApiKeyType === 'anthropic' ? '🤖' :
            newApiKeyType === 'openai' ? '🧠' :
            '🔮',
      apiKey: newApiKey,
      config: JSON.stringify({ apiKeyType: newApiKeyType }),
      status: "CONNECTED"
    }

    try {
      const response = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(integrationData)
      })

      if (response.ok) {
        const newIntegration = await response.json()
        setIntegrations([newIntegration, ...integrations])
        setNewApiKey("")
        setNewApiKeyType('anthropic')
        setShowAddModal(false)
        toast.success("Integration added successfully")

        if (isOnboarding) {
          await new Promise(resolve => setTimeout(resolve, 1000))

          const onboardingResponse = await fetch('/api/onboarding/status')
          if (onboardingResponse.ok) {
            const onboardingData = await onboardingResponse.json()
            if (onboardingData.nextStep) {
              const nextStepRoute = onboardingData.steps[onboardingData.nextStep]?.route
              if (nextStepRoute) {
                toast.success('Step 2 complete! Redirecting to next step...', { duration: 2000 })
                setTimeout(() => {
                  router.push(`${nextStepRoute}?onboarding=true`)
                }, 2000)
                return
              }
            } else {
              toast.success('Onboarding complete! Redirecting to reports...', { duration: 2000 })
              setTimeout(() => {
                router.push('/dashboard/reports/new')
              }, 2000)
              return
            }
          }
        }

        const pricingResponse = await fetch('/api/pricing-config')
        if (pricingResponse.ok) {
          const pricingData = await pricingResponse.json()
          if (!pricingData.pricingConfig) {
            toast("Redirecting to pricing configuration...", { icon: "ℹ️" })
            setTimeout(() => {
              router.push('/dashboard/pricing-config')
            }, 500)
          }
        }
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
          <h1 className="text-3xl font-semibold mb-2 text-gray-900 dark:text-white">Integrations</h1>
          <p className="text-gray-600 dark:text-slate-400">Connect your tools and services to Restore Assist</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-6 py-2 border border-gray-300 dark:border-slate-600 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-all text-gray-700 dark:text-slate-300"
          >
            <Download size={20} />
            Import Data
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-white"
          >
            <Plus size={20} />
            Add Integration
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        </div>
      ) : (
        <>
          {/* AI Integration Cards */}
          <div className="grid md:grid-cols-2 gap-6">
            {integrations.length === 0 ? (
              <div className="col-span-2 text-center py-12">
                <p className="text-gray-600 dark:text-slate-400">No integrations yet. Add your first integration to get started.</p>
              </div>
            ) : (
              integrations.map((integration) => (
                <div
                  key={integration.id}
                  className="p-6 rounded-lg border border-gray-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/30 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{integration.icon || "🔗"}</div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">{integration.name}</h3>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{integration.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {integration.status === "CONNECTED" ? (
                        <Check size={20} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                      ) : (
                        <X size={20} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                      )}
                      <button
                        onClick={() => handleDeleteIntegration(integration.id)}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} className="text-rose-500 dark:text-rose-400" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {integration.status === "CONNECTED" ? (
                      <button
                        onClick={() => handleDisconnect(integration.id)}
                        className="w-full px-4 py-2 border border-rose-500 dark:border-rose-600 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-sm"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnect(integration)}
                        className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-sm text-white"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bookkeeping Integrations */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <span>📊</span>
              Bookkeeping
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {EXTERNAL_INTEGRATIONS.filter(i => i.category === 'bookkeeping').map((integration) => {
                const status = externalIntegrations[integration.slug]
                const isConnected = status?.connected
                const isSyncing = syncingProvider === integration.slug || status?.status === 'SYNCING'
                const hasError = status?.status === 'ERROR'

                return (
                  <div
                    key={integration.slug}
                    className="p-6 rounded-lg border border-gray-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/30 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">{integration.icon}</div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{integration.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{integration.description}</p>
                          {isConnected && status?.counts && (
                            <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
                              {status.counts.clients} clients • {status.counts.jobs} jobs
                            </p>
                          )}
                          {status?.lastSyncAt && (
                            <p className="text-xs text-gray-500 dark:text-slate-500">
                              Last synced: {new Date(status.lastSyncAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <Check size={20} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                      ) : hasError ? (
                        <X size={20} className="text-rose-500 dark:text-rose-400 flex-shrink-0" />
                      ) : (
                        <X size={20} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                      )}
                    </div>

                    {hasError && status?.syncError && (
                      <div className="mb-4 p-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded text-xs text-rose-600 dark:text-rose-400">
                        {status.syncError}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {isConnected ? (
                        <>
                          <button
                            onClick={() => handleSyncExternal(integration.slug)}
                            disabled={isSyncing}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 text-white"
                          >
                            {isSyncing ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <RefreshCw size={16} />
                            )}
                            {isSyncing ? 'Syncing...' : 'Sync'}
                          </button>
                          <button
                            onClick={() => handleDisconnectExternal(integration.slug)}
                            className="px-4 py-2 border border-rose-500 dark:border-rose-600 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-sm"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleConnectExternal(integration.slug)}
                          className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-sm flex items-center justify-center gap-2 text-white"
                        >
                          <ExternalLink size={16} />
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Job Management Systems */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-gray-900 dark:text-white">
              <span>📋</span>
              Job Management Systems (CRM's)
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {EXTERNAL_INTEGRATIONS.filter(i => i.category === 'jobmanagement').map((integration) => {
                const status = externalIntegrations[integration.slug]
                const isConnected = status?.connected
                const isSyncing = syncingProvider === integration.slug || status?.status === 'SYNCING'
                const hasError = status?.status === 'ERROR'

                return (
                  <div
                    key={integration.slug}
                    className="p-6 rounded-lg border border-gray-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/30 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">{integration.icon}</div>
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-white">{integration.name}</h3>
                          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{integration.description}</p>
                          {isConnected && status?.counts && (
                            <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
                              {status.counts.clients} clients • {status.counts.jobs} jobs
                            </p>
                          )}
                          {status?.lastSyncAt && (
                            <p className="text-xs text-gray-500 dark:text-slate-500">
                              Last synced: {new Date(status.lastSyncAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      {isConnected ? (
                        <Check size={20} className="text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
                      ) : hasError ? (
                        <X size={20} className="text-rose-500 dark:text-rose-400 flex-shrink-0" />
                      ) : (
                        <X size={20} className="text-gray-400 dark:text-slate-500 flex-shrink-0" />
                      )}
                    </div>

                    {hasError && status?.syncError && (
                      <div className="mb-4 p-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded text-xs text-rose-600 dark:text-rose-400">
                        {status.syncError}
                      </div>
                    )}

                    <div className="flex gap-2">
                      {isConnected ? (
                        <>
                          <button
                            onClick={() => handleSyncExternal(integration.slug)}
                            disabled={isSyncing}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 text-white"
                          >
                            {isSyncing ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <RefreshCw size={16} />
                            )}
                            {isSyncing ? 'Syncing...' : 'Sync'}
                          </button>
                          <button
                            onClick={() => handleDisconnectExternal(integration.slug)}
                            className="px-4 py-2 border border-rose-500 dark:border-rose-600 text-rose-600 dark:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-sm"
                          >
                            Disconnect
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleConnectExternal(integration.slug)}
                          className="w-full px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-sm flex items-center justify-center gap-2 text-white"
                        >
                          <ExternalLink size={16} />
                          Connect
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Request Additional Integration Card */}
              <div className="p-6 rounded-lg border border-gray-200 dark:border-slate-700/30 bg-gray-50 dark:bg-slate-800/20 hover:bg-gray-100 dark:hover:bg-slate-800/30 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-4">
                    <div className="text-3xl">➕</div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">Request Integration</h3>
                      <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Need another platform? Let us know!</p>
                    </div>
                  </div>
                </div>
                <a
                  href="mailto:support@restoreassist.app?subject=Integration Request"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700/50 transition-colors text-sm flex items-center justify-center gap-2 text-gray-700 dark:text-slate-300"
                >
                  Contact Us
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {/* API Key Modal */}
      {showApiModal && selectedIntegration && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{selectedIntegration.name}</h2>
              <button onClick={() => setShowApiModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-500 dark:text-slate-400">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">API Key Type</label>
                <select
                  value={apiKeyType}
                  onChange={(e) => {
                    const value = e.target.value as 'openai' | 'anthropic' | 'gemini'
                    if (value === 'openai' || value === 'gemini') {
                      toast.error('This integration is coming soon!')
                      return
                    }
                    setApiKeyType(value)
                  }}
                  className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-gray-900 dark:text-white"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai" disabled>OpenAI GPT - Coming Soon</option>
                  <option value="gemini" disabled>Google Gemini - Coming Soon</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  Select the type of API key you want to connect
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${apiKeyType === 'anthropic' ? 'Anthropic' : apiKeyType === 'openai' ? 'OpenAI' : 'Gemini'} API key`}
                  className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-400"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  Your API key is encrypted and stored securely. We'll never share it with third parties.
                </p>
              </div>
              <button className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-sm text-gray-700 dark:text-slate-300">
                Test Connection
              </button>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowApiModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConnection}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-white"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
                  <Crown className="text-white" size={24} />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Upgrade Required</h2>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-600 dark:text-slate-300">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-slate-300">
                To connect API keys and use integrations, you need an active subscription (Monthly or Yearly plan).
              </p>
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Upgrade now to unlock all features including API integrations, unlimited reports, and priority support.
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowUpgradeModal(false)
                    router.push('/dashboard/pricing')
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-orange-500/50 transition-all text-white"
                >
                  Upgrade Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ascora API Key Modal */}
      {showAscoraModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-3xl">📋</div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Connect to Ascora</h2>
              </div>
              <button onClick={() => {
                setShowAscoraModal(false)
                setAscoraApiKey("")
              }} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-500 dark:text-slate-400">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Ascora uses API key authentication. Enter your Ascora API key to connect.
              </p>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">API Key</label>
                <input
                  type="password"
                  value={ascoraApiKey}
                  onChange={(e) => setAscoraApiKey(e.target.value)}
                  placeholder="Enter your Ascora API key"
                  className="w-full px-4 py-2 bg-white dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-400"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                  You can find your API key in Ascora under Settings &gt; API Access
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAscoraModal(false)
                    setAscoraApiKey("")
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300"
                  disabled={connectingAscora}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnectAscora}
                  disabled={connectingAscora || !ascoraApiKey}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-white"
                >
                  {connectingAscora ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Integration Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Add New Integration</h2>
              <button onClick={() => {
                setShowAddModal(false)
                setNewApiKey("")
                setNewApiKeyType('anthropic')
              }} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded text-gray-600 dark:text-slate-300">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">API Key Type</label>
                <select
                  value={newApiKeyType}
                  onChange={(e) => {
                    const value = e.target.value as 'openai' | 'anthropic' | 'gemini'
                    if (value === 'openai' || value === 'gemini') {
                      toast.error('This integration is coming soon!')
                      return
                    }
                    setNewApiKeyType(value)
                  }}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-gray-900 dark:text-white"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai" disabled>OpenAI GPT - Coming Soon</option>
                  <option value="gemini" disabled>Google Gemini - Coming Soon</option>
                </select>
                <p className="text-xs text-gray-600 dark:text-slate-400 mt-2">
                  Select the type of API key you want to connect
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-slate-300">API Key</label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={`Enter your ${newApiKeyType === 'anthropic' ? 'Anthropic' : newApiKeyType === 'openai' ? 'OpenAI' : 'Gemini'} API key`}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
                />
                <p className="text-xs text-gray-600 dark:text-slate-400 mt-2">
                  Your API key is encrypted and stored securely. We'll never share it with third parties.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setNewApiKey("")
                    setNewApiKeyType('anthropic')
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-gray-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddIntegration}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all text-white"
                >
                  Add Integration
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          fetchExternalIntegrations()
        }}
      />
    </div>
  )
}
