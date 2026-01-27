"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Edit, Trash2, Phone, Mail, MapPin, Building, User, Calendar, DollarSign, FileText, AlertTriangle, Eye } from "lucide-react"
import toast from "react-hot-toast"
import PortalInvitationSection from "@/components/dashboard/PortalInvitationSection"

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
  reports: Array<{
    id: string
    title: string
    status: string
    totalCost: number
    createdAt: string
    reportNumber?: string
    waterCategory?: string
    waterClass?: string
    affectedArea?: number
  }>
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchClient()
  }, [params.id])

  const fetchClient = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/clients/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setClient(data)
      } else {
        toast.error("Failed to fetch client details")
      }
    } catch (error) {
      console.error("Error fetching client:", error)
      toast.error("Failed to fetch client details")
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed": return "bg-emerald-500/20 text-emerald-400"
      case "in_progress": return "bg-blue-500/20 text-blue-400"
      case "pending": return "bg-amber-500/20 text-amber-400"
      case "draft": return "bg-slate-500/20 text-slate-400"
      default: return "bg-slate-500/20 text-slate-400"
    }
  }

  const getClientStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-emerald-500/20 text-emerald-400"
      case "INACTIVE": return "bg-amber-500/20 text-amber-400"
      case "PROSPECT": return "bg-blue-500/20 text-blue-400"
      case "ARCHIVED": return "bg-slate-500/20 text-slate-400"
      default: return "bg-slate-500/20 text-slate-400"
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-slate-400 mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">Client not found</h3>
        <p className="text-slate-400 mb-4">The client you're looking for doesn't exist or has been deleted.</p>
        <Link 
          href="/dashboard/clients"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Clients
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/dashboard/clients"
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-semibold mb-2">{client.name}</h1>
            <p className="text-slate-400">Client Details & History</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href={`/dashboard/clients/${client.id}/edit`}
            className="flex items-center gap-2 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            <Edit size={16} />
            Edit Client
          </Link>
        </div>
      </div>

      {/* Client Info Cards */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Contact Information */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <User className="text-cyan-400" size={20} />
            Contact Information
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="text-slate-400" size={16} />
              <span className="text-slate-300">{client.email}</span>
            </div>
            {client.phone && (
              <div className="flex items-center gap-3">
                <Phone className="text-slate-400" size={16} />
                <span className="text-slate-300">{client.phone}</span>
              </div>
            )}
            {client.address && (
              <div className="flex items-center gap-3">
                <MapPin className="text-slate-400" size={16} />
                <span className="text-slate-300">{client.address}</span>
              </div>
            )}
            {client.company && (
              <div className="flex items-center gap-3">
                <Building className="text-slate-400" size={16} />
                <span className="text-slate-300">{client.company}</span>
              </div>
            )}
          </div>
        </div>

        {/* Business Information */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Building className="text-blue-400" size={20} />
            Business Information
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Status</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getClientStatusColor(client.status)}`}>
                {client.status}
              </span>
            </div>
            {client.contactPerson && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Contact Person</span>
                <span className="text-slate-300">{client.contactPerson}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Client Since</span>
              <span className="text-slate-300">{new Date(client.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Last Updated</span>
              <span className="text-slate-300">{new Date(client.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <DollarSign className="text-emerald-400" size={20} />
            Statistics
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Reports</span>
              <span className="text-2xl font-bold text-cyan-400">{client.reportsCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Total Revenue</span>
              <span className="text-2xl font-bold text-emerald-400">${client.totalRevenue.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Last Job</span>
              <span className="text-slate-300">{client.lastJob}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Avg. Job Value</span>
              <span className="text-slate-300">
                ${client.reportsCount > 0 ? Math.round(client.totalRevenue / client.reportsCount).toLocaleString() : "0"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      {client.notes && (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <FileText className="text-amber-400" size={20} />
            Notes
          </h3>
          <p className="text-slate-300">{client.notes}</p>
        </div>
      )}

      {/* Portal Invitation Section */}
      <PortalInvitationSection
        clientId={client.id}
        clientEmail={client.email}
        clientName={client.name}
      />

      {/* Reports History */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
          <FileText className="text-blue-400" size={20} />
          Reports History ({client.reportsCount})
        </h3>
        {client.reports.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-400">No reports found for this client.</p>
            <Link 
              href="/dashboard/reports/new"
              className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Create First Report
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {client.reports.map((report) => (
              <div key={report.id} className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium text-white">{report.title}</h4>
                  <div className="flex items-center gap-4 mt-1 text-sm text-slate-400">
                    <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                    {report.reportNumber && (
                      <span>#{report.reportNumber}</span>
                    )}
                    {report.waterCategory && (
                      <span>{report.waterCategory}</span>
                    )}
                    {report.affectedArea && (
                      <span>{report.affectedArea} sq ft</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-lg font-bold text-cyan-400">${(report.totalCost || 0).toLocaleString()}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(report.status)}`}>
                    {report.status.replace("_", " ")}
                  </span>
                  <Link 
                    href={`/dashboard/reports/${report.id}`}
                    className="flex items-center gap-1 text-cyan-400 hover:underline text-sm"
                  >
                    <Eye size={14} />
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}