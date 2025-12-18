"use client"

import { useState, useEffect } from "react"
import { Check, X, Settings, XIcon, Plus, Trash2, Crown, CheckCircle, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"
import { useRouter, useSearchParams } from "next/navigation"
import OnboardingGuide from "@/components/OnboardingGuide"

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

interface SubscriptionStatus {
  subscriptionStatus?: 'TRIAL' | 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAST_DUE'
  subscriptionPlan?: string
}

export default function IntegrationsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [showApiModal, setShowApiModal] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [apiKeyType, setApiKeyType] = useState<'openai' | 'anthropic' | 'gemini'>('anthropic')
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null)
  const [newApiKeyType, setNewApiKeyType] = useState<'openai' | 'anthropic' | 'gemini'>('anthropic')
  const [newApiKey, setNewApiKey] = useState("")

  // Fetch integrations and subscription status from API
  useEffect(() => {
    fetchIntegrations()
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
    // Check if user has active subscription before allowing API key insertion
    if (!hasActiveSubscription()) {
      setShowUpgradeModal(true)
      return
    }
    
    setSelectedIntegration(integration)
    setApiKey("")
    // Try to get API key type from existing config if available
    if (integration.config) {
      try {
        const config = JSON.parse(integration.config)
        if (config.apiKeyType && ['openai', 'anthropic', 'gemini'].includes(config.apiKeyType)) {
          setApiKeyType(config.apiKeyType)
        }
      } catch (e) {
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
        
        // If in onboarding flow, check status and redirect to next step
        if (isOnboarding) {
          // Wait a moment for the API to update
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const onboardingResponse = await fetch('/api/onboarding/status')
          if (onboardingResponse.ok) {
            const onboardingData = await onboardingResponse.json()
            console.log('Onboarding status after save:', onboardingData)
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
              // All steps complete
              toast.success('Onboarding complete! Redirecting to reports...', { duration: 2000 })
              setTimeout(() => {
                router.push('/dashboard/reports/new')
              }, 2000)
              return
            }
          }
        }
        
        // Check if pricing config exists, if not redirect to pricing config
        // Note: Once API key is set, pricing will be locked, so redirect now if not configured
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
    if (!newApiKey) {
      toast.error("API key is required")
      return
    }

    // Determine integration name and icon based on API key type
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
        
        // If in onboarding flow, check status and redirect to next step
        if (isOnboarding) {
          // Wait a moment for the API to update
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const onboardingResponse = await fetch('/api/onboarding/status')
          if (onboardingResponse.ok) {
            const onboardingData = await onboardingResponse.json()
            console.log('Onboarding status after add:', onboardingData)
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
              // All steps complete
              toast.success('Onboarding complete! Redirecting to reports...', { duration: 2000 })
              setTimeout(() => {
                router.push('/dashboard/reports/new')
              }, 2000)
              return
            }
          }
        }
        
        // Check if pricing config exists, if not redirect to pricing config
        // Note: Once API key is set, pricing will be locked, so redirect now if not configured
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
    <>
      {/* Onboarding Guide - Contextual Sidebar */}
      <OnboardingGuide
        step={2}
        totalSteps={4}
        title="AI Integration Setup"
        description="Connect your AI API key to enable intelligent report generation. Choose from Anthropic Claude, OpenAI GPT, or Google Gemini."
        value="AI-powered reports provide detailed analysis, compliance checks, and professional recommendations automatically."
      >
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
                <label className="block text-sm font-medium mb-2">API Key Type</label>
                <select
                  value={apiKeyType}
                  onChange={(e) => setApiKeyType(e.target.value as 'openai' | 'anthropic' | 'gemini')}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-white"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="gemini">Google Gemini</option>
                </select>
                <p className="text-xs text-slate-400 mt-2">
                  Select the type of API key you want to connect
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Enter your ${apiKeyType === 'anthropic' ? 'Anthropic' : apiKeyType === 'openai' ? 'OpenAI' : 'Gemini'} API key`}
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

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center">
                  <Crown className="text-white" size={24} />
                </div>
                <h2 className="text-xl font-semibold">Upgrade Required</h2>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-slate-300">
                To connect API keys and use integrations, you need an active subscription (Monthly or Yearly plan).
              </p>
              <p className="text-sm text-slate-400">
                Upgrade now to unlock all features including API integrations, unlimited reports, and priority support.
              </p>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowUpgradeModal(false)
                    router.push('/dashboard/pricing')
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-orange-500/50 transition-all"
                >
                  Upgrade Now
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
              <button onClick={() => {
                setShowAddModal(false)
                setNewApiKey("")
                setNewApiKeyType('anthropic')
              }} className="p-1 hover:bg-slate-700 rounded">
                <XIcon size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">API Key Type</label>
                <select
                  value={newApiKeyType}
                  onChange={(e) => setNewApiKeyType(e.target.value as 'openai' | 'anthropic' | 'gemini')}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-white"
                >
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="openai">OpenAI GPT</option>
                  <option value="gemini">Google Gemini</option>
                </select>
                <p className="text-xs text-slate-400 mt-2">
                  Select the type of API key you want to connect
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">API Key</label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder={`Enter your ${newApiKeyType === 'anthropic' ? 'Anthropic' : newApiKeyType === 'openai' ? 'OpenAI' : 'Gemini'} API key`}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                />
                <p className="text-xs text-slate-400 mt-2">
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
      </OnboardingGuide>
    </>
  )
}
