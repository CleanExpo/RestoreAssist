'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ClearTestCustomersPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear all test mode Stripe customer IDs? This will allow fresh live mode customers to be created.')) {
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/admin/clear-test-customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to clear customer IDs')
      }

      setResult(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8">
          <h1 className="text-2xl font-bold text-white mb-4">
            Clear Test Mode Stripe Customers
          </h1>

          <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 mb-6">
            <p className="text-yellow-200 text-sm">
              <strong>⚠️ Admin Tool</strong><br />
              This will clear all Stripe customer IDs from the database.
              Next checkout will create fresh live mode customers.
            </p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleClear}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {loading ? 'Clearing...' : 'Clear Test Customer IDs'}
            </button>

            {result && (
              <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4">
                <h3 className="text-green-400 font-semibold mb-2">✅ Success</h3>
                <p className="text-green-200 text-sm mb-2">{result.message}</p>
                {result.users && result.users.length > 0 && (
                  <div className="mt-3">
                    <p className="text-green-300 text-xs font-semibold mb-1">Cleared:</p>
                    <ul className="text-green-200 text-xs space-y-1">
                      {result.users.map((user: any, i: number) => (
                        <li key={i}>
                          {user.email}: {user.oldCustomerId}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
                <h3 className="text-red-400 font-semibold mb-2">❌ Error</h3>
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            )}

            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
