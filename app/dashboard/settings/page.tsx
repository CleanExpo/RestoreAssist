"use client"

import { CreditCard, Crown, Download, Edit, Key, RefreshCw, Shield, Trash2, User, Zap, Building2, Upload, Loader2, CheckCircle, ArrowRight } from "lucide-react"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import toast from "react-hot-toast"
import OnboardingGuide from "@/components/OnboardingGuide"
import WelcomeScreen from "@/components/WelcomeScreen"

interface UserProfile {
  id: string
  name: string
  email: string
  image?: string
  createdAt: string
  subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'CANCELED' | 'EXPIRED' | 'PAST_DUE'
  subscriptionPlan?: string
  creditsRemaining: number
  totalCreditsUsed: number
  trialEndsAt?: string
  subscriptionEndsAt?: string
  lastBillingDate?: string
  nextBillingDate?: string
  businessName?: string
  businessAddress?: string
  businessLogo?: string
  businessABN?: string
  businessPhone?: string
  businessEmail?: string
  addonReports?: number
  monthlyReportsUsed?: number
  monthlyResetDate?: string
  reportLimits?: {
    baseLimit: number
    addonReports: number
    monthlyReportsUsed: number
    availableReports: number
    hasUnlimited: boolean
  }
}

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isOnboarding = searchParams.get('onboarding') === 'true'
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    businessName: '',
    businessAddress: '',
    businessLogo: '',
    businessABN: '',
    businessPhone: '',
    businessEmail: ''
  })
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      // Check subscription status first - redirect if not subscribed
      if (isOnboarding) {
        checkSubscriptionAndRedirect()
      }
      fetchProfile()
      // Show welcome screen on first visit
      if (isOnboarding && !localStorage.getItem('onboarding_welcome_shown')) {
        setShowWelcome(true)
        localStorage.setItem('onboarding_welcome_shown', 'true')
      }
    } else if (status === 'unauthenticated') {
      setLoading(false)
    }
  }, [status, session, isOnboarding])

  const checkSubscriptionAndRedirect = async () => {
    try {
      const response = await fetch('/api/subscription')
      if (response.ok) {
        const data = await response.json()
        if (data.subscription?.status !== 'active') {
          // No active subscription, redirect to pricing
          toast.error('Please subscribe to a plan first')
          router.push('/dashboard/pricing?onboarding=true&require_subscription=true')
        }
      }
    } catch (error) {
      console.error('Error checking subscription:', error)
    }
  }

  const fetchProfile = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    }
    
    try {
      const response = await fetch('/api/user/profile')
      if (response.ok) {
        const data = await response.json()
        setProfile(data.profile)
        setFormData({
          name: data.profile.name || session?.user?.name || '',
          email: data.profile.email || session?.user?.email || '',
          businessName: data.profile.businessName || '',
          businessAddress: data.profile.businessAddress || '',
          businessLogo: data.profile.businessLogo || '',
          businessABN: data.profile.businessABN || '',
          businessPhone: data.profile.businessPhone || '',
          businessEmail: data.profile.businessEmail || ''
        })
      } else {
        // Fallback to session data
        setProfile({
          id: (session?.user as any)?.id || 'current-user',
          name: session?.user?.name || 'User Name',
          email: session?.user?.email || 'user@example.com',
          image: session?.user?.image || undefined,
          createdAt: new Date().toISOString(),
          subscriptionStatus: 'TRIAL',
          creditsRemaining: 3,
          totalCreditsUsed: 0
        })
        setFormData({
          name: session?.user?.name || 'User Name',
          email: session?.user?.email || 'user@example.com',
          businessName: '',
          businessAddress: '',
          businessLogo: '',
          businessABN: '',
          businessPhone: '',
          businessEmail: ''
        })
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      // Fallback to session data
      setProfile({
        id: (session?.user as { id?: string })?.id || 'current-user',
        name: session?.user?.name ?? 'User Name',
        email: session?.user?.email ?? 'user@example.com',
        image: session?.user?.image ?? undefined,
        createdAt: new Date().toISOString(),
        subscriptionStatus: 'TRIAL',
        creditsRemaining: 3,
        totalCreditsUsed: 0
      })
      setFormData({
        name: session?.user?.name || 'User Name',
        email: session?.user?.email || 'user@example.com',
        businessName: '',
        businessAddress: '',
        businessLogo: '',
        businessABN: '',
        businessPhone: '',
        businessEmail: ''
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleUpdateProfile = async () => {
    if (uploadingLogo) {
      toast.error('Please wait for the logo upload to complete')
      return
    }

    if (saving) {
      return // Prevent double submission
    }

    setSaving(true)
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        toast.success('Business information saved successfully')
        setEditing(false)
        await fetchProfile()
        
        // If in onboarding flow, check status and redirect to next step
        if (isOnboarding) {
          // Wait a moment for the API to update
          await new Promise(resolve => setTimeout(resolve, 500))
          
          const onboardingResponse = await fetch('/api/onboarding/status')
          if (onboardingResponse.ok) {
            const onboardingData = await onboardingResponse.json()
            if (onboardingData.nextStep) {
              const nextStepRoute = onboardingData.steps[onboardingData.nextStep]?.route
              if (nextStepRoute) {
                toast.success('Step 1 complete! Redirecting to next step...', { duration: 2000 })
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
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to save business information')
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to save business information. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      e.target.value = ''
      return
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid image file (JPEG, PNG, GIF, or WebP)')
      e.target.value = ''
      return
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error('File size must be less than 5MB')
      e.target.value = ''
      return
    }

    // Set uploading state - this only affects the logo display, not the save button
    setUploadingLogo(true)
    
    try {
      const uploadFormData = new FormData()
      uploadFormData.append('file', file)

      const response = await fetch('/api/upload/logo', {
        method: 'POST',
        body: uploadFormData
      })

      if (response.ok) {
        const data = await response.json()
        // Update formData with the new logo URL - this is only in memory, not saved to DB
        setFormData(prev => ({
          ...prev,
          businessLogo: data.url
        }))
        toast.success('Logo uploaded. Click "Save Changes" to save all information.')
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to upload logo')
      }
    } catch (error) {
      console.error('Error uploading logo:', error)
      toast.error('Failed to upload logo. Please try again.')
    } finally {
      setUploadingLogo(false)
      // Reset file input so same file can be selected again
      e.target.value = ''
    }
  }

  // Removed auto-refresh to prevent formData from being reset while user is editing
  // Profile is only refreshed when:
  // 1. Component mounts (initial load)
  // 2. User clicks "Refresh" button
  // 3. After successful save

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-400 bg-green-500/20'
      case 'TRIAL': return 'text-blue-400 bg-blue-500/20'
      case 'CANCELED': return 'text-yellow-400 bg-yellow-500/20'
      case 'EXPIRED': return 'text-red-400 bg-red-500/20'
      case 'PAST_DUE': return 'text-orange-400 bg-orange-500/20'
      default: return 'text-slate-400 bg-slate-500/20'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'Active'
      case 'TRIAL': return 'Free Trial'
      case 'CANCELED': return 'Canceled'
      case 'EXPIRED': return 'Expired'
      case 'PAST_DUE': return 'Past Due'
      default: return 'Unknown'
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-semibold text-white mb-2">Please log in</h2>
        <p className="text-slate-400">You need to be logged in to view your profile.</p>
      </div>
    )
  }

  return (
    <>
      {/* Welcome Screen */}
      {showWelcome && (
        <WelcomeScreen onContinue={() => setShowWelcome(false)} />
      )}

      {/* Onboarding Guide - Contextual Sidebar */}
      <OnboardingGuide
        step={1}
        totalSteps={5}
        title="Business Profile Setup"
        description="Add your business information, logo, and contact details. This will appear on all your professional reports."
        value="Your business details will be automatically included in every report you generate, saving you time and ensuring consistency."
      >
        <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-semibold mb-2">Settings & Profile</h1>
            <p className="text-slate-400">Manage your account settings and subscription</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchProfile(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={() => window.location.href = '/dashboard/subscription'}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Manage Subscription
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Profile Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Business Information */}
            <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Business Information
              </h2>
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
              >
                <Edit className="w-4 h-4" />
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>

              <div className="space-y-4">
              {/* Business Logo */}
              <div className="flex items-center gap-4 mb-6">
                <div className="relative group">
                  {editing ? (
                    <label className="cursor-pointer block">
                      {uploadingLogo ? (
                        <div className="w-24 h-24 rounded-lg bg-slate-700/50 border-2 border-slate-600 flex items-center justify-center transition-all">
                          <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
                        </div>
                      ) : (formData.businessLogo || profile?.businessLogo) ? (
                        <div className="relative w-24 h-24 rounded-lg overflow-hidden border-2 border-slate-600 group-hover:border-cyan-500 transition-all">
                          <img 
                            src={formData.businessLogo || profile?.businessLogo || ''} 
                            alt="Business Logo" 
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback if image fails to load
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                            }}
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="text-white text-xs font-medium flex items-center gap-1">
                              <Upload className="w-4 h-4" />
                              <span>Change</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 border-2 border-slate-600 group-hover:border-cyan-500 flex flex-col items-center justify-center text-white transition-all cursor-pointer">
                          <Upload className="w-8 h-8 mb-1" />
                          <span className="text-xs font-medium">Upload Logo</span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                        disabled={uploadingLogo}
                      />
                    </label>
                  ) : (
                    <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-slate-600">
                      {profile?.businessLogo ? (
                    <img 
                          src={profile.businessLogo} 
                          alt="Business Logo" 
                          className="w-full h-full object-cover"
                    />
                  ) : (
                        <div className="w-full h-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
                          <Building2 className="w-10 h-10" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {profile?.businessName || formData.businessName || 'Business Name'}
                  </h3>
                  <p className="text-slate-400 text-sm">
                    {profile?.businessEmail || formData.businessEmail || 'Business Email'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Business Name</label>
                {editing ? (
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                    placeholder="Enter business name"
                  />
                ) : (
                  <p className="text-slate-300">{profile?.businessName || 'Not provided'}</p>
                )}
                </div>

                <div>
                <label className="block text-sm font-medium mb-2">Business Address</label>
                {editing ? (
                  <textarea
                    value={formData.businessAddress}
                    onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                    placeholder="Enter business address"
                    rows={3}
                  />
                ) : (
                  <p className="text-slate-300">{profile?.businessAddress || 'Not provided'}</p>
                )}
                </div>

                <div>
                <label className="block text-sm font-medium mb-2">Business ABN</label>
                {editing ? (
                  <input
                    type="text"
                    value={formData.businessABN}
                    onChange={(e) => setFormData({ ...formData, businessABN: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                    placeholder="Enter ABN"
                  />
                ) : (
                  <p className="text-slate-300">{profile?.businessABN || 'Not provided'}</p>
                )}
                </div>

                <div>
                <label className="block text-sm font-medium mb-2">Business Phone Number</label>
                {editing ? (
                  <input
                    type="tel"
                    value={formData.businessPhone}
                    onChange={(e) => setFormData({ ...formData, businessPhone: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                    placeholder="Enter phone number"
                  />
                ) : (
                  <p className="text-slate-300">{profile?.businessPhone || 'Not provided'}</p>
                )}
                </div>

                <div>
                <label className="block text-sm font-medium mb-2">Business Email Address</label>
                {editing ? (
                  <input
                    type="email"
                    value={formData.businessEmail}
                    onChange={(e) => setFormData({ ...formData, businessEmail: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                    placeholder="Enter business email"
                  />
                ) : (
                  <p className="text-slate-300">{profile?.businessEmail || 'Not provided'}</p>
                )}
                  </div>

              {editing && (
                <div className="flex gap-3 pt-4 border-t border-slate-700/50">
                  <button
                    onClick={handleUpdateProfile}
                    disabled={uploadingLogo || saving}
                    className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      // Reset formData to profile data when canceling
                      setFormData({
                        name: profile?.name || session?.user?.name || '',
                        email: profile?.email || session?.user?.email || '',
                        businessName: profile?.businessName || '',
                        businessAddress: profile?.businessAddress || '',
                        businessLogo: profile?.businessLogo || '',
                        businessABN: profile?.businessABN || '',
                        businessPhone: profile?.businessPhone || '',
                        businessEmail: profile?.businessEmail || ''
                      })
                      setEditing(false)
                    }}
                    disabled={uploadingLogo || saving}
                    className="px-6 py-2.5 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Account Actions */}
            <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Key className="w-5 h-5" />
              Account Actions
            </h2>

              <button className="w-full flex items-center mb-3 gap-3 px-4 py-3 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Download className="w-4 h-4" />
                <span>Export Data (Coming Soon)</span>
              </button>

              <button className="w-full flex items-center gap-3 px-4 py-3 border border-red-600 text-red-400 rounded-lg hover:bg-red-600/10 transition-colors">
                <Trash2 className="w-4 h-4" />
                  <span>Delete Account (Coming Soon)</span>
                  </button>
                </div>
          </div>

        {/* Subscription & Credits Sidebar */}
        <div className="space-y-6">
          {/* Subscription Status */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Crown className="w-5 h-5" />
              Subscription
            </h2>

            <div className="space-y-4">
                <div>
                <label className="block text-sm font-medium mb-2">Status</label>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(profile?.subscriptionStatus || 'TRIAL')}`}>
                  {getStatusText(profile?.subscriptionStatus || 'TRIAL')}
                </div>
              </div>

              {profile?.subscriptionPlan && (
                <div>
                  <label className="block text-sm font-medium mb-2">Plan</label>
                  <p className="text-slate-300">{profile.subscriptionPlan}</p>
                </div>
              )}

              {profile?.trialEndsAt && (
                <div>
                  <label className="block text-sm font-medium mb-2">Trial Ends</label>
                  <p className="text-slate-300">{formatDate(profile.trialEndsAt)}</p>
                </div>
              )}

              {profile?.nextBillingDate && (
                <div>
                  <label className="block text-sm font-medium mb-2">Next Billing</label>
                  <p className="text-slate-300">{formatDate(profile.nextBillingDate)}</p>
                </div>
              )}

              <a
                href="/dashboard/subscription"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
              >
                <CreditCard className="w-4 h-4" />
                Manage Subscription
              </a>
            </div>
          </div>

          {/* Reports / Credits */}
            <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              {profile?.subscriptionStatus === 'ACTIVE' ? 'Reports' : 'Credits'}
            </h2>

              <div className="space-y-4">
                {profile?.subscriptionStatus === 'ACTIVE' && profile?.reportLimits ? (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Available This Month</label>
                      <div className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
                        {refreshing && <RefreshCw className="w-4 h-4 animate-spin" />}
                        {profile.reportLimits.availableReports} / {profile.reportLimits.baseLimit + profile.reportLimits.addonReports}
                      </div>
                      <div className="text-sm text-slate-400 mt-1">
                        Base: {profile.reportLimits.baseLimit}
                        {profile.reportLimits.addonReports > 0 && ` + Add-ons: ${profile.reportLimits.addonReports}`}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Used This Month</label>
                      <div className="text-lg text-slate-300">
                        {profile.reportLimits.monthlyReportsUsed}
                      </div>
                    </div>

                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${Math.min(100, (profile.reportLimits.monthlyReportsUsed / (profile.reportLimits.baseLimit + profile.reportLimits.addonReports)) * 100)}%` 
                        }}
                      ></div>
                    </div>

                    <a
                      href="/dashboard/pricing"
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-yellow-500/50 transition-all"
                    >
                      <Crown className="w-4 h-4" />
                      Purchase Add-ons
                    </a>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">Remaining</label>
                      <div className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
                        {refreshing && <RefreshCw className="w-4 h-4 animate-spin" />}
                        {profile?.creditsRemaining || 0}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Used</label>
                      <div className="text-lg text-slate-300">
                        {profile?.totalCreditsUsed || 0}
                      </div>
                    </div>

                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: `${Math.min(100, ((profile?.totalCreditsUsed || 0) / ((profile?.totalCreditsUsed || 0) + (profile?.creditsRemaining || 0) || 1)) * 100)}%` 
                        }}
                      ></div>
                    </div>

                    <a
                      href="/dashboard/pricing"
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-yellow-500/50 transition-all"
                    >
                      <Crown className="w-4 h-4" />
                      Upgrade Package
                    </a>
                  </>
                )}
            </div>
          </div>

          {/* Security */}
            <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Security
            </h2>

              <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Two-Factor Authentication</span>
                <span className="text-xs text-slate-500">Not enabled</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Login Sessions</span>
                <span className="text-xs text-slate-500">1 active</span>
                    </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Last Login</span>
                <span className="text-xs text-slate-500">Today</span>
              </div>
            </div>
          </div>
        </div>
      </div>
        </div>
      </OnboardingGuide>
    </>
  )
}