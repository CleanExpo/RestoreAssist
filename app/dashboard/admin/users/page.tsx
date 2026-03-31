'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Users,
  Shield,
  Search,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type UserRole = 'ADMIN' | 'MANAGER' | 'USER'

interface AdminUser {
  id: string
  name: string | null
  email: string
  role: UserRole
  createdAt: string
  organizationId: string | null
  subscriptionStatus: string | null
  _count: {
    inspections: number
    reports: number
  }
}

type RoleFilter = 'ALL' | UserRole

const roleBadgeConfig: Record<UserRole, { label: string; className: string }> = {
  ADMIN: {
    label: 'Admin',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
  },
  MANAGER: {
    label: 'Manager',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  },
  USER: {
    label: 'User',
    className: 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700',
  },
}

function RoleBadge({ role }: { role: UserRole }) {
  const config = roleBadgeConfig[role]
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  )
}

function formatJoinedDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-16 ml-auto" />
        </div>
      ))}
    </div>
  )
}

export default function AdminUsersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL')

  // Debounce search input 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (roleFilter !== 'ALL') params.set('role', roleFilter)
      const response = await fetch(`/api/admin/users?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users ?? [])
        setTotal(data.total ?? 0)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, roleFilter])

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (session?.user?.role !== 'ADMIN') {
      router.push('/dashboard')
      return
    }
    fetchUsers()
  }, [status, session, router, fetchUsers])

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Shield className="h-12 w-12 text-neutral-400" />
        <p className="text-neutral-600 dark:text-neutral-400">Admin access required</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard/admin')}
          className="gap-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              Users
              {!loading && (
                <Badge className="ml-1 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                  {total}
                </Badge>
              )}
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Manage and view all registered users
            </p>
          </div>
        </div>
        <Badge className="gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <Shield className="h-3 w-3" />
          Admin Only
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <TabsList>
            <TabsTrigger value="ALL">All</TabsTrigger>
            <TabsTrigger value="ADMIN">Admin</TabsTrigger>
            <TabsTrigger value="MANAGER">Manager</TabsTrigger>
            <TabsTrigger value="USER">User</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Users table */}
      <Card className="bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Users className="h-5 w-5 text-cyan-500" />
            All Users
          </CardTitle>
          <CardDescription>
            {loading ? 'Loading…' : `${total} user${total !== 1 ? 's' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 pb-6">
              <TableSkeleton />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-500">
              <Users className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
              <p className="text-sm">No users found</p>
              {(search || roleFilter !== 'ALL') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    setRoleFilter('ALL')
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-neutral-200 dark:border-neutral-800">
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Reports</TableHead>
                  <TableHead className="hidden md:table-cell">Inspections</TableHead>
                  <TableHead className="hidden sm:table-cell">Joined</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow
                    key={user.id}
                    className="border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <TableCell className="pl-6 font-medium text-neutral-900 dark:text-white">
                      {user.name ?? (
                        <span className="text-neutral-400 italic">No name</span>
                      )}
                    </TableCell>
                    <TableCell className="text-neutral-600 dark:text-neutral-400 text-sm">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-neutral-600 dark:text-neutral-400 text-sm">
                      {user._count.reports}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-neutral-600 dark:text-neutral-400 text-sm">
                      {user._count.inspections}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-neutral-500 text-sm">
                      {formatJoinedDate(user.createdAt)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/team`)}
                        className="gap-1.5 text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
