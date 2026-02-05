/**
 * Property Lookup Button Component
 *
 * V3 Feature Stub - Property Intelligence (CoreLogic/Domain Integration)
 * This component is a placeholder for future property data lookup functionality.
 * Full implementation planned for V3 with CoreLogic/Domain API integration.
 *
 * When implemented, this will auto-fill property details from address using:
 * - CoreLogic RP Data API
 * - Domain Group Property API
 * - Australian Property Monitors
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
      // V3 Feature: Property Intelligence Integration
      // This will call /api/property/lookup when CoreLogic/Domain integration is complete
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
