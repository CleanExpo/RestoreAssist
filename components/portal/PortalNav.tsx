'use client'

import { signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { LogOut, FileText, User } from 'lucide-react'

export default function PortalNav() {
  const { data: session } = useSession()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.push('/portal/login')
  }

  return (
    <nav className="bg-white border-b border-[#5A6A7B]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="RestoreAssist" width={40} height={40} />
            <div>
              <h1 className="text-lg font-bold text-[#1C2E47]">Client Portal</h1>
              {session?.user?.name && (
                <p className="text-xs text-[#5A6A7B]">{session.user.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/portal"
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#5A6A7B] hover:text-[#1C2E47] transition-colors"
            >
              <FileText size={18} />
              <span className="hidden sm:inline">My Reports</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[#5A6A7B] hover:text-[#1C2E47] transition-colors"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
