"use client"

import { useState, useEffect } from "react"
import { User, Mail, Calendar, CreditCard, Crown, Zap, Shield, Download, Bell, Key, Trash2, Edit, RefreshCw } from "lucide-react"
import { useSession } from "next-auth/react"
import toast from "react-hot-toast"

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
}

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: ''
  })

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      fetchProfile()
    } else if (status === 'unauthenticated') {
      setLoading(false)
    }
  }, [status, session])

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
          email: data.profile.email || session?.user?.email || ''
        })
      } else {
        // Fallback to session data
        setProfile({
          id: session?.user?.id || 'current-user',
          name: session?.user?.name || 'User Name',
          email: session?.user?.email || 'user@example.com',
          image: session?.user?.image,
          createdAt: new Date().toISOString(),
          subscriptionStatus: 'TRIAL',
          creditsRemaining: 3,
          totalCreditsUsed: 0
        })
        setFormData({
          name: session?.user?.name || 'User Name',
          email: session?.user?.email || 'user@example.com'
        })
      }
    } catch (error) {
      console.error('Error fetching profile:', error)
      // Fallback to session data
      setProfile({
        id: session?.user?.id || 'current-user',
        name: session?.user?.name || 'User Name',
        email: session?.user?.email || 'user@example.com',
        image: session?.user?.image,
        createdAt: new Date().toISOString(),
        subscriptionStatus: 'TRIAL',
        creditsRemaining: 3,
        totalCreditsUsed: 0
      })
      setFormData({
        name: session?.user?.name || 'User Name',
        email: session?.user?.email || 'user@example.com'
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleUpdateProfile = async () => {
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        toast.success('Profile updated successfully')
        setEditing(false)
        fetchProfile()
      } else {
        toast.error('Failed to update profile')
      }
    } catch (error) {
      console.error('Error updating profile:', error)
      toast.error('Failed to update profile')
    }
  }

  // Refresh profile data periodically to show updated credits
  useEffect(() => {
    const interval = setInterval(() => {
      fetchProfile()
    }, 5000) // Refresh every 5 seconds

    return () => clearInterval(interval)
  }, [])

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
          {/* Personal Information */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <User className="w-5 h-5" />
                Personal Information
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
              {/* User Avatar */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-semibold text-xl">
                  {profile?.image ? (
                    <img 
                      src={profile.image} 
                      alt="Profile" 
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    profile?.name?.charAt(0) || session?.user?.name?.charAt(0) || 'U'
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {profile?.name || session?.user?.name || 'User Name'}
                  </h3>
                  <p className="text-slate-400 text-sm">
                    {profile?.email || session?.user?.email || 'user@example.com'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Full Name</label>
                {editing ? (
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                ) : (
                  <p className="text-slate-300">{profile?.name || session?.user?.name || 'Not provided'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Email Address</label>
                {editing ? (
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50"
                  />
                ) : (
                  <p className="text-slate-300">{profile?.email || session?.user?.email || 'Not provided'}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Member Since</label>
                <p className="text-slate-300">{formatDate(profile?.createdAt) || 'Recently'}</p>
              </div>

              {editing && (
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleUpdateProfile}
                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg font-medium hover:shadow-lg hover:shadow-blue-500/50 transition-all"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
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

            <div className="space-y-4">
              <button className="w-full flex items-center gap-3 px-4 py-3 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Bell className="w-4 h-4" />
                <span>Notification Preferences</span>
              </button>

              <button className="w-full flex items-center gap-3 px-4 py-3 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Download className="w-4 h-4" />
                <span>Export Data</span>
              </button>

              <button className="w-full flex items-center gap-3 px-4 py-3 border border-red-600 text-red-400 rounded-lg hover:bg-red-600/10 transition-colors">
                <Trash2 className="w-4 h-4" />
                <span>Delete Account</span>
              </button>
            </div>
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

          {/* Credits */}
          <div className="p-6 rounded-lg border border-slate-700/50 bg-slate-800/30">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Credits
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Remaining</label>
                <div className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
                  {refreshing && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {profile?.creditsRemaining || 0}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Used This Month</label>
                <div className="text-lg text-slate-300">
                  {profile?.totalCreditsUsed || 0}
                </div>
              </div>

              <div className="w-full bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${Math.min(100, ((profile?.totalCreditsUsed || 0) / ((profile?.totalCreditsUsed || 0) + (profile?.creditsRemaining || 0))) * 100)}%` 
                  }}
                ></div>
              </div>

              <a
                href="/pricing"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg font-medium hover:shadow-lg hover:shadow-yellow-500/50 transition-all"
              >
                <Crown className="w-4 h-4" />
                Upgrade Package
              </a>
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
  )
}