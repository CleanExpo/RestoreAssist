'use client'

import { useState, useEffect } from 'react'
import { Mail, Send, RefreshCw, CheckCircle, XCircle, Clock, Key } from 'lucide-react'
import toast from 'react-hot-toast'

interface PortalInvitationSectionProps {
  clientId: string
  clientEmail: string
  clientName: string
}

interface Invitation {
  id: string
  email: string
  token: string
  status: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export default function PortalInvitationSection({ clientId, clientEmail, clientName }: PortalInvitationSectionProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteMessage, setInviteMessage] = useState('')

  useEffect(() => {
    fetchInvitations()
  }, [clientId])

  const fetchInvitations = async () => {
    try {
      const response = await fetch(`/api/portal/invitations?clientId=${clientId}`)
      if (response.ok) {
        const data = await response.json()
        setInvitations(data.invitations)
      }
    } catch (error) {
      console.error('Error fetching invitations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSendInvitation = async () => {
    setSending(true)
    try {
      const response = await fetch('/api/portal/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          message: inviteMessage || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation')
      }

      toast.success('Portal invitation sent successfully!')
      setShowInviteModal(false)
      setInviteMessage('')
      fetchInvitations()
    } catch (error: any) {
      toast.error(error.message || 'Failed to send invitation')
    } finally {
      setSending(false)
    }
  }

  const handleResendInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/portal/invitations/${invitationId}/resend`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error('Failed to resend invitation')
      }

      toast.success('Invitation resent successfully!')
      fetchInvitations()
    } catch (error: any) {
      toast.error(error.message || 'Failed to resend invitation')
    }
  }

  const getStatusBadge = (status: string) => {
    const config = {
      PENDING: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: <Clock size={14} /> },
      ACCEPTED: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: <CheckCircle size={14} /> },
      EXPIRED: { bg: 'bg-red-500/20', text: 'text-red-400', icon: <XCircle size={14} /> },
      REVOKED: { bg: 'bg-slate-500/20', text: 'text-slate-400', icon: <XCircle size={14} /> },
    }
    return config[status as keyof typeof config] || config.PENDING
  }

  const latestInvitation = invitations[0]
  const hasActiveInvitation = latestInvitation?.status === 'ACCEPTED'

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Key className="text-purple-400" size={20} />
          Client Portal Access
        </h3>
        {!hasActiveInvitation && (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors text-sm"
          >
            <Send size={16} />
            Send Portal Invitation
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto"></div>
        </div>
      ) : hasActiveInvitation ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle size={18} />
            <span className="font-medium">Client has portal access</span>
          </div>
          <div className="text-sm text-slate-400">
            <p>{clientName} accepted their invitation on {new Date(latestInvitation.acceptedAt!).toLocaleDateString()}.</p>
            <p className="mt-1">They can log in at: <span className="text-purple-400">https://restoreassist.com.au/portal/login</span></p>
          </div>
        </div>
      ) : invitations.length === 0 ? (
        <div className="text-center py-4">
          <Mail className="mx-auto h-12 w-12 text-slate-400 mb-2" />
          <p className="text-slate-400 text-sm">No portal invitations sent yet.</p>
          <p className="text-slate-500 text-xs mt-1">Send an invitation to give this client access to their restoration reports.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(invitation.status).bg} ${getStatusBadge(invitation.status).text}`}>
                    {getStatusBadge(invitation.status).icon}
                    {invitation.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  <span>Sent {new Date(invitation.createdAt).toLocaleDateString()}</span>
                  {invitation.status === 'PENDING' && (
                    <span className="ml-3">Expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              {invitation.status === 'PENDING' && (
                <button
                  onClick={() => handleResendInvitation(invitation.id)}
                  className="flex items-center gap-1 px-3 py-1 text-xs text-purple-400 hover:bg-purple-500/20 rounded transition-colors"
                >
                  <RefreshCw size={12} />
                  Resend
                </button>
              )}
              {invitation.status === 'EXPIRED' && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="flex items-center gap-1 px-3 py-1 text-xs text-purple-400 hover:bg-purple-500/20 rounded transition-colors"
                >
                  <Send size={12} />
                  Send New
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-white mb-4">Send Portal Invitation</h3>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Client Email
                </label>
                <input
                  type="email"
                  value={clientEmail}
                  disabled
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Personal Message (Optional)
                </label>
                <textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Add a personal message to include in the invitation email..."
                />
              </div>

              <div className="text-xs text-slate-400 bg-slate-700/30 p-3 rounded">
                <p className="font-medium text-slate-300 mb-1">What happens next:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>{clientName} will receive an email invitation</li>
                  <li>They can create their portal account using the link</li>
                  <li>Once registered, they can view their restoration reports</li>
                  <li>They can approve scope of work and cost estimates</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowInviteModal(false)
                  setInviteMessage('')
                }}
                disabled={sending}
                className="flex-1 px-4 py-2 border border-slate-600 text-white rounded-lg hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvitation}
                disabled={sending}
                className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Send Invitation
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
