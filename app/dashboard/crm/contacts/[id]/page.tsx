'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  User,
  Activity,
  CheckSquare,
  Edit,
  Mail,
  Phone,
  Building2,
  MapPin,
  Smartphone,
  Star,
  AlertTriangle
} from 'lucide-react'
import { ActivityTimeline } from '@/components/crm/ActivityTimeline'
import { TaskList } from '@/components/crm/TaskList'
import { ContactFormModal } from '@/components/crm/ContactFormModal'
import toast from 'react-hot-toast'

interface Contact {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email: string
  phone?: string
  mobilePhone?: string
  title?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  status: string
  lifecycleStage: string
  isPrimaryContact: boolean
  company?: {
    id: string
    name: string
  }
  contactTags?: Array<{
    tag: {
      id: string
      name: string
      color: string
    }
  }>
  _count?: {
    activities: number
    tasks: number
    reports: number
  }
}

export default function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [contact, setContact] = useState<Contact | null>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contactId, setContactId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'tasks'>('overview')
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params
      setContactId(resolvedParams.id)
    }
    getParams()
  }, [params])

  useEffect(() => {
    if (!contactId) return
    fetchContactData()
  }, [contactId])

  const fetchContactData = async () => {
    if (!contactId) return

    try {
      setLoading(true)

      // Fetch contact
      const contactResponse = await fetch(`/api/crm/contacts/${contactId}`)
      if (contactResponse.ok) {
        const contactData = await contactResponse.json()
        setContact(contactData.contact)
      } else {
        setError('Contact not found')
      }

      // Fetch activities
      const activitiesResponse = await fetch(`/api/crm/contacts/${contactId}/activities?limit=50`)
      if (activitiesResponse.ok) {
        const activitiesData = await activitiesResponse.json()
        setActivities(activitiesData.activities || [])
      }

      // Fetch tasks
      const tasksResponse = await fetch(`/api/crm/tasks?contactId=${contactId}`)
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json()
        setTasks(tasksData.tasks || [])
      }
    } catch (err) {
      setError('Failed to load contact data')
      console.error('Error fetching contact:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTaskComplete = async (taskId: string) => {
    try {
      await fetch(`/api/crm/tasks/${taskId}/complete`, { method: 'POST' })
      toast.success('Task marked as complete')
      fetchContactData()
    } catch (error) {
      console.error('Failed to complete task:', error)
      toast.error('Failed to complete task')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    )
  }

  if (error || !contact) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Contact Not Found</h2>
          <p className="text-slate-400 mb-4">{error || 'The requested contact could not be found.'}</p>
          <button
            onClick={() => router.push('/dashboard/crm/contacts')}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            Back to Contacts
          </button>
        </div>
      </div>
    )
  }

  const getLifecycleColor = (stage: string) => {
    switch (stage) {
      case 'LEAD':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      case 'PROSPECT':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
      case 'CUSTOMER':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
      case 'PARTNER':
        return 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
      default:
        return 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300'
    }
  }

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase()
  }

  const address = [contact.addressLine1, contact.city, contact.state, contact.postcode]
    .filter(Boolean)
    .join(', ')

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'activities', label: `Activities (${contact._count?.activities || 0})`, icon: Activity },
    { id: 'tasks', label: `Tasks (${contact._count?.tasks || 0})`, icon: CheckSquare }
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/crm/contacts')}
            className="p-2 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-cyan-500 text-white flex items-center justify-center text-lg font-semibold">
              {getInitials(contact.firstName, contact.lastName)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{contact.fullName}</h1>
                {contact.isPrimaryContact && (
                  <Star className="h-5 w-5 text-amber-500 fill-current" />
                )}
              </div>
              <p className="text-slate-600 dark:text-slate-400">{contact.title || 'No title'}</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowEditModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
        >
          <Edit className="h-4 w-4" />
          <span>Edit</span>
        </button>
      </div>

      {/* Contact Info Card */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Status */}
          <div>
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Status</h3>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-lg text-sm font-medium ${getLifecycleColor(contact.lifecycleStage)}`}>
                {contact.lifecycleStage}
              </span>
              <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                contact.status === 'ACTIVE' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300'
              }`}>
                {contact.status}
              </span>
            </div>
          </div>

          {/* Company */}
          {contact.company && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Company</h3>
              <button
                onClick={() => router.push(`/dashboard/crm/companies/${contact.company?.id}`)}
                className="flex items-center gap-2 text-cyan-500 hover:text-cyan-600 transition-colors"
              >
                <Building2 className="h-4 w-4" />
                <span className="text-sm font-medium">{contact.company.name}</span>
              </button>
            </div>
          )}

          {/* Email */}
          <div>
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Email</h3>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <a
                href={`mailto:${contact.email}`}
                className="text-sm text-cyan-500 hover:text-cyan-600 transition-colors truncate"
              >
                {contact.email}
              </a>
            </div>
          </div>

          {/* Phone */}
          {contact.phone && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Phone</h3>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <a
                  href={`tel:${contact.phone}`}
                  className="text-sm text-slate-900 dark:text-white hover:text-cyan-500 transition-colors"
                >
                  {contact.phone}
                </a>
              </div>
            </div>
          )}

          {/* Mobile */}
          {contact.mobilePhone && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Mobile</h3>
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                <a
                  href={`tel:${contact.mobilePhone}`}
                  className="text-sm text-slate-900 dark:text-white hover:text-cyan-500 transition-colors"
                >
                  {contact.mobilePhone}
                </a>
              </div>
            </div>
          )}

          {/* Address */}
          {address && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Address</h3>
              <div className="flex items-start gap-2 text-slate-900 dark:text-white">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{address}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        {contact.contactTags && contact.contactTags.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {contact.contactTags.map(({ tag }) => (
                <div
                  key={tag.id}
                  style={{ backgroundColor: tag.color + '20', borderColor: tag.color, color: tag.color }}
                  className="flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium"
                >
                  <span>{tag.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats Row */}
      {contact._count && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Activities</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{contact._count.activities}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckSquare className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Tasks</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{contact._count.tasks}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="h-5 w-5 text-purple-500" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Jobs</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{contact._count.reports || 0}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        {/* Tab Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-700">
          <div className="flex overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Activity</h2>
                <ActivityTimeline activities={activities.slice(0, 5)} />
              </div>
              {activities.length === 0 && (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  No activities yet
                </div>
              )}
            </div>
          )}

          {activeTab === 'activities' && (
            <div>
              <ActivityTimeline activities={activities} showFilters />
            </div>
          )}

          {activeTab === 'tasks' && (
            <div>
              <TaskList
                tasks={tasks}
                onTaskComplete={handleTaskComplete}
                onTaskClick={(task) => console.log('Task clicked:', task)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Edit Contact Modal */}
      <ContactFormModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={() => {
          setShowEditModal(false)
          fetchContactData()
        }}
        contactId={contactId}
      />
    </div>
  )
}
