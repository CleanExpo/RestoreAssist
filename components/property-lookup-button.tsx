/**
 * Property Lookup Button Component
 * Stub component for property lookup functionality
 */

'use client'

import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface PropertyLookupButtonProps {
  inspectionId?: string
  address?: string
  postcode?: string
  label?: string
  onSuccess?: (data: any) => void
  onError?: (error: any) => void
}

export function PropertyLookupButton({
  inspectionId,
  address,
  postcode,
  label = 'Lookup Property Data',
  onSuccess,
  onError,
}: PropertyLookupButtonProps) {
  const handleClick = async () => {
    try {
      // TODO: Implement property lookup API call
      // For now, just show a message
      console.log('Property lookup clicked', { inspectionId, address, postcode })
      if (onSuccess) {
        onSuccess({ data: null, expiresAt: null })
      }
    } catch (error) {
      if (onError) {
        onError(error)
      }
    }
  }

  return (
    <Button
      onClick={handleClick}
      variant="outline"
      className="w-full border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-700"
    >
      {label}
    </Button>
  )
}
