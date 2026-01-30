/**
 * Central invoice status definitions and helpers.
 * Single source of truth for status values, display, and business rules.
 * Matches Prisma enum InvoiceStatus.
 */

// ─── Type (matches Prisma InvoiceStatus enum) ───────────────────────────────
export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED'
  | 'WRITTEN_OFF'
  | 'REFUNDED'

/** All possible stored statuses (for iteration / validation). */
export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'WRITTEN_OFF',
  'REFUNDED',
] as const

/** Statuses that represent "sent but not fully paid" (used for outstanding, overdue logic). */
export const OUTSTANDING_STATUSES: readonly InvoiceStatus[] = [
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'OVERDUE',
] as const

export type OutstandingStatus = (typeof OUTSTANDING_STATUSES)[number]

/** Statuses that exclude from revenue / active counts (drafts and cancelled). */
export const EXCLUDED_FROM_REVENUE: readonly InvoiceStatus[] = ['DRAFT', 'CANCELLED']

/** Statuses that are terminal (no further workflow). */
export const FINAL_STATUSES: readonly InvoiceStatus[] = [
  'PAID',
  'CANCELLED',
  'WRITTEN_OFF',
  'REFUNDED',
]

// ─── Display config (labels and UI) ───────────────────────────────────────
export interface InvoiceStatusConfig {
  label: string
  /** Tailwind classes for badge (e.g. bg-slate-500/10 text-slate-600) */
  badgeClass: string
  /** Short description for tooltips/help */
  description: string
}

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, InvoiceStatusConfig> = {
  DRAFT: {
    label: 'Draft',
    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    description: 'Being prepared, not sent',
  },
  SENT: {
    label: 'Sent',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    description: 'Emailed to customer',
  },
  VIEWED: {
    label: 'Viewed',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    description: 'Customer opened invoice',
  },
  PARTIALLY_PAID: {
    label: 'Partially Paid',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    description: 'Partial payment received',
  },
  PAID: {
    label: 'Paid',
    badgeClass: 'bg-green-500/10 text-green-600 dark:text-green-400',
    description: 'Fully paid',
  },
  OVERDUE: {
    label: 'Overdue',
    badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400',
    description: 'Past due date, unpaid',
  },
  CANCELLED: {
    label: 'Cancelled',
    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
    description: 'Cancelled before sending',
  },
  WRITTEN_OFF: {
    label: 'Written Off',
    badgeClass: 'bg-slate-600/10 text-slate-500 dark:text-slate-500',
    description: 'Bad debt',
  },
  REFUNDED: {
    label: 'Refunded',
    badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    description: 'Fully refunded',
  },
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function getStatusConfig(status: string): InvoiceStatusConfig {
  const key = status as InvoiceStatus
  return INVOICE_STATUS_CONFIG[key] ?? INVOICE_STATUS_CONFIG.DRAFT
}

/** Statuses to show in list/detail filter dropdown (active workflow + common). */
export const FILTER_STATUS_OPTIONS: { value: InvoiceStatus; label: string }[] = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'VIEWED', label: 'Viewed' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

export function isDraft(status: string): boolean {
  return status === 'DRAFT'
}

export function isCancelled(status: string): boolean {
  return status === 'CANCELLED'
}

export function isOutstanding(status: string): boolean {
  return (OUTSTANDING_STATUSES as readonly string[]).includes(status)
}

export function isFinal(status: string): boolean {
  return (FINAL_STATUSES as readonly string[]).includes(status)
}

export function isExcludedFromRevenue(status: string): boolean {
  return (EXCLUDED_FROM_REVENUE as readonly string[]).includes(status)
}

/** Whether the invoice should be treated as overdue (due date passed, still has amount due). */
export function isOverdueByDate(status: string, dueDate: Date | string, amountDue: number): boolean {
  if (amountDue <= 0) return false
  if (!isOutstanding(status)) return false
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  return due < startOfToday
}

/**
 * Effective status for display and analytics.
 * When stored status is SENT/VIEWED/PARTIALLY_PAID and due date has passed with amount due, returns OVERDUE.
 * Otherwise returns the stored status.
 */
export function getEffectiveStatus(invoice: {
  status: string
  dueDate: Date | string
  amountDue: number
}): InvoiceStatus {
  const { status, dueDate, amountDue } = invoice
  const stored = status as InvoiceStatus
  if (isOverdueByDate(status, dueDate, amountDue)) return 'OVERDUE'
  return INVOICE_STATUSES.includes(stored) ? stored : 'DRAFT'
}
