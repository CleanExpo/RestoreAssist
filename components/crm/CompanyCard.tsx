'use client'

import React from 'react'
import { Building2, MapPin, Phone, Mail, Globe, Users, Briefcase, Tag as TagIcon } from 'lucide-react'

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
  status: string
  lifecycleStage: string
  companyTags?: Array<{
    tag: {
      id: string
      name: string
      color: string
    }
  }>
  _count?: {
    contacts?: number
    activities?: number
    tasks?: number
    opportunities?: number
    reports?: number
  }
}

interface CompanyCardProps {
  company: Company
  onClick?: () => void
  showDetails?: boolean
}

export function CompanyCard({ company, onClick, showDetails = true }: CompanyCardProps) {
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
      case 'INACTIVE':
        return 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300'
      case 'ARCHIVED':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
      default:
        return 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300'
    }
  }

  const address = [company.addressLine1, company.city, company.state, company.postcode]
    .filter(Boolean)
    .join(', ')

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-4 shadow-sm ${
        onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                {company.name}
              </h3>
              {company.industry && (
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                  {company.industry}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLifecycleColor(company.lifecycleStage)}`}>
            {company.lifecycleStage}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(company.status)}`}>
            {company.status}
          </span>
        </div>
      </div>

      {/* Details */}
      {showDetails && (
        <div className="space-y-2 mb-3">
          {address && (
            <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-1">{address}</span>
            </div>
          )}

          {company.website && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Globe className="h-4 w-4 flex-shrink-0" />
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
              >
                {company.website.replace(/^https?:\/\//, '')}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {company.companyTags && company.companyTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {company.companyTags.slice(0, 3).map(({ tag }) => (
            <div
              key={tag.id}
              style={{ backgroundColor: tag.color + '20', borderColor: tag.color, color: tag.color }}
              className="flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium"
            >
              <TagIcon className="h-2.5 w-2.5" />
              <span>{tag.name}</span>
            </div>
          ))}
          {company.companyTags.length > 3 && (
            <div className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs font-medium">
              +{company.companyTags.length - 3}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {company._count && (
        <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          {company._count.contacts !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <Users className="h-3.5 w-3.5" />
              <span className="font-medium">{company._count.contacts}</span>
              <span>contacts</span>
            </div>
          )}
          {company._count.opportunities !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <Briefcase className="h-3.5 w-3.5" />
              <span className="font-medium">{company._count.opportunities}</span>
              <span>deals</span>
            </div>
          )}
          {company._count.reports !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <Briefcase className="h-3.5 w-3.5" />
              <span className="font-medium">{company._count.reports}</span>
              <span>jobs</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
