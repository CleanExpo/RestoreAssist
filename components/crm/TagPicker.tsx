'use client'

import React, { useState, useRef, useEffect } from 'react'
import { X, Plus, Tag as TagIcon, Check } from 'lucide-react'

interface Tag {
  id: string
  name: string
  color: string
  userId: string
  createdAt: Date | string
}

interface TagPickerProps {
  availableTags: Tag[]
  selectedTagIds: string[]
  onTagsChange: (tagIds: string[]) => void
  onCreateTag?: (name: string, color: string) => Promise<Tag>
  placeholder?: string
  disabled?: boolean
}

const defaultColors = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#64748b', // slate
  '#0ea5e9'  // sky
]

export function TagPicker({
  availableTags,
  selectedTagIds,
  onTagsChange,
  onCreateTag,
  placeholder = 'Add tags...',
  disabled = false
}: TagPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [selectedColor, setSelectedColor] = useState(defaultColors[0])
  const [creating, setCreating] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedTags = availableTags.filter(tag => selectedTagIds.includes(tag.id))

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setIsCreating(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredTags = availableTags.filter(tag =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
    !selectedTagIds.includes(tag.id)
  )

  const handleToggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter(id => id !== tagId))
    } else {
      onTagsChange([...selectedTagIds, tagId])
    }
  }

  const handleRemoveTag = (tagId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onTagsChange(selectedTagIds.filter(id => id !== tagId))
  }

  const handleCreateTag = async () => {
    if (!newTagName.trim() || !onCreateTag || creating) return

    setCreating(true)
    try {
      const newTag = await onCreateTag(newTagName.trim(), selectedColor)
      onTagsChange([...selectedTagIds, newTag.id])
      setNewTagName('')
      setIsCreating(false)
      setSearchQuery('')
    } catch (error) {
      console.error('Failed to create tag:', error)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Input Area */}
      <div
        onClick={() => !disabled && setIsOpen(true)}
        className={`flex flex-wrap gap-2 min-h-[42px] p-2 border rounded-lg ${
          disabled
            ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-not-allowed'
            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 cursor-text hover:border-cyan-500 dark:hover:border-cyan-400'
        } ${isOpen ? 'ring-2 ring-cyan-500 dark:ring-cyan-400 border-cyan-500 dark:border-cyan-400' : ''}`}
      >
        {/* Selected Tags */}
        {selectedTags.map(tag => (
          <div
            key={tag.id}
            style={{ backgroundColor: tag.color + '20', borderColor: tag.color, color: tag.color }}
            className="flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium"
          >
            <span>{tag.name}</span>
            {!disabled && (
              <button
                onClick={(e) => handleRemoveTag(tag.id, e)}
                className="hover:opacity-70 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}

        {/* Input */}
        {!disabled && (
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            placeholder={selectedTags.length === 0 ? placeholder : ''}
            className="flex-1 min-w-[120px] outline-none bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          />
        )}
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-2 w-full bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-lg max-h-[300px] overflow-y-auto">
          {/* Create New Tag */}
          {!isCreating && onCreateTag && searchQuery && filteredTags.length === 0 && (
            <button
              onClick={() => {
                setIsCreating(true)
                setNewTagName(searchQuery)
                setSearchQuery('')
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="h-4 w-4 text-cyan-500" />
              <span className="text-slate-900 dark:text-white">Create tag "{searchQuery}"</span>
            </button>
          )}

          {/* Create Tag Form */}
          {isCreating && onCreateTag && (
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
              <div className="space-y-3">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateTag()
                    if (e.key === 'Escape') {
                      setIsCreating(false)
                      setNewTagName('')
                    }
                  }}
                  placeholder="Tag name"
                  autoFocus
                  className="w-full px-3 py-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
                />

                {/* Color Picker */}
                <div className="flex flex-wrap gap-2">
                  {defaultColors.map(color => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      style={{ backgroundColor: color }}
                      className={`w-6 h-6 rounded transition-transform ${
                        selectedColor === color ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-slate-600 scale-110' : ''
                      }`}
                    >
                      {selectedColor === color && (
                        <Check className="h-4 w-4 text-white mx-auto" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim() || creating}
                    className="flex-1 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false)
                      setNewTagName('')
                    }}
                    className="px-3 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tag List */}
          {!isCreating && (
            <div className="py-1">
              {filteredTags.length === 0 && !searchQuery && (
                <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  {onCreateTag ? 'Type to search or create tags' : 'No tags available'}
                </div>
              )}

              {filteredTags.length === 0 && searchQuery && !onCreateTag && (
                <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  No tags found
                </div>
              )}

              {filteredTags.map(tag => {
                const isSelected = selectedTagIds.includes(tag.id)

                return (
                  <button
                    key={tag.id}
                    onClick={() => handleToggleTag(tag.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div
                      style={{ backgroundColor: tag.color + '30', borderColor: tag.color }}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border flex-1"
                    >
                      <TagIcon className="h-3 w-3" style={{ color: tag.color }} />
                      <span style={{ color: tag.color }} className="font-medium">{tag.name}</span>
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
