'use client'

import { useState, useEffect } from 'react'
import { Search, MapPin, Star, Shield, Users, Award, Filter } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'

interface Contractor {
  id: string
  slug: string
  businessName: string
  businessLogo: string | null
  businessAddress: string | null
  publicDescription: string | null
  yearsInBusiness: number | null
  teamSize: number | null
  isVerified: boolean
  averageRating: number
  totalReviews: number
  completedJobs: number
  specializations: string[]
  certifications: Array<{
    certificationType: string
    certificationName: string
  }>
  serviceAreas: Array<{
    postcode: string
    suburb: string | null
    state: string
  }>
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export default function ContractorDirectoryPage() {
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [postcode, setPostcode] = useState('')
  const [state, setState] = useState('')
  const [minRating, setMinRating] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchContractors()
  }, [search, postcode, state, minRating, page])

  const fetchContractors = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.append('search', search)
      if (postcode) params.append('postcode', postcode)
      if (state) params.append('state', state)
      if (minRating) params.append('minRating', minRating)
      params.append('page', page.toString())

      const res = await fetch(`/api/contractors?${params}`)
      const data = await res.json()

      setContractors(data.contractors || [])
      setPagination(data.pagination)
    } catch (error) {
      console.error('Failed to fetch contractors:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchContractors()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-black/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Find Restoration Contractors
          </h1>
          <p className="text-slate-400 text-lg">
            Connect with verified restoration professionals in your area
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <div className="mb-8 space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by business name or specialization..."
                className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="px-6 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white hover:bg-slate-700/50 transition-colors flex items-center gap-2"
            >
              <Filter className="h-5 w-5" />
              Filters
            </button>
          </form>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-800/30 border border-slate-700 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Postcode
                </label>
                <input
                  type="text"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="e.g. 2000"
                  className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  State
                </label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">All States</option>
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

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Minimum Rating
                </label>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Any Rating</option>
                  <option value="4">4+ Stars</option>
                  <option value="4.5">4.5+ Stars</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Results Count */}
        {pagination && (
          <div className="mb-6 text-slate-400">
            Showing {contractors.length} of {pagination.total} contractors
          </div>
        )}

        {/* Contractor Cards */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">
            Loading contractors...
          </div>
        ) : contractors.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">No contractors found</p>
            <p className="text-slate-500 mt-2">Try adjusting your search filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {contractors.map((contractor) => (
              <Link
                key={contractor.id}
                href={`/contractors/${contractor.slug}`}
                className="block bg-slate-800/30 border border-slate-700 rounded-lg p-6 hover:bg-slate-800/50 hover:border-cyan-500/50 transition-all"
              >
                <div className="flex items-start gap-4">
                  {/* Logo */}
                  <div className="flex-shrink-0">
                    {contractor.businessLogo ? (
                      <Image
                        src={contractor.businessLogo}
                        alt={contractor.businessName}
                        width={80}
                        height={80}
                        className="rounded-lg border border-slate-700"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-slate-700/50 flex items-center justify-center">
                        <Users className="h-8 w-8 text-slate-500" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h3 className="text-xl font-semibold text-white flex items-center gap-2">
                        {contractor.businessName}
                        {contractor.isVerified && (
                          <Shield className="h-5 w-5 text-cyan-400" />
                        )}
                      </h3>
                    </div>

                    {/* Rating */}
                    {contractor.totalReviews > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center gap-1">
                          <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
                          <span className="text-white font-medium">
                            {contractor.averageRating.toFixed(1)}
                          </span>
                        </div>
                        <span className="text-slate-400 text-sm">
                          ({contractor.totalReviews} reviews)
                        </span>
                      </div>
                    )}

                    {/* Description */}
                    {contractor.publicDescription && (
                      <p className="text-slate-300 text-sm mb-3 line-clamp-2">
                        {contractor.publicDescription}
                      </p>
                    )}

                    {/* Metadata */}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-400 mb-3">
                      {contractor.yearsInBusiness && (
                        <span>{contractor.yearsInBusiness} years experience</span>
                      )}
                      {contractor.teamSize && (
                        <span>{contractor.teamSize} team members</span>
                      )}
                      {contractor.completedJobs > 0 && (
                        <span>{contractor.completedJobs} completed jobs</span>
                      )}
                    </div>

                    {/* Certifications */}
                    {contractor.certifications.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {contractor.certifications.slice(0, 3).map((cert, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded text-xs text-cyan-400"
                          >
                            <Award className="h-3 w-3" />
                            {cert.certificationName}
                          </span>
                        ))}
                        {contractor.certifications.length > 3 && (
                          <span className="text-xs text-slate-400">
                            +{contractor.certifications.length - 3} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Service Areas */}
                    {contractor.serviceAreas.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <MapPin className="h-4 w-4" />
                        <span>
                          Services: {contractor.serviceAreas.map(a => a.state).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="mt-8 flex justify-center gap-2">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700/50 transition-colors"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-slate-300">
              Page {page} of {pagination.pages}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === pagination.pages}
              className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-700/50 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
