'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import PortalNav from '@/components/portal/PortalNav'
import Link from 'next/link'
import { FileText, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Report {
  id: string
  title: string
  description: string | null
  status: string
  propertyAddress: string
  hazardType: string
  totalCost: number | null
  createdAt: string
  updatedAt: string
  waterCategory: string | null
  waterClass: string | null
  completionDate: string | null
  pendingApprovals: number
  approvedCount: number
  rejectedCount: number
}

export default function PortalDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/portal/login')
    } else if (status === 'authenticated') {
      if (session?.user?.userType !== 'client') {
        toast.error('Access denied. Client portal only.')
        router.push('/login')
        return
      }
      fetchReports()
    }
  }, [status, session, router])

  const fetchReports = async () => {
    try {
      const response = await fetch('/api/portal/reports')
      if (!response.ok) throw new Error('Failed to fetch reports')
      const data = await response.json()
      setReports(data.reports)
    } catch (error) {
      console.error('Error fetching reports:', error)
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const styles = {
      DRAFT: 'bg-gray-100 text-gray-700',
      PENDING: 'bg-yellow-100 text-yellow-700',
      APPROVED: 'bg-green-100 text-green-700',
      COMPLETED: 'bg-blue-100 text-blue-700',
      ARCHIVED: 'bg-gray-100 text-gray-500',
    }
    return styles[status as keyof typeof styles] || styles.DRAFT
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED':
      case 'COMPLETED':
        return <CheckCircle size={16} />
      case 'PENDING':
        return <Clock size={16} />
      case 'ARCHIVED':
        return <XCircle size={16} />
      default:
        return <FileText size={16} />
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-[#F4F5F6]">
        <PortalNav />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8A6B4E] mx-auto mb-4"></div>
            <p className="text-[#5A6A7B]">Loading your reports...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F4F5F6]">
      <PortalNav />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[#1C2E47] mb-2">My Restoration Reports</h1>
          <p className="text-[#5A6A7B]">
            View your restoration project reports, track progress, and approve work.
          </p>
        </div>

        {reports.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FileText className="mx-auto mb-4 text-[#5A6A7B]" size={48} />
            <h2 className="text-xl font-semibold text-[#1C2E47] mb-2">No Reports Yet</h2>
            <p className="text-[#5A6A7B]">
              Your restoration contractor will create reports for your projects. They will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {reports.map((report) => (
              <Link
                key={report.id}
                href={`/portal/reports/${report.id}`}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 border border-transparent hover:border-[#8A6B4E]/30"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(report.status)}`}>
                    {getStatusIcon(report.status)}
                    {report.status}
                  </div>
                  {report.pendingApprovals > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                      <AlertCircle size={14} />
                      {report.pendingApprovals}
                    </div>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-[#1C2E47] mb-2 line-clamp-2">
                  {report.title}
                </h3>

                <div className="space-y-2 text-sm text-[#5A6A7B]">
                  <p className="flex items-start gap-2">
                    <span className="font-medium">Address:</span>
                    <span className="line-clamp-2">{report.propertyAddress}</span>
                  </p>
                  <p>
                    <span className="font-medium">Type:</span> {report.hazardType}
                  </p>
                  {report.waterCategory && (
                    <p>
                      <span className="font-medium">Category:</span> {report.waterCategory}
                      {report.waterClass && ` • Class ${report.waterClass}`}
                    </p>
                  )}
                  {report.totalCost && (
                    <p className="text-[#1C2E47] font-semibold mt-3">
                      Estimated Cost: ${report.totalCost.toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-[#5A6A7B]/10 flex justify-between items-center text-xs text-[#5A6A7B]">
                  <span>Created {new Date(report.createdAt).toLocaleDateString()}</span>
                  {report.completionDate && (
                    <span>Completed {new Date(report.completionDate).toLocaleDateString()}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
