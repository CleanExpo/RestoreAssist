'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Save,
  Plus,
  Trash2,
  Award,
  MapPin,
  Shield,
  AlertCircle,
  CheckCircle
} from 'lucide-react'

interface ContractorProfile {
  id: string
  publicDescription: string | null
  yearsInBusiness: number | null
  teamSize: number | null
  insuranceCertificate: string | null
  isPubliclyVisible: boolean
  specializations: string[]
  servicesOffered: string | null
  searchKeywords: string[]
  isVerified: boolean
  averageRating: number
  totalReviews: number
  completedJobs: number
}

interface Certification {
  id: string
  certificationType: string
  certificationName: string
  issuingBody: string
  certificationNumber: string | null
  issueDate: string
  expiryDate: string | null
  verificationStatus: string
  documentUrl: string | null
}

interface ServiceArea {
  id: string
  postcode: string
  suburb: string | null
  state: string
  radius: number | null
  isActive: boolean
  priority: number
}

export default function ContractorProfileDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [profile, setProfile] = useState<ContractorProfile | null>(null)
  const [certifications, setCertifications] = useState<Certification[]>([])
  const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Form states
  const [publicDescription, setPublicDescription] = useState('')
  const [yearsInBusiness, setYearsInBusiness] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [isPubliclyVisible, setIsPubliclyVisible] = useState(true)
  const [specializations, setSpecializations] = useState('')

  // New certification form
  const [showAddCert, setShowAddCert] = useState(false)
  const [newCert, setNewCert] = useState({
    certificationType: '',
    certificationName: '',
    issuingBody: '',
    certificationNumber: '',
    issueDate: '',
    expiryDate: ''
  })

  // New service area form
  const [showAddArea, setShowAddArea] = useState(false)
  const [newArea, setNewArea] = useState({
    postcode: '',
    suburb: '',
    state: '',
    radius: '',
    isActive: true,
    priority: '0'
  })

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchProfile()
    }
  }, [status])

  const fetchProfile = async () => {
    try {
      const [profileRes, certsRes, areasRes] = await Promise.all([
        fetch('/api/contractors/profile'),
        fetch('/api/contractors/certifications'),
        fetch('/api/contractors/service-areas')
      ])

      if (profileRes.ok) {
        const profileData = await profileRes.json()
        setProfile(profileData.profile)
        setPublicDescription(profileData.profile.publicDescription || '')
        setYearsInBusiness(profileData.profile.yearsInBusiness?.toString() || '')
        setTeamSize(profileData.profile.teamSize?.toString() || '')
        setIsPubliclyVisible(profileData.profile.isPubliclyVisible)
        setSpecializations((profileData.profile.specializations || []).join(', '))
      }

      if (certsRes.ok) {
        const certsData = await certsRes.json()
        setCertifications(certsData.certifications || [])
      }

      if (areasRes.ok) {
        const areasData = await areasRes.json()
        setServiceAreas(areasData.serviceAreas || [])
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveProfile = async () => {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/contractors/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicDescription,
          yearsInBusiness: yearsInBusiness ? parseInt(yearsInBusiness) : null,
          teamSize: teamSize ? parseInt(teamSize) : null,
          isPubliclyVisible,
          specializations: specializations.split(',').map(s => s.trim()).filter(Boolean)
        })
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully' })
        await fetchProfile()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to update profile' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile' })
    } finally {
      setSaving(false)
    }
  }

  const addCertification = async () => {
    if (!newCert.certificationType || !newCert.certificationName || !newCert.issuingBody || !newCert.issueDate) {
      setMessage({ type: 'error', text: 'Please fill in all required certification fields' })
      return
    }

    try {
      const res = await fetch('/api/contractors/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCert)
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Certification added successfully' })
        setShowAddCert(false)
        setNewCert({
          certificationType: '',
          certificationName: '',
          issuingBody: '',
          certificationNumber: '',
          issueDate: '',
          expiryDate: ''
        })
        await fetchProfile()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to add certification' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add certification' })
    }
  }

  const deleteCertification = async (id: string) => {
    if (!confirm('Are you sure you want to delete this certification?')) return

    try {
      const res = await fetch(`/api/contractors/certifications/${id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Certification deleted' })
        await fetchProfile()
      } else {
        setMessage({ type: 'error', text: 'Failed to delete certification' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete certification' })
    }
  }

  const addServiceArea = async () => {
    if (!newArea.postcode || !newArea.state) {
      setMessage({ type: 'error', text: 'Please fill in postcode and state' })
      return
    }

    try {
      const res = await fetch('/api/contractors/service-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newArea)
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Service area added successfully' })
        setShowAddArea(false)
        setNewArea({
          postcode: '',
          suburb: '',
          state: '',
          radius: '',
          isActive: true,
          priority: '0'
        })
        await fetchProfile()
      } else {
        const data = await res.json()
        setMessage({ type: 'error', text: data.error || 'Failed to add service area' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to add service area' })
    }
  }

  const deleteServiceArea = async (id: string) => {
    if (!confirm('Are you sure you want to delete this service area?')) return

    try {
      const res = await fetch(`/api/contractors/service-areas/${id}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Service area deleted' })
        await fetchProfile()
      } else {
        setMessage({ type: 'error', text: 'Failed to delete service area' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to delete service area' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-slate-400">Loading profile...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-white mb-8">Contractor Profile</h1>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Verification Status */}
      {profile && (
        <div className="mb-6 p-4 bg-slate-800/30 border border-slate-700 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className={`h-6 w-6 ${profile.isVerified ? 'text-cyan-400' : 'text-slate-500'}`} />
            <div>
              <div className="text-white font-medium">
                {profile.isVerified ? 'Verified Contractor' : 'Not Yet Verified'}
              </div>
              <div className="text-sm text-slate-400">
                {profile.isVerified
                  ? 'Your profile is verified'
                  : 'Submit certifications for verification'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{profile.averageRating.toFixed(1)}/5.0</div>
            <div className="text-sm text-slate-400">{profile.totalReviews} reviews</div>
          </div>
        </div>
      )}

      {/* Basic Profile */}
      <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold text-white mb-6">Basic Information</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Public Description
            </label>
            <textarea
              value={publicDescription}
              onChange={(e) => setPublicDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Describe your business and services..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Years in Business
              </label>
              <input
                type="number"
                value={yearsInBusiness}
                onChange={(e) => setYearsInBusiness(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Team Size
              </label>
              <input
                type="number"
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
                className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Specializations (comma-separated)
            </label>
            <input
              type="text"
              value={specializations}
              onChange={(e) => setSpecializations(e.target.value)}
              placeholder="e.g. Water Damage, Fire Restoration, Mold Remediation"
              className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isPubliclyVisible"
              checked={isPubliclyVisible}
              onChange={(e) => setIsPubliclyVisible(e.target.checked)}
              className="w-4 h-4 text-cyan-500 bg-slate-700 border-slate-600 rounded focus:ring-cyan-500"
            />
            <label htmlFor="isPubliclyVisible" className="text-sm text-slate-300">
              Make profile publicly visible in directory
            </label>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50"
          >
            <Save className="h-5 w-5" />
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Certifications */}
      <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Certifications</h2>
          <button
            onClick={() => setShowAddCert(!showAddCert)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add Certification
          </button>
        </div>

        {/* Add Certification Form */}
        {showAddCert && (
          <div className="mb-6 p-4 bg-slate-700/30 border border-slate-600 rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Certification Type *
                </label>
                <select
                  value={newCert.certificationType}
                  onChange={(e) => setNewCert({ ...newCert, certificationType: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select type...</option>
                  <option value="IICRC_WRT">IICRC Water Damage Restoration</option>
                  <option value="IICRC_AMRT">IICRC Applied Microbial Remediation</option>
                  <option value="IICRC_FSRT">IICRC Fire & Smoke Restoration</option>
                  <option value="TRADE_PLUMBING">Trade - Plumbing</option>
                  <option value="TRADE_ELECTRICAL">Trade - Electrical</option>
                  <option value="TRADE_BUILDING">Trade - Building</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Certification Name *
                </label>
                <input
                  type="text"
                  value={newCert.certificationName}
                  onChange={(e) => setNewCert({ ...newCert, certificationName: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Issuing Body *
                </label>
                <input
                  type="text"
                  value={newCert.issuingBody}
                  onChange={(e) => setNewCert({ ...newCert, issuingBody: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Certification Number
                </label>
                <input
                  type="text"
                  value={newCert.certificationNumber}
                  onChange={(e) => setNewCert({ ...newCert, certificationNumber: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Issue Date *
                </label>
                <input
                  type="date"
                  value={newCert.issueDate}
                  onChange={(e) => setNewCert({ ...newCert, issueDate: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Expiry Date
                </label>
                <input
                  type="date"
                  value={newCert.expiryDate}
                  onChange={(e) => setNewCert({ ...newCert, expiryDate: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={addCertification}
                className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
              >
                Add Certification
              </button>
              <button
                onClick={() => setShowAddCert(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Certifications List */}
        {certifications.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            No certifications added yet
          </div>
        ) : (
          <div className="space-y-4">
            {certifications.map((cert) => (
              <div
                key={cert.id}
                className="flex items-start justify-between p-4 bg-slate-700/30 border border-slate-600 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <Award className="h-6 w-6 text-cyan-400 flex-shrink-0 mt-1" />
                  <div>
                    <div className="font-medium text-white">{cert.certificationName}</div>
                    <div className="text-sm text-slate-400">{cert.issuingBody}</div>
                    {cert.certificationNumber && (
                      <div className="text-sm text-slate-500">#{cert.certificationNumber}</div>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-slate-400">
                        Issued: {new Date(cert.issueDate).toLocaleDateString()}
                      </span>
                      {cert.expiryDate && (
                        <span className="text-slate-400">
                          Expires: {new Date(cert.expiryDate).toLocaleDateString()}
                        </span>
                      )}
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          cert.verificationStatus === 'VERIFIED'
                            ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                            : cert.verificationStatus === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                            : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}
                      >
                        {cert.verificationStatus}
                      </span>
                    </div>
                  </div>
                </div>
                {cert.verificationStatus !== 'VERIFIED' && (
                  <button
                    onClick={() => deleteCertification(cert.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service Areas */}
      <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Service Areas</h2>
          <button
            onClick={() => setShowAddArea(!showAddArea)}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add Service Area
          </button>
        </div>

        {/* Add Service Area Form */}
        {showAddArea && (
          <div className="mb-6 p-4 bg-slate-700/30 border border-slate-600 rounded-lg space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Postcode *
                </label>
                <input
                  type="text"
                  value={newArea.postcode}
                  onChange={(e) => setNewArea({ ...newArea, postcode: e.target.value })}
                  placeholder="e.g. 2000"
                  maxLength={4}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Suburb
                </label>
                <input
                  type="text"
                  value={newArea.suburb}
                  onChange={(e) => setNewArea({ ...newArea, suburb: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  State *
                </label>
                <select
                  value={newArea.state}
                  onChange={(e) => setNewArea({ ...newArea, state: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select state...</option>
                  <option value="NSW">NSW</option>
                  <option value="VIC">VIC</option>
                  <option value="QLD">QLD</option>
                  <option value="SA">SA</option>
                  <option value="WA">WA</option>
                  <option value="TAS">TAS</option>
                  <option value="NT">NT</option>
                  <option value="ACT">ACT</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={addServiceArea}
                className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
              >
                Add Service Area
              </button>
              <button
                onClick={() => setShowAddArea(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-500 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Service Areas List */}
        {serviceAreas.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            No service areas added yet
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {serviceAreas.map((area) => (
              <div
                key={area.id}
                className="flex items-center justify-between p-4 bg-slate-700/30 border border-slate-600 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-cyan-400" />
                  <div>
                    <div className="font-medium text-white">
                      {area.suburb ? `${area.suburb}, ` : ''}{area.postcode}
                    </div>
                    <div className="text-sm text-slate-400">{area.state}</div>
                  </div>
                </div>
                <button
                  onClick={() => deleteServiceArea(area.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
