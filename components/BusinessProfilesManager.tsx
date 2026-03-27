"use client"

import { useState, useEffect, useCallback } from "react"
import { Building2, Plus, Trash2, Edit, Check, X, Star, Upload, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import toast from "react-hot-toast"

interface BusinessProfile {
  id: string
  name: string
  abn: string | null
  logoUrl: string | null
  address: string | null
  phone: string | null
  email: string | null
  insuranceCertificateNumber: string | null
  insuranceExpiry: string | null
  licenceNumber: string | null
  licenceClass: string | null
  licenceExpiry: string | null
  isDefault: boolean
  createdAt: string
}

const EMPTY_FORM = {
  name: "",
  abn: "",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  insuranceCertificateNumber: "",
  insuranceExpiry: "",
  licenceNumber: "",
  licenceClass: "",
  licenceExpiry: "",
}

export function BusinessProfilesManager() {
  const [profiles, setProfiles] = useState<BusinessProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/business-profiles")
      if (!res.ok) return
      const data = await res.json()
      setProfiles(data.profiles || [])
      setActiveProfileId(data.activeBusinessProfileId || null)
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProfiles()
  }, [fetchProfiles])

  function startEdit(profile: BusinessProfile) {
    setEditingId(profile.id)
    setShowCreate(false)
    setFormData({
      name: profile.name || "",
      abn: profile.abn || "",
      logoUrl: profile.logoUrl || "",
      address: profile.address || "",
      phone: profile.phone || "",
      email: profile.email || "",
      insuranceCertificateNumber: profile.insuranceCertificateNumber || "",
      insuranceExpiry: profile.insuranceExpiry ? profile.insuranceExpiry.split("T")[0] : "",
      licenceNumber: profile.licenceNumber || "",
      licenceClass: profile.licenceClass || "",
      licenceExpiry: profile.licenceExpiry ? profile.licenceExpiry.split("T")[0] : "",
    })
  }

  function startCreate() {
    setShowCreate(true)
    setEditingId(null)
    setFormData(EMPTY_FORM)
  }

  function cancelEdit() {
    setEditingId(null)
    setShowCreate(false)
    setFormData(EMPTY_FORM)
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/upload/logo", { method: "POST", body: fd })
      if (!res.ok) throw new Error("Upload failed")
      const data = await res.json()
      setFormData((prev) => ({ ...prev, logoUrl: data.url }))
      toast.success("Logo uploaded")
    } catch {
      toast.error("Failed to upload logo")
    } finally {
      setUploadingLogo(false)
    }
  }

  async function saveProfile() {
    if (!formData.name.trim()) {
      toast.error("Business name is required")
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...formData,
        insuranceExpiry: formData.insuranceExpiry || null,
        licenceExpiry: formData.licenceExpiry || null,
      }

      if (editingId) {
        // Update existing
        const res = await fetch(`/api/business-profiles/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error("Update failed")
        toast.success("Profile updated")
      } else {
        // Create new
        const res = await fetch("/api/business-profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json()
          if (data.upgradeRequired) {
            toast.error("Upgrade to a Yearly or Enterprise plan to add more business profiles")
            return
          }
          throw new Error(data.error || "Create failed")
        }
        toast.success("Profile created")
      }

      cancelEdit()
      fetchProfiles()
    } catch (err: any) {
      toast.error(err.message || "Failed to save profile")
    } finally {
      setSaving(false)
    }
  }

  async function deleteProfile(id: string) {
    if (!confirm("Are you sure you want to delete this business profile?")) return

    try {
      const res = await fetch(`/api/business-profiles/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to delete")
        return
      }
      toast.success("Profile deleted")
      fetchProfiles()
    } catch {
      toast.error("Failed to delete profile")
    }
  }

  async function setDefault(id: string) {
    try {
      // First, unset all defaults
      // Then set this one as default via a special endpoint or PUT
      const res = await fetch(`/api/business-profiles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      })
      if (!res.ok) throw new Error("Failed to set default")
      toast.success("Default profile updated")
      fetchProfiles()
    } catch {
      toast.error("Failed to set default profile")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const isEditing = editingId !== null || showCreate

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className={cn("text-lg font-semibold", "text-neutral-900 dark:text-white")}>
            Business Profiles
          </h3>
          <p className={cn("text-sm mt-1", "text-neutral-500 dark:text-slate-400")}>
            Manage your business identities. Each profile has its own ABN, logo, insurance, and licence details for documents.
          </p>
        </div>
        {!isEditing && (
          <button
            onClick={startCreate}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-cyan-500 text-white hover:bg-cyan-600"
            )}
          >
            <Plus className="h-4 w-4" />
            Add Profile
          </button>
        )}
      </div>

      {/* Profile Cards */}
      {profiles.map((profile) => (
        <div
          key={profile.id}
          className={cn(
            "rounded-xl border p-6 transition-colors",
            profile.id === activeProfileId
              ? "border-cyan-500/50 bg-cyan-50/50 dark:bg-cyan-950/20"
              : "border-neutral-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          )}
        >
          {editingId === profile.id ? (
            // Edit Form
            renderForm()
          ) : (
            // Display Mode
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                {profile.logoUrl ? (
                  <img
                    src={profile.logoUrl}
                    alt={profile.name}
                    className="h-12 w-12 rounded-lg object-contain bg-white border border-neutral-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-neutral-100 dark:bg-slate-800 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-neutral-400" />
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={cn("font-semibold", "text-neutral-900 dark:text-white")}>
                      {profile.name}
                    </h4>
                    {profile.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Default
                      </span>
                    )}
                    {profile.id === activeProfileId && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400">
                        Active
                      </span>
                    )}
                  </div>
                  <div className={cn("text-sm mt-1 space-y-0.5", "text-neutral-500 dark:text-slate-400")}>
                    {profile.abn && <p>ABN: {profile.abn}</p>}
                    {profile.address && <p>{profile.address}</p>}
                    {profile.phone && <p>{profile.phone}</p>}
                    {profile.email && <p>{profile.email}</p>}
                    {profile.licenceNumber && (
                      <p>
                        Licence: {profile.licenceNumber}
                        {profile.licenceClass ? ` (${profile.licenceClass})` : ""}
                      </p>
                    )}
                    {profile.insuranceCertificateNumber && (
                      <p>Insurance: {profile.insuranceCertificateNumber}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!profile.isDefault && (
                  <button
                    onClick={() => setDefault(profile.id)}
                    title="Set as default"
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      "hover:bg-neutral-100 dark:hover:bg-slate-800",
                      "text-neutral-400 hover:text-amber-500"
                    )}
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => startEdit(profile)}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    "hover:bg-neutral-100 dark:hover:bg-slate-800",
                    "text-neutral-400 hover:text-cyan-500"
                  )}
                >
                  <Edit className="h-4 w-4" />
                </button>
                {!profile.isDefault && profiles.length > 1 && (
                  <button
                    onClick={() => deleteProfile(profile.id)}
                    className={cn(
                      "p-2 rounded-lg transition-colors",
                      "hover:bg-neutral-100 dark:hover:bg-slate-800",
                      "text-neutral-400 hover:text-red-500"
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Create New Profile Form */}
      {showCreate && (
        <div className={cn(
          "rounded-xl border p-6",
          "border-cyan-500/50 bg-white dark:bg-slate-900"
        )}>
          <h4 className={cn("font-semibold mb-4", "text-neutral-900 dark:text-white")}>
            New Business Profile
          </h4>
          {renderForm()}
        </div>
      )}

      {/* Separation notice */}
      <div className={cn(
        "rounded-lg p-4 text-sm",
        "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800",
        "text-blue-700 dark:text-blue-300"
      )}>
        <strong>Data separation:</strong> Clients, reports, invoices, and inspections are linked to the active business profile when created.
        If you sell a business, its data can be cleanly separated with all associated records.
      </div>
    </div>
  )

  function renderForm() {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Business Name */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Business Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
              placeholder="e.g. Acme Restoration Pty Ltd"
            />
          </div>

          {/* ABN */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              ABN
            </label>
            <input
              type="text"
              value={formData.abn}
              onChange={(e) => setFormData({ ...formData, abn: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
              placeholder="XX XXX XXX XXX"
            />
          </div>

          {/* Address */}
          <div className="md:col-span-2">
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Business Address
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
              placeholder="123 Main St, Brisbane QLD 4000"
            />
          </div>

          {/* Phone */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Phone
            </label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
              placeholder="04XX XXX XXX"
            />
          </div>

          {/* Email */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
              placeholder="info@business.com.au"
            />
          </div>

          {/* Logo Upload */}
          <div className="md:col-span-2">
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Logo
            </label>
            <div className="flex items-center gap-4">
              {formData.logoUrl && (
                <img
                  src={formData.logoUrl}
                  alt="Logo"
                  className="h-12 w-12 rounded-lg object-contain bg-white border border-neutral-200 dark:border-slate-700"
                />
              )}
              <label
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm cursor-pointer transition-colors",
                  "border border-neutral-300 dark:border-slate-600",
                  "hover:bg-neutral-50 dark:hover:bg-slate-800",
                  "text-neutral-700 dark:text-slate-300",
                  uploadingLogo && "opacity-50 cursor-wait"
                )}
              >
                {uploadingLogo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploadingLogo ? "Uploading..." : "Upload Logo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                />
              </label>
            </div>
          </div>

          {/* Divider - Insurance & Licence */}
          <div className="md:col-span-2 pt-2">
            <h5 className={cn("text-sm font-semibold", "text-neutral-700 dark:text-slate-300")}>
              Insurance & Licence Details
            </h5>
            <p className={cn("text-xs mt-0.5", "text-neutral-400 dark:text-slate-500")}>
              These appear on authority forms and compliance documents.
            </p>
          </div>

          {/* Insurance Certificate */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Insurance Certificate No.
            </label>
            <input
              type="text"
              value={formData.insuranceCertificateNumber}
              onChange={(e) => setFormData({ ...formData, insuranceCertificateNumber: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
            />
          </div>

          {/* Insurance Expiry */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Insurance Expiry
            </label>
            <input
              type="date"
              value={formData.insuranceExpiry}
              onChange={(e) => setFormData({ ...formData, insuranceExpiry: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
            />
          </div>

          {/* Licence Number */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Licence Number
            </label>
            <input
              type="text"
              value={formData.licenceNumber}
              onChange={(e) => setFormData({ ...formData, licenceNumber: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
            />
          </div>

          {/* Licence Class */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Licence Class
            </label>
            <input
              type="text"
              value={formData.licenceClass}
              onChange={(e) => setFormData({ ...formData, licenceClass: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
              placeholder="e.g. QBCC Class, VBA Category"
            />
          </div>

          {/* Licence Expiry */}
          <div>
            <label className={cn("block text-sm font-medium mb-1", "text-neutral-700 dark:text-slate-300")}>
              Licence Expiry
            </label>
            <input
              type="date"
              value={formData.licenceExpiry}
              onChange={(e) => setFormData({ ...formData, licenceExpiry: e.target.value })}
              className={cn(
                "w-full px-3 py-2 rounded-lg text-sm border",
                "bg-white dark:bg-slate-800",
                "border-neutral-300 dark:border-slate-600",
                "text-neutral-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              )}
            />
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={saveProfile}
            disabled={saving}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              "bg-cyan-500 text-white hover:bg-cyan-600",
              saving && "opacity-50 cursor-wait"
            )}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {saving ? "Saving..." : editingId ? "Update Profile" : "Create Profile"}
          </button>
          <button
            onClick={cancelEdit}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              "border border-neutral-300 dark:border-slate-600",
              "text-neutral-700 dark:text-slate-300",
              "hover:bg-neutral-50 dark:hover:bg-slate-800"
            )}
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      </div>
    )
  }
}
