'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

interface EmailDeliveryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportId: string
  clientEmail?: string
}

export function EmailDeliveryModal({
  open,
  onOpenChange,
  reportId,
  clientEmail = '',
}: EmailDeliveryModalProps) {
  const [recipient, setRecipient] = useState(clientEmail)
  const [scheduledAt, setScheduledAt] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<'now' | 'schedule'>('now')
  const { toast } = useToast()

  const handleSendNow = async () => {
    if (!recipient) {
      toast({
        title: 'Error',
        description: 'Please enter a recipient email address',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/reports/${reportId}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient }),
      })

      if (!response.ok) throw new Error('Failed to send email')

      toast({
        title: 'Success',
        description: 'Email sent successfully',
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send email',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSchedule = async () => {
    if (!recipient || !scheduledAt) {
      toast({
        title: 'Error',
        description: 'Please enter recipient and scheduled time',
        variant: 'destructive',
      })
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/reports/${reportId}/email/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, scheduledAt }),
      })

      if (!response.ok) throw new Error('Failed to schedule email')

      toast({
        title: 'Success',
        description: 'Email scheduled successfully',
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to schedule email',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email Report</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-4">
            <Button
              variant={mode === 'now' ? 'default' : 'outline'}
              onClick={() => setMode('now')}
            >
              Send Now
            </Button>
            <Button
              variant={mode === 'schedule' ? 'default' : 'outline'}
              onClick={() => setMode('schedule')}
            >
              Schedule
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Recipient Email</label>
            <Input
              type="email"
              placeholder="client@example.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </div>

          {mode === 'schedule' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Scheduled Date & Time</label>
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={mode === 'now' ? handleSendNow : handleSchedule}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : mode === 'now' ? 'Send Now' : 'Schedule'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
