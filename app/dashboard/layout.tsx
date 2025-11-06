"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Search,
  HelpCircle,
  PlayCircle,
  Activity,
  CheckCircle,
  Home,
} from "lucide-react"
import { useSession, signOut } from "next-auth/react"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { data: session, status } = useSession()
  const router = useRouter()

  // TEMPORARILY DISABLED FOR TESTING
  // useEffect(() => {
  //   if (status === "unauthenticated") {
  //     router.push("/login")
  //   }
  // }, [status, router])

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  // TEMPORARILY DISABLED FOR TESTING - Allow unauthenticated access
  // if (status === "unauthenticated") {
  //   return (
  //     <div className="min-h-screen bg-slate-950 flex items-center justify-center">
  //       <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
  //     </div>
  //   )
  // }

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" })
  }

  const navItems = [
    { icon: Home, label: "Dashboard", href: "/dashboard" },
    { icon: PlayCircle, label: "Start Assessment", href: "/dashboard/start", highlight: true },
    { icon: Activity, label: "Active Assessments", href: "/dashboard/active" },
    { icon: CheckCircle, label: "Completed Reports", href: "/dashboard/completed" },
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
    { icon: HelpCircle, label: "Help & Support", href: "/dashboard/help" },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50">
                {/* Sidebar - v0 Inspired */}
                <aside
                  className={`fixed left-0 top-0 h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 z-40 flex flex-col ${
                    sidebarOpen ? "w-64" : "w-20"
                  }`}
                >
                  {/* Logo */}
                  <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
                    {sidebarOpen && (
                      <Link href="/" className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                          <span className="text-white font-bold text-sm">RA</span>
                        </div>
                        <span className="font-bold text-base text-slate-900 dark:text-white">RestoreAssist</span>
                      </Link>
                    )}
                    <button
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                  </div>

                  {/* Navigation - v0 Style */}
                  <nav className="flex-1 overflow-y-auto py-4 px-3">
                    {/* Search */}
                    {sidebarOpen && (
                      <div className="mb-4 px-1">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                          <input
                            type="text"
                            placeholder="Search..."
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm text-slate-900 dark:text-white placeholder-slate-400"
                          />
                        </div>
                      </div>
                    )}

                    {navItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 transition-all group ${
                          item.highlight
                            ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium shadow-md hover:shadow-lg"
                            : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70"
                        }`}
                        title={!sidebarOpen ? item.label : ""}
                      >
                        <item.icon size={20} className="flex-shrink-0" />
                        {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
                      </Link>
                    ))}
                  </nav>

                  {/* User Section - Fixed at bottom - v0 Style */}
                  <div className="border-t border-slate-200 dark:border-slate-800 p-4 flex-shrink-0">
                    {sidebarOpen ? (
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-semibold text-sm text-white shadow-md">
                          {session?.user?.name?.charAt(0) || "U"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{session?.user?.name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{session?.user?.email}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center mb-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-semibold text-sm text-white shadow-md">
                          {session?.user?.name?.charAt(0) || "U"}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-700 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-xl transition-all"
                    >
                      <LogOut size={20} className="flex-shrink-0" />
                      {sidebarOpen && <span className="text-sm font-medium">Logout</span>}
                    </button>
                  </div>
                </aside>

        {/* Main Content */}
        <div className={`transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-20"}`}>
          {/* Top Bar - v0 Style */}
          <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30 backdrop-blur-sm bg-opacity-90 dark:bg-opacity-90">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search reports, clients..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 ml-6">
              {/* Notifications */}
              <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors relative">
                <Bell size={20} className="text-slate-600 dark:text-slate-300" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full"></span>
              </button>

              {/* User Avatar & Dropdown */}
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-700">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{session?.user?.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{session?.user?.email}</p>
                </div>
                <button className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-semibold text-sm shadow-md hover:shadow-lg transition-all">
                  {session?.user?.name?.charAt(0) || "U"}
                </button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
        </div>
      </div>
  )
}
