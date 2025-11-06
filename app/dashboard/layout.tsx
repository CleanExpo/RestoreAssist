"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  FileText,
  Users,
  DollarSign,
  Plug,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  Bell,
  Search,
  HelpCircle,
  CreditCard,
  Crown,
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

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" })
  }

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: Plus, label: "New Report", href: "/dashboard/reports/new", highlight: true },
    { icon: FileText, label: "Reports", href: "/dashboard/reports" },
    { icon: Users, label: "Clients", href: "/dashboard/clients" },
    // { icon: DollarSign, label: "Cost Libraries", href: "/dashboard/cost-libraries" },
    { icon: Plug, label: "Integrations", href: "/dashboard/integrations" },
    { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    { icon: CreditCard, label: "Subscription", href: "/dashboard/subscription" },
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
    { icon: HelpCircle, label: "Help & Support", href: "/dashboard/help" },
  ]

const upgradeItem = {
  icon: Crown,
  label: "Upgrade Package",
  href: "/dashboard/pricing",
  highlight: true,
  special: true
}

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
                {/* Sidebar */}
                <aside
                  className={`fixed left-0 top-0 h-screen bg-slate-900 border-r border-slate-800 transition-all duration-300 z-40 flex flex-col ${
                    sidebarOpen ? "w-64" : "w-20"
                  }`}
                >
                  {/* Logo */}
                  <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 flex-shrink-0">
                    {sidebarOpen && (
                      <Link href="/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-xs">RA</span>
                        </div>
                        <span className="font-semibold text-sm">Restore Assist</span>
                      </Link>
                    )}
                    <button
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="p-1 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                  </div>

                  {/* Navigation */}
                  <nav className="flex-1 overflow-y-auto py-4 px-2">
                    {navItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all ${
                          item.highlight
                            ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                        title={!sidebarOpen ? item.label : ""}
                      >
                        <item.icon size={20} className="flex-shrink-0" />
                        {sidebarOpen && <span className="text-sm">{item.label}</span>}
                      </Link>
                    ))}
                    
                    {/* Upgrade Package - Special styling */}
                    <Link
                      href={upgradeItem.href}
                      className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all ${
                        upgradeItem.special
                          ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-medium shadow-lg hover:shadow-yellow-500/50"
                          : "text-slate-300 hover:bg-slate-800"
                      }`}
                      title={!sidebarOpen ? upgradeItem.label : ""}
                    >
                      <upgradeItem.icon size={20} className="flex-shrink-0" />
                      {sidebarOpen && <span className="text-sm">{upgradeItem.label}</span>}
                    </Link>
                  </nav>

                  {/* User Section - Fixed at bottom */}
                  <div className="border-t border-slate-800 p-4 flex-shrink-0">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      <LogOut size={20} className="flex-shrink-0" />
                      {sidebarOpen && <span className="text-sm">Logout</span>}
                    </button>
                  </div>
                </aside>

        {/* Main Content */}
        <div className={`transition-all duration-300 ${sidebarOpen ? "ml-64" : "ml-20"}`}>
          {/* Top Bar */}
          <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-30">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search reports, clients..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 text-sm text-white placeholder-slate-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 ml-6">
              {/* Notifications */}
              <div className="relative">
                {/* <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors relative"
                >
                  <Bell size={20} />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                    <div className="p-4 border-b border-slate-700">
                      <h3 className="font-semibold">Notifications</h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                      {[
                        {
                          title: "Report Approved",
                          desc: "Water damage report #WD-2025-001 approved",
                          time: "2 hours ago",
                        },
                        { title: "New Client", desc: "Advanced Property Restoration added", time: "5 hours ago" },
                        { title: "System Update", desc: "NCC 2022 compliance library updated", time: "1 day ago" },
                      ].map((notif, i) => (
                        <div
                          key={i}
                          className="p-4 border-b border-slate-700 hover:bg-slate-700/50 cursor-pointer transition-colors"
                        >
                          <p className="font-medium text-sm">{notif.title}</p>
                          <p className="text-xs text-slate-400 mt-1">{notif.desc}</p>
                          <p className="text-xs text-slate-500 mt-2">{notif.time}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )} */}
              </div>

              {/* User Avatar & Dropdown */}
              <div className="flex items-center gap-3 pl-4 border-l border-slate-700">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">{session?.user?.name}</p>
                  <p className="text-xs text-slate-400">{session?.user?.email}</p>
                </div>
                <button className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/50 transition-all">
                  {session?.user?.name?.charAt(0) || "U"}
                </button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="space-y-6 max-w-9xl mx-auto px-2 sm:px-4 lg:px-6 py-8">{children}</main>
        </div>
      </div>
  )
}
