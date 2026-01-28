'use client'

import React from 'react'
import { User, Mail, Phone, Building2, MapPin, Smartphone, Tag as TagIcon, Star } from 'lucide-react'

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
    activities?: number
    tasks?: number
    reports?: number
  }
}

interface ContactCardProps {
  contact: Contact
  onClick?: () => void
  showDetails?: boolean
}

export function ContactCard({ contact, onClick, showDetails = true }: ContactCardProps) {
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

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase()
  }

  const address = [contact.addressLine1, contact.city, contact.state, contact.postcode]
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
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-cyan-500 text-white flex items-center justify-center text-sm font-semibold">
              {getInitials(contact.firstName, contact.lastName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-slate-900 dark:text-white truncate">
                  {contact.fullName}
                </h3>
                {contact.isPrimaryContact && (
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-current flex-shrink-0" />
                )}
              </div>
              {contact.title && (
                <p className="text-sm text-slate-600 dark:text-slate-400 truncate">
                  {contact.title}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getLifecycleColor(contact.lifecycleStage)}`}>
            {contact.lifecycleStage}
          </span>
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(contact.status)}`}>
            {contact.status}
          </span>
        </div>
      </div>

      {/* Details */}
      {showDetails && (
        <div className="space-y-2 mb-3">
          {contact.company && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{contact.company.name}</span>
            </div>
          )}

          {contact.email && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <a
                href={`mailto:${contact.email}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
              >
                {contact.email}
              </a>
            </div>
          )}

          {contact.phone && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Phone className="h-4 w-4 flex-shrink-0" />
              <a
                href={`tel:${contact.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
              >
                {contact.phone}
              </a>
            </div>
          )}

          {contact.mobilePhone && (
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Smartphone className="h-4 w-4 flex-shrink-0" />
              <a
                href={`tel:${contact.mobilePhone}`}
                onClick={(e) => e.stopPropagation()}
                className="hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
              >
                {contact.mobilePhone}
              </a>
            </div>
          )}

          {address && (
            <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-1">{address}</span>
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {contact.contactTags && contact.contactTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {contact.contactTags.slice(0, 3).map(({ tag }) => (
            <div
              key={tag.id}
              style={{ backgroundColor: tag.color + '20', borderColor: tag.color, color: tag.color }}
              className="flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium"
            >
              <TagIcon className="h-2.5 w-2.5" />
              <span>{tag.name}</span>
            </div>
          ))}
          {contact.contactTags.length > 3 && (
            <div className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded text-xs font-medium">
              +{contact.contactTags.length - 3}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {contact._count && (
        <div className="flex flex-wrap gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          {contact._count.activities !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <Mail className="h-3.5 w-3.5" />
              <span className="font-medium">{contact._count.activities}</span>
              <span>activities</span>
            </div>
          )}
          {contact._count.tasks !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <User className="h-3.5 w-3.5" />
              <span className="font-medium">{contact._count.tasks}</span>
              <span>tasks</span>
            </div>
          )}
          {contact._count.reports !== undefined && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <Building2 className="h-3.5 w-3.5" />
              <span className="font-medium">{contact._count.reports}</span>
              <span>jobs</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
