"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Crown, RefreshCw, Loader2, ExternalLink, Download, BarChart2, Briefcase, Zap } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import ImportModal from "@/components/integrations/ImportModal"
import OnboardingGuide from "@/components/OnboardingGuide"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

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
  logo: string
  category: 'bookkeeping' | 'jobmanagement'
  comingSoon?: boolean
}[] = [
  { slug: 'xero', name: 'Xero', description: 'Sync clients and invoices from Xero', icon: '📊', logo: '/integrations/xero.svg', category: 'bookkeeping' },
  { slug: 'quickbooks', name: 'QuickBooks', description: 'Sync customers and transactions from QuickBooks', icon: '📊', logo: '/integrations/quickbooks.svg', category: 'bookkeeping', comingSoon: true },
  { slug: 'myob', name: 'MYOB', description: 'Sync contacts and jobs from MYOB', icon: '📊', logo: '/integrations/myob.svg', category: 'bookkeeping', comingSoon: true },
  { slug: 'servicem8', name: 'ServiceM8', description: 'Sync clients and jobs from ServiceM8', icon: '📋', logo: '/integrations/servicem8.svg', category: 'jobmanagement', comingSoon: true },
  { slug: 'ascora', name: 'Ascora', description: 'Sync customers and work orders from Ascora', icon: '📋', logo: '/integrations/ascora.svg', category: 'jobmanagement' },
]

interface SubscriptionStatus {
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAST_DUE'
  subscriptionPlan?: string
}

export default function IntegrationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const onboardingStep = Number(searchParams.get('step') ?? '1')
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
  // Ascora modal removed — Ascora uses static API key auth via ASCORA_API_KEY env var.
  // Connect flow now goes through the generic handleConnectExternal path.
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

  const onboardingStepLabel = onboardingStep === 1 ? 'Google Drive Backup' : 'AI Provider'
  const onboardingStepDesc = onboardingStep === 1
    ? 'Connect your Google Drive to enable automatic inspection data backup'
    : 'Add your Anthropic (Claude) or Google (Gemini) API key to enable AI-powered features'

  return (
    <OnboardingGuide
      step={onboardingStep}
      totalSteps={5}
      title={onboardingStepLabel}
      description={onboardingStepDesc}
    >
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect your tools and services to Restore Assist</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
            <Download />
            Import Data
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0 shadow-sm"
            onClick={() => setShowAddModal(true)}
          >
            <Plus />
            Add Integration
          </Button>
        </div>
      </div>

      {/* ── Loading ─────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin text-muted-foreground" size={28} />
        </div>
      ) : (
        <>
          {/* ── AI Providers ─────────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10 dark:bg-violet-500/15 border border-violet-500/20">
                <Zap size={16} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">AI Providers</h2>
                <p className="text-xs text-muted-foreground">Connect your AI API keys for report generation</p>
              </div>
            </div>
            <Separator className="mt-4 mb-5" />

            {integrations.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                  <Zap size={32} className="text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No AI integrations yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Add your first API key to enable AI-powered report generation.</p>
                  <Button size="sm" variant="outline" className="mt-4" onClick={() => setShowAddModal(true)}>
                    <Plus /> Add API Key
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {integrations.map((integration) => (
                  <Card key={integration.id} className="group transition-all duration-200 hover:shadow-md dark:hover:shadow-black/30">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden shadow-md shadow-black/10 dark:shadow-black/30 ring-1 ring-white/10">
                          <Image src="/integrations/claude.svg" alt={integration.name} width={48} height={48} className="object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm">{integration.name}</CardTitle>
                            {integration.status === "CONNECTED" ? (
                              <Badge className="shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">Connected</Badge>
                            ) : (
                              <Badge variant="secondary" className="shrink-0 text-xs">Disconnected</Badge>
                            )}
                          </div>
                          <CardDescription className="mt-0.5 text-xs">{integration.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="pt-0 gap-2">
                      {integration.status === "CONNECTED" ? (
                        <>
                          <Button variant="outline" size="sm" className="flex-1" onClick={() => handleConnect(integration)}>
                            Update Key
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            onClick={() => handleDisconnect(integration.id)}
                          >
                            Disconnect
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteIntegration(integration.id)}>
                            <Trash2 className="text-rose-400 size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
                            onClick={() => handleConnect(integration)}
                          >
                            Connect
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDeleteIntegration(integration.id)}>
                            <Trash2 className="text-rose-400 size-3.5" />
                          </Button>
                        </>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* ── Bookkeeping ──────────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20">
                <BarChart2 size={16} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Bookkeeping</h2>
                <p className="text-xs text-muted-foreground">Sync clients and invoices from your accounting platform</p>
              </div>
            </div>
            <Separator className="mt-4 mb-5" />
            <div className="grid md:grid-cols-3 gap-4">
              {EXTERNAL_INTEGRATIONS.filter(i => i.category === 'bookkeeping').map((integration) => {
                const status = externalIntegrations[integration.slug]
                const isConnected = status?.connected
                const isSyncing = syncingProvider === integration.slug || status?.status === 'SYNCING'
                const hasError = status?.status === 'ERROR'
                return (
                  <Card key={integration.slug} className="group transition-all duration-200 hover:shadow-md dark:hover:shadow-black/30 hover:-translate-y-0.5">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden shadow-md shadow-black/10 dark:shadow-black/30 ring-1 ring-white/10">
                          <Image src={integration.logo} alt={integration.name} width={48} height={48} className="object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <CardTitle className="text-sm">{integration.name}</CardTitle>
                            {isConnected && <Badge className="shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">Connected</Badge>}
                            {hasError && <Badge variant="destructive" className="shrink-0 text-xs">Error</Badge>}
                            {integration.comingSoon && !isConnected && <Badge variant="secondary" className="shrink-0 text-xs">Soon</Badge>}
                          </div>
                          <CardDescription className="mt-0.5 text-xs leading-relaxed">{integration.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    {isConnected && (status?.counts || status?.lastSyncAt) && (
                      <CardContent className="pt-0 pb-3">
                        <Separator className="mb-3" />
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {status?.counts && <p>{status.counts.clients} clients · {status.counts.jobs} jobs</p>}
                          {status?.lastSyncAt && <p>Last synced {new Date(status.lastSyncAt).toLocaleDateString('en-AU')}</p>}
                        </div>
                      </CardContent>
                    )}
                    {hasError && status?.syncError && (
                      <CardContent className="pt-0 pb-3">
                        <div className="p-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-md text-xs text-rose-600 dark:text-rose-400">
                          {status.syncError}
                        </div>
                      </CardContent>
                    )}
                    <CardFooter className="pt-0 gap-2">
                      {isConnected ? (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0 shadow-sm"
                            onClick={() => handleSyncExternal(integration.slug)}
                            disabled={isSyncing}
                          >
                            {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            {isSyncing ? "Syncing..." : "Sync"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            onClick={() => handleDisconnectExternal(integration.slug)}
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : integration.comingSoon ? (
                        <Button variant="secondary" size="sm" className="w-full" disabled>Coming Soon</Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
                          onClick={() => handleConnectExternal(integration.slug)}
                        >
                          <ExternalLink />
                          Connect
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* ── Job Management ───────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/20">
                <Briefcase size={16} className="text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Job Management</h2>
                <p className="text-xs text-muted-foreground">Connect your field service and CRM platforms</p>
              </div>
            </div>
            <Separator className="mt-4 mb-5" />
            <div className="grid md:grid-cols-3 gap-4">
              {EXTERNAL_INTEGRATIONS.filter(i => i.category === 'jobmanagement').map((integration) => {
                const status = externalIntegrations[integration.slug]
                const isConnected = status?.connected
                const isSyncing = syncingProvider === integration.slug || status?.status === 'SYNCING'
                const hasError = status?.status === 'ERROR'
                return (
                  <Card key={integration.slug} className="group transition-all duration-200 hover:shadow-md dark:hover:shadow-black/30 hover:-translate-y-0.5">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden shadow-md shadow-black/10 dark:shadow-black/30 ring-1 ring-white/10">
                          <Image src={integration.logo} alt={integration.name} width={48} height={48} className="object-contain" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <CardTitle className="text-sm">{integration.name}</CardTitle>
                            {isConnected && <Badge className="shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs">Connected</Badge>}
                            {hasError && <Badge variant="destructive" className="shrink-0 text-xs">Error</Badge>}
                            {integration.comingSoon && !isConnected && <Badge variant="secondary" className="shrink-0 text-xs">Soon</Badge>}
                          </div>
                          <CardDescription className="mt-0.5 text-xs leading-relaxed">{integration.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    {isConnected && (status?.counts || status?.lastSyncAt) && (
                      <CardContent className="pt-0 pb-3">
                        <Separator className="mb-3" />
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {status?.counts && <p>{status.counts.clients} clients · {status.counts.jobs} jobs</p>}
                          {status?.lastSyncAt && <p>Last synced {new Date(status.lastSyncAt).toLocaleDateString('en-AU')}</p>}
                        </div>
                      </CardContent>
                    )}
                    {hasError && status?.syncError && (
                      <CardContent className="pt-0 pb-3">
                        <div className="p-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-md text-xs text-rose-600 dark:text-rose-400">
                          {status.syncError}
                        </div>
                      </CardContent>
                    )}
                    <CardFooter className="pt-0 gap-2">
                      {isConnected ? (
                        <>
                          <Button
                            size="sm"
                            className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0 shadow-sm"
                            onClick={() => handleSyncExternal(integration.slug)}
                            disabled={isSyncing}
                          >
                            {isSyncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            {isSyncing ? "Syncing..." : "Sync"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/30 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            onClick={() => handleDisconnectExternal(integration.slug)}
                          >
                            Disconnect
                          </Button>
                        </>
                      ) : integration.comingSoon ? (
                        <Button variant="secondary" size="sm" className="w-full" disabled>Coming Soon</Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
                          onClick={() => handleConnectExternal(integration.slug)}
                        >
                          <ExternalLink />
                          Connect
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                )
              })}

              {/* Request Integration */}
              <Card className="border-dashed bg-muted/20 hover:bg-muted/40 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-12 h-12 shrink-0 rounded-xl bg-muted border border-border">
                      <Plus size={18} className="text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Request Integration</CardTitle>
                      <CardDescription className="text-xs mt-0.5">Need another platform? Let us know!</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardFooter className="pt-0">
                  <Button variant="secondary" size="sm" className="w-full" disabled>Coming Soon</Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* ── API Key Modal ──────────────────────────── */}
      <Dialog open={showApiModal} onOpenChange={setShowApiModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedIntegration?.name}</DialogTitle>
            <DialogDescription>Connect your API key to enable AI-powered report generation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">API Key Type</label>
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
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring text-foreground"
              >
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai" disabled>OpenAI GPT — Coming Soon</option>
                <option value="gemini" disabled>Google Gemini — Coming Soon</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${apiKeyType === 'anthropic' ? 'Anthropic' : apiKeyType === 'openai' ? 'OpenAI' : 'Gemini'} API key`}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring placeholder:text-muted-foreground text-foreground"
              />
              <p className="text-xs text-muted-foreground">Your key is encrypted at rest. We never share it with third parties.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApiModal(false)}>Cancel</Button>
            <Button
              onClick={handleSaveConnection}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
            >
              Save Connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Upgrade Modal ─────────────────────────── */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center shrink-0">
                <Crown className="text-white" size={18} />
              </div>
              <DialogTitle>Upgrade Required</DialogTitle>
            </div>
            <DialogDescription>
              An active subscription is required to connect integrations and unlock all features — unlimited reports, priority support, and full API access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpgradeModal(false)}>Cancel</Button>
            <Button
              onClick={() => { setShowUpgradeModal(false); router.push('/dashboard/pricing') }}
              className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white border-0"
            >
              Upgrade Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Integration Modal ─────────────────── */}
      <Dialog
        open={showAddModal}
        onOpenChange={(open) => {
          if (!open) { setNewApiKey(""); setNewApiKeyType('anthropic') }
          setShowAddModal(open)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Integration</DialogTitle>
            <DialogDescription>Connect an AI provider API key to enable report generation.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">API Key Type</label>
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
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring text-foreground"
              >
                <option value="anthropic">Anthropic Claude</option>
                <option value="openai" disabled>OpenAI GPT — Coming Soon</option>
                <option value="gemini" disabled>Google Gemini — Coming Soon</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">API Key</label>
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder={`Enter your ${newApiKeyType === 'anthropic' ? 'Anthropic' : newApiKeyType === 'openai' ? 'OpenAI' : 'Gemini'} API key`}
                className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring placeholder:text-muted-foreground text-foreground"
              />
              <p className="text-xs text-muted-foreground">Your key is encrypted at rest. We never share it with third parties.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); setNewApiKey(""); setNewApiKeyType('anthropic') }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddIntegration}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0"
            >
              Add Integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Modal */}
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => { fetchExternalIntegrations() }}
      />
    </div>
    </OnboardingGuide>
  )
}
