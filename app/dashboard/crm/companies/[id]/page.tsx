'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Users,
  Activity,
  CheckSquare,
  Briefcase,
  Edit,
  MapPin,
  Globe,
  AlertTriangle
} from 'lucide-react'
import { ActivityTimeline } from '@/components/crm/ActivityTimeline'
import { TaskList } from '@/components/crm/TaskList'
import { ContactCard } from '@/components/crm/ContactCard'
import { CompanyFormModal } from '@/components/crm/CompanyFormModal'
import toast from 'react-hot-toast'

interface Company {
  id: string
  name: string
  industry?: string
  website?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  postcode?: string
  country?: string
  abn?: string
  acn?: string
  description?: string
  status: string
  lifecycleStage: string
  relationshipScore?: number
  potentialRevenue?: number
  companyTags?: Array<{
    tag: {
      id: string
      name: string
      color: string
    }
  }>
  _count?: {
    contacts: number
    activities: number
    tasks: number
    opportunities: number
    reports: number
  }
}

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [company, setCompany] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'activities' | 'tasks'>('overview')
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params
      setCompanyId(resolvedParams.id)
    }
    getParams()
  }, [params])

  useEffect(() => {
    if (!companyId) return
    fetchCompanyData()
  }, [companyId])

  const fetchCompanyData = async () => {
    if (!companyId) return

    try {
      setLoading(true)

      // Fetch company
      const companyResponse = await fetch(`/api/crm/companies/${companyId}`)
      if (companyResponse.ok) {
        const companyData = await companyResponse.json()
        setCompany(companyData.company)
      } else {
        setError('Company not found')
      }

      // Fetch contacts
      const contactsResponse = await fetch(`/api/crm/companies/${companyId}/contacts?limit=20`)
      if (contactsResponse.ok) {
        const contactsData = await contactsResponse.json()
        setContacts(contactsData.contacts || [])
      }

      // Fetch activities
      const activitiesResponse = await fetch(`/api/crm/companies/${companyId}/activities?limit=50`)
      if (activitiesResponse.ok) {
        const activitiesData = await activitiesResponse.json()
        setActivities(activitiesData.activities || [])
      }

      // Fetch tasks
      const tasksResponse = await fetch(`/api/crm/tasks?companyId=${companyId}`)
      if (tasksResponse.ok) {
        const tasksData = await tasksResponse.json()
        setTasks(tasksData.tasks || [])
      }
    } catch (err) {
      setError('Failed to load company data')
      console.error('Error fetching company:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleTaskComplete = async (taskId: string) => {
    try {
      await fetch(`/api/crm/tasks/${taskId}/complete`, { method: 'POST' })
      toast.success('Task marked as complete')
      fetchCompanyData()
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

  if (error || !company) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Company Not Found</h2>
          <p className="text-slate-400 mb-4">{error || 'The requested company could not be found.'}</p>
          <button
            onClick={() => router.push('/dashboard/crm/companies')}
            className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
          >
            Back to Companies
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

  const address = [company.addressLine1, company.city, company.state, company.postcode]
    .filter(Boolean)
    .join(', ')

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Building2 },
    { id: 'contacts', label: `Contacts (${company._count?.contacts || 0})`, icon: Users },
    { id: 'activities', label: `Activities (${company._count?.activities || 0})`, icon: Activity },
    { id: 'tasks', label: `Tasks (${company._count?.tasks || 0})`, icon: CheckSquare }
  ]

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/crm/companies')}
            className="p-2 hover:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{company.name}</h1>
            <p className="text-slate-600 dark:text-slate-400">{company.industry || 'No industry specified'}</p>
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

      {/* Company Info Card */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Status */}
          <div>
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Status</h3>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-lg text-sm font-medium ${getLifecycleColor(company.lifecycleStage)}`}>
                {company.lifecycleStage}
              </span>
              <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                company.status === 'ACTIVE' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300'
              }`}>
                {company.status}
              </span>
            </div>
          </div>

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

          {/* Website */}
          {company.website && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Website</h3>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <a
                  href={company.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-cyan-500 hover:text-cyan-600 transition-colors truncate"
                >
                  {company.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            </div>
          )}

          {/* ABN/ACN */}
          {(company.abn || company.acn) && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Business Numbers</h3>
              <div className="space-y-1 text-sm text-slate-900 dark:text-white">
                {company.abn && <div>ABN: {company.abn}</div>}
                {company.acn && <div>ACN: {company.acn}</div>}
              </div>
            </div>
          )}

          {/* Relationship Score */}
          {company.relationshipScore !== null && company.relationshipScore !== undefined && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Relationship Score</h3>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{company.relationshipScore}/100</div>
            </div>
          )}

          {/* Potential Revenue */}
          {company.potentialRevenue && (
            <div>
              <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Potential Revenue</h3>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">
                ${company.potentialRevenue.toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        {company.description && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Description</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300">{company.description}</p>
          </div>
        )}

        {/* Tags */}
        {company.companyTags && company.companyTags.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {company.companyTags.map(({ tag }) => (
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
      {company._count && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-5 w-5 text-cyan-500" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Contacts</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{company._count.contacts}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Activities</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{company._count.activities}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckSquare className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Tasks</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{company._count.tasks}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="h-5 w-5 text-purple-500" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Jobs</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{company._count.reports || 0}</div>
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

          {activeTab === 'contacts' && (
            <div>
              {contacts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {contacts.map(contact => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      onClick={() => router.push(`/dashboard/crm/contacts/${contact.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  No contacts yet
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

      {/* Edit Company Modal */}
      <CompanyFormModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={() => {
          setShowEditModal(false)
          fetchCompanyData()
        }}
        companyId={companyId}
      />
    </div>
  )
}
