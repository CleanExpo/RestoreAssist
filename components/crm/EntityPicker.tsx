'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Search, Building2, User, X, Check } from 'lucide-react'

interface Company {
  id: string
  name: string
  industry?: string
}

interface Contact {
  id: string
  fullName: string
  email: string
  company?: {
    id: string
    name: string
  }
}

interface EntityPickerProps {
  entityType: 'company' | 'contact'
  selectedEntityId?: string | null
  onEntitySelect: (entityId: string | null) => void
  onSearch?: (query: string) => Promise<Company[] | Contact[]>
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
}

export function EntityPicker({
  entityType,
  selectedEntityId,
  onEntitySelect,
  onSearch,
  placeholder,
  disabled = false,
  allowClear = true
}: EntityPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<(Company | Contact)[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<Company | Contact | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<NodeJS.Timeout>()

  const defaultPlaceholder = entityType === 'company' ? 'Search companies...' : 'Search contacts...'

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch selected entity details on mount
  useEffect(() => {
    if (selectedEntityId && onSearch) {
      // If we have a selected ID, we should fetch and display the entity
      // For now, we'll just keep the ID until we implement the API endpoint
      setSelectedEntity(null)
    }
  }, [selectedEntityId])

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || !onSearch) {
      setResults([])
      return
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const searchResults = await onSearch(searchQuery)
        setResults(searchResults)
      } catch (error) {
        console.error('Search failed:', error)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, onSearch])

  const handleSelect = (entity: Company | Contact) => {
    setSelectedEntity(entity)
    onEntitySelect(entity.id)
    setIsOpen(false)
    setSearchQuery('')
    setResults([])
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedEntity(null)
    onEntitySelect(null)
    setSearchQuery('')
    setResults([])
  }

  const isCompany = (entity: Company | Contact): entity is Company => {
    return 'industry' in entity
  }

  const isContact = (entity: Company | Contact): entity is Contact => {
    return 'email' in entity
  }

  const getEntityDisplay = (entity: Company | Contact) => {
    if (isCompany(entity)) {
      return (
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 w-8 h-8 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-900 dark:text-white truncate">{entity.name}</div>
            {entity.industry && (
              <div className="text-xs text-slate-600 dark:text-slate-400 truncate">{entity.industry}</div>
            )}
          </div>
        </div>
      )
    } else if (isContact(entity)) {
      const initials = entity.fullName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)

      return (
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-slate-900 dark:text-white truncate">{entity.fullName}</div>
            <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
              {entity.company ? entity.company.name : entity.email}
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Input Area */}
      <div
        onClick={() => !disabled && setIsOpen(true)}
        className={`relative flex items-center gap-2 min-h-[42px] px-3 py-2 border rounded-lg ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-not-allowed'
            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 cursor-text hover:border-cyan-500 dark:hover:border-cyan-400'
        } ${isOpen ? 'ring-2 ring-cyan-500 dark:ring-cyan-400 border-cyan-500 dark:border-cyan-400' : ''}`}
      >
        <Search className="h-4 w-4 text-slate-400 dark:text-slate-600 flex-shrink-0" />

        {/* Selected Entity or Input */}
        {selectedEntity && !isOpen ? (
          <div className="flex-1 min-w-0">
            {getEntityDisplay(selectedEntity)}
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => !disabled && setIsOpen(true)}
            placeholder={placeholder || defaultPlaceholder}
            disabled={disabled}
            className="flex-1 outline-none bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          />
        )}

        {/* Clear Button */}
        {selectedEntity && !disabled && allowClear && (
          <button
            onClick={handleClear}
            className="flex-shrink-0 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="h-4 w-4 text-slate-400 dark:text-slate-600" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-2 w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg max-h-[300px] overflow-y-auto">
          {/* Loading */}
          {loading && (
            <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Searching...
            </div>
          )}

          {/* No Results */}
          {!loading && searchQuery && results.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No {entityType === 'company' ? 'companies' : 'contacts'} found
            </div>
          )}

          {/* Empty State */}
          {!loading && !searchQuery && (
            <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Type to search {entityType === 'company' ? 'companies' : 'contacts'}
            </div>
          )}

          {/* Results */}
          {!loading && results.length > 0 && (
            <div className="py-1">
              {results.map(entity => {
                const isSelected = entity.id === selectedEntityId

                return (
                  <button
                    key={entity.id}
                    onClick={() => handleSelect(entity)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      {getEntityDisplay(entity)}
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 text-cyan-500 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
