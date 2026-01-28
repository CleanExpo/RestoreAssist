'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  Search,
  User,
  Mail,
  Phone,
  Building2,
  CheckSquare
} from 'lucide-react'
import { ContactFormModal } from '@/components/crm/ContactFormModal'

interface Contact {
  id: string
  fullName: string
  email: string
  phone: string | null
  title: string | null
  lifecycleStage: string
  status: string
  isPrimaryContact: boolean
  createdAt: string
  company: {
    id: string
    name: string
  } | null
  _count: {
    activities: number
    tasks: number
    opportunities: number
  }
  contactTags: Array<{
    tag: {
      id: string
      name: string
      color: string
    }
  }>
}

export default function ContactsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchContacts()
    }
  }, [status, search, stage, statusFilter])

  const fetchContacts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (stage) params.append('stage', stage)
      if (statusFilter) params.append('status', statusFilter)

      const res = await fetch(`/api/crm/contacts?${params}`)
      const data = await res.json()
      setContacts(data.contacts || [])
    } catch (error) {
      console.error('Failed to fetch contacts:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Contacts
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:scale-[1.02] transition-transform"
        >
          <Plus className="h-5 w-5" />
          Add Contact
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">All Stages</option>
          <option value="LEAD">Lead</option>
          <option value="QUALIFIED_LEAD">Qualified Lead</option>
          <option value="CUSTOMER">Customer</option>
          <option value="REPEAT_CUSTOMER">Repeat Customer</option>
          <option value="VIP_CUSTOMER">VIP Customer</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PROSPECT">Prospect</option>
        </select>
      </div>

      {/* Contact Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          Loading contacts...
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-12">
          <User className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            No contacts found
          </p>
          <p className="text-slate-400 dark:text-slate-500 mt-2">
            Try adjusting your search filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {contacts.map((contact) => (
            <Link
              key={contact.id}
              href={`/dashboard/crm/contacts/${contact.id}`}
              className="block bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-lg dark:hover:border-cyan-500/50 transition-all cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-cyan-500/10 rounded-lg">
                  <User className="h-6 w-6 text-cyan-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-white truncate">
                      {contact.fullName}
                    </h3>
                    {contact.isPrimaryContact && (
                      <span className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        Primary
                      </span>
                    )}
                  </div>

                  {contact.title && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                      {contact.title}
                    </p>
                  )}

                  {/* Company */}
                  {contact.company && (
                    <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400 mb-2">
                      <Building2 className="h-4 w-4" />
                      <span className="truncate">{contact.company.name}</span>
                    </div>
                  )}

                  {/* Contact Info */}
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                      <Mail className="h-4 w-4" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                    {contact.phone && (
                      <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                        <Phone className="h-4 w-4" />
                        <span>{contact.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Lifecycle Stage Badge */}
                  <span className="inline-block text-xs px-2 py-1 rounded bg-green-500/10 text-green-600 dark:text-green-400 mb-3">
                    {contact.lifecycleStage.replace(/_/g, ' ')}
                  </span>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mt-3">
                    <span className="flex items-center gap-1">
                      <CheckSquare className="h-4 w-4" />
                      {contact._count.tasks} tasks
                    </span>
                  </div>

                  {/* Tags */}
                  {contact.contactTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {contact.contactTags.slice(0, 2).map((ct) => (
                        <span
                          key={ct.tag.id}
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            backgroundColor: `${ct.tag.color}20`,
                            color: ct.tag.color
                          }}
                        >
                          {ct.tag.name}
                        </span>
                      ))}
                      {contact.contactTags.length > 2 && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          +{contact.contactTags.length - 2} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Contact Modal */}
      <ContactFormModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false)
          fetchContacts()
        }}
      />
    </div>
  )
}
