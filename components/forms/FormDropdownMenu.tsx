'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { FileText, Plus, Loader2 } from 'lucide-react'
import { IFormTemplate } from '@/lib/forms/form-types'

/**
 * FormDropdownMenu - Global forms menu for dashboard
 * Shows pre-defined and custom forms
 */
export function FormDropdownMenu() {
  const [customForms, setCustomForms] = useState<IFormTemplate[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Load custom forms on mount
    loadCustomForms()
  }, [])

  async function loadCustomForms() {
    try {
      setIsLoading(true)
      const response = await fetch('/api/forms')
      if (response.ok) {
        const data = await response.json()
        setCustomForms(data.templates || [])
      }
    } catch (error) {
      console.error('Failed to load forms:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Pre-defined forms
  const predefinedForms = [
    { id: 'work-order', name: 'Work Order', icon: '📋' },
    { id: 'authority', name: 'Authority to Proceed', icon: '✓' },
    { id: 'jsa', name: 'Job Safety Analysis', icon: '⚠️' },
    { id: 'sds', name: 'Safety Data Sheet', icon: '📄' },
    { id: 'swims', name: 'SWIMS', icon: '🛡️' },
    { id: 'site-induction', name: 'Site Induction', icon: '📍' },
  ]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">Forms</span>
          <span className="sm:hidden">📋</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64 max-h-96 overflow-y-auto">
        {/* Pre-defined forms section */}
        <DropdownMenuLabel>Pre-defined Forms</DropdownMenuLabel>
        <DropdownMenuGroup>
          {predefinedForms.map((form) => (
            <DropdownMenuItem key={form.id} asChild>
              <Link href={`/dashboard/forms/predefined/${form.id}`} className="cursor-pointer">
                <span className="mr-2">{form.icon}</span>
                {form.name}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        {/* Custom forms section */}
        {customForms.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Custom Forms</DropdownMenuLabel>
            <DropdownMenuGroup>
              {customForms.map((form) => (
                <DropdownMenuItem key={form.id} asChild>
                  <Link href={`/dashboard/forms/${form.id}`} className="cursor-pointer">
                    <FileText className="w-4 h-4 mr-2" />
                    <span className="truncate">{form.name}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}

        {/* Action items */}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/forms" className="cursor-pointer">
              <FileText className="w-4 h-4 mr-2" />
              View All Forms
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/dashboard/forms/new" className="cursor-pointer">
              <Plus className="w-4 h-4 mr-2" />
              Create New Form
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center py-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
