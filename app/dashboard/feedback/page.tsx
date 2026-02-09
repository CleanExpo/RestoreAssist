'use client'

import { useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Send, CheckCircle, Star, Loader2, Inbox } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

type FeedbackItem = {
  id: string
  rating: number | null
  whatDoing: string | null
  whatHappened: string | null
  page: string | null
  createdAt: string
  user?: { id: string; name: string | null; email: string }
}

const INBOX_EMAIL = 'mmlrana00@gmail.com'

export default function FeedbackPage() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [rating, setRating] = useState<number | null>(null)
  const [whatDoing, setWhatDoing] = useState('')
  const [whatHappened, setWhatHappened] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [inboxList, setInboxList] = useState<FeedbackItem[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxPage, setInboxPage] = useState(1)
  const [inboxTotal, setInboxTotal] = useState(0)

  const canViewInbox = session?.user?.email === INBOX_EMAIL

  const loadInbox = async (page = 1, append = false) => {
    if (!canViewInbox) return
    setInboxLoading(true)
    try {
      const res = await fetch(`/api/feedback?inbox=1&page=${page}&limit=20`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      const list = data.feedback ?? []
      setInboxList(prev => append ? [...prev, ...list] : list)
      setInboxTotal(data.pagination?.total ?? 0)
      setInboxPage(page)
    } catch {
      toast.error('Failed to load feedback.')
    } finally {
      setInboxLoading(false)
    }
  }

  useEffect(() => {
    if (canViewInbox) loadInbox(1)
  }, [canViewInbox])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: rating ?? undefined,
          whatDoing: whatDoing.trim() || undefined,
          whatHappened: whatHappened.trim() || undefined,
          page: pathname || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')
      setSubmitted(true)
      setRating(null)
      setWhatDoing('')
      setWhatHappened('')
      if (canViewInbox) loadInbox(1)
      toast.success('Thank you! Your feedback has been submitted.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 bg-background p-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold mb-1 text-foreground">
          Feedback
        </h1>
        <p className="text-muted-foreground">
          Share your experience and help us improve Restore Assist.
        </p>
      </div>

      {submitted ? (
        <Card className="border-border bg-card">
          <CardContent className="pt-6 flex flex-col items-center justify-center py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2 text-foreground">
              Thank you for your feedback
            </h2>
            <p className="text-muted-foreground max-w-md mb-6">
              We read every submission and use it to improve the product. You can send more feedback anytime.
            </p>
            <Button variant="outline" onClick={() => setSubmitted(false)}>
              Send another
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground">Send feedback</CardTitle>
            <CardDescription>
              Tell us what you were trying to do and what happened. Your input helps us fix issues and prioritize improvements.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="rating" className="text-foreground">How was your experience? (optional)</Label>
                <div className="flex gap-1" role="group" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(rating === value ? null : value)}
                      className={cn(
                        'p-2 rounded-md transition-colors',
                        rating !== null && rating >= value
                          ? 'text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300'
                          : 'text-muted-foreground/60 hover:text-amber-500 dark:hover:text-amber-400'
                      )}
                      aria-pressed={rating !== null && rating >= value}
                    >
                      <Star className="h-8 w-8 fill-current" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatDoing" className="text-foreground">What were you trying to do?</Label>
                <Input
                  id="whatDoing"
                  placeholder="e.g. Creating a new report, updating a client..."
                  value={whatDoing}
                  onChange={(e) => setWhatDoing(e.target.value)}
                  maxLength={2000}
                  className="bg-background border-input text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatHappened" className="text-foreground">What happened? / Suggestion</Label>
                <Textarea
                  id="whatHappened"
                  placeholder="Describe the issue, unexpected behavior, or share an idea..."
                  value={whatHappened}
                  onChange={(e) => setWhatHappened(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  required
                  className="bg-background border-input text-foreground placeholder:text-muted-foreground resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  {whatHappened.length} / 5000
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={submitting || !whatHappened.trim()}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send feedback
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRating(null)
                    setWhatDoing('')
                    setWhatHappened('')
                  }}
                  disabled={submitting}
                >
                  Clear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {canViewInbox && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              All feedback
            </CardTitle>
            <CardDescription>
              Submissions from all users (name and email of who submitted).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {inboxLoading && inboxList.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : inboxList.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground">No feedback yet.</p>
            ) : (
              <div className="space-y-4">
                {inboxList.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-lg border border-border bg-background/50"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {item.user && (
                        <>
                          <span className="text-sm font-medium text-foreground">
                            {item.user.name || 'No name'}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {item.user.email}
                          </span>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                      {item.page && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={item.page}>
                          {item.page}
                        </span>
                      )}
                    </div>
                    {item.rating != null && (
                      <div className="flex gap-0.5 mb-2">
                        {[1, 2, 3, 4, 5].map((v) => (
                          <Star
                            key={v}
                            className={cn('h-4 w-4', v <= item.rating! ? 'text-amber-500 fill-amber-500 dark:text-amber-400 dark:fill-amber-400' : 'text-muted-foreground/40')}
                          />
                        ))}
                      </div>
                    )}
                    {item.whatDoing && (
                      <p className="text-sm text-foreground mb-1">
                        <span className="font-medium">Doing: </span>
                        {item.whatDoing}
                      </p>
                    )}
                    {item.whatHappened && (
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Feedback: </span>
                        {item.whatHappened}
                      </p>
                    )}
                  </div>
                ))}
                {inboxTotal > inboxList.length && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadInbox(inboxPage + 1, true)}
                      disabled={inboxLoading}
                    >
                      {inboxLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Load more'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
