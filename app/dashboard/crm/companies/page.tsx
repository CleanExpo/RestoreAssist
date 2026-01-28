'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Plus,
  Search,
  Building2,
  Filter,
  Users as UsersIcon,
  CheckSquare,
  TrendingUp
} from 'lucide-react'
import { CompanyFormModal } from '@/components/crm/CompanyFormModal'

interface Company {
  id: string
  name: string
  industry: string | null
  lifecycleStage: string
  status: string
  createdAt: string
  _count: {
    contacts: number
    activities: number
    tasks: number
    opportunities: number
  }
  companyTags: Array<{
    tag: {
      id: string
      name: string
      color: string
    }
  }>
}

export default function CompaniesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      fetchCompanies()
    }
  }, [status, search, stage, statusFilter])

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (stage) params.append('stage', stage)
      if (statusFilter) params.append('status', statusFilter)

      const res = await fetch(`/api/crm/companies?${params}`)
      const data = await res.json()
      setCompanies(data.companies || [])
    } catch (error) {
      console.error('Failed to fetch companies:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          Companies
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:scale-[1.02] transition-transform"
        >
          <Plus className="h-5 w-5" />
          Add Company
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
            placeholder="Search companies..."
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

      {/* Company Grid */}
      {loading ? (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          Loading companies...
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            No companies found
          </p>
          <p className="text-slate-400 dark:text-slate-500 mt-2">
            Try adjusting your search filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/dashboard/crm/companies/${company.id}`}
              className="block bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-lg dark:hover:border-cyan-500/50 transition-all cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Building2 className="h-6 w-6 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-white mb-1 truncate">
                    {company.name}
                  </h3>
                  {company.industry && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                      {company.industry}
                    </p>
                  )}

                  {/* Lifecycle Stage Badge */}
                  <span className="inline-block text-xs px-2 py-1 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 mb-3">
                    {company.lifecycleStage.replace(/_/g, ' ')}
                  </span>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mt-3">
                    <span className="flex items-center gap-1">
                      <UsersIcon className="h-4 w-4" />
                      {company._count.contacts}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckSquare className="h-4 w-4" />
                      {company._count.tasks}
                    </span>
                  </div>

                  {/* Tags */}
                  {company.companyTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {company.companyTags.slice(0, 2).map((ct) => (
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
                      {company.companyTags.length > 2 && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          +{company.companyTags.length - 2} more
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

      {/* Create Company Modal */}
      <CompanyFormModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false)
          fetchCompanies()
        }}
      />
    </div>
  )
}
