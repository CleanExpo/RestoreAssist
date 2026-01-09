'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

interface ScheduledEmail {
  id: string
  recipient: string
  scheduledAt: string
  status: string
  attempts: number
}

interface ScheduledEmailsListProps {
  reportId: string
}

export default function ScheduledEmailsList({ reportId }: ScheduledEmailsListProps) {
  const [emails, setEmails] = useState<ScheduledEmail[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    fetchScheduledEmails()
  }, [reportId])

  const fetchScheduledEmails = async () => {
    try {
      const response = await fetch(`/api/reports/${reportId}/email/schedule`)
      if (!response.ok) throw new Error('Failed to fetch scheduled emails')

      const data = await response.json()
      setEmails(data.scheduledEmails || [])
    } catch (error) {
      console.error('Error fetching scheduled emails:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (scheduleId: string) => {
    try {
      const response = await fetch(`/api/reports/${reportId}/email/schedule/${scheduleId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to cancel scheduled email')

      toast({
        title: 'Success',
        description: 'Scheduled email cancelled',
      })

      setEmails(emails.filter((e) => e.id !== scheduleId))
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel scheduled email',
        variant: 'destructive',
      })
    }
  }

  if (loading) return <div>Loading...</div>

  if (emails.length === 0) {
    return <div className="text-sm text-gray-500">No scheduled emails</div>
  }

  return (
    <div className="space-y-2">
      <h3 className="font-medium">Scheduled Emails</h3>
      {emails.map((email) => (
        <div key={email.id} className="flex justify-between items-center p-2 border rounded">
          <div>
            <p className="text-sm font-medium">{email.recipient}</p>
            <p className="text-xs text-gray-500">
              {new Date(email.scheduledAt).toLocaleString()}
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleCancel(email.id)}
          >
            Cancel
          </Button>
        </div>
      ))}
    </div>
  )
}
