'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('client-credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
        toast.error('Invalid email or password')
      } else if (result?.ok) {
        toast.success('Login successful!')
        router.push('/portal')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
      toast.error('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F5F6] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-lg shadow-lg p-8"
      >
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="RestoreAssist" width={80} height={80} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#1C2E47] mb-2">Client Portal</h1>
          <p className="text-[#5A6A7B] text-sm">Sign in to view your restoration projects</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1C2E47] mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-[#5A6A7B]/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8A6B4E] focus:border-transparent"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1C2E47] mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2 border border-[#5A6A7B]/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8A6B4E] focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#8A6B4E] text-white rounded-lg font-medium hover:bg-[#8A6B4E]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          <p className="text-sm text-[#5A6A7B]">
            Don't have an account?{' '}
            <span className="text-[#5A6A7B]">Contact your restoration contractor for an invitation.</span>
          </p>
          <Link href="/" className="block text-sm text-[#8A6B4E] hover:underline">
            Return to Home
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
