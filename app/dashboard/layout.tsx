"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
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
  HelpCircle,
  CreditCard,
  Crown,
  FileSearch,
  ClipboardCheck,
  MessageSquare,
  Building2,
  Receipt,
  MessageCircle,
  Calculator,
  Shield,
  FlaskConical,
  Lock,
  Activity,
  Smartphone,
} from "lucide-react"
import { useSession, signOut } from "next-auth/react"
import dynamic from "next/dynamic"
import toast from "react-hot-toast"
import { NotificationBell } from "@/components/notifications"

const Chatbot = dynamic(() => import("@/components/Chatbot"), { ssr: false })
import GlobalSearch from "@/components/GlobalSearch"
import { ThemeToggle } from "@/components/theme-toggle"
import { cn } from "@/lib/utils"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // NotificationBell manages its own open/close state
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null)
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Fetch subscription status on mount and window focus only (not polling)
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      try {
        const response = await fetch("/api/user/profile")
        if (response.ok) {
          const data = await response.json()
          setSubscriptionStatus(data.profile?.subscriptionStatus)
        }
      } catch (error) {
        console.error("Error fetching subscription status:", error)
      }
    }

    if (status === "authenticated") {
      fetchSubscriptionStatus()

      // Refetch on window focus (e.g., after Stripe checkout redirect)
      const handleFocus = () => fetchSubscriptionStatus()
      window.addEventListener("focus", handleFocus)

      return () => window.removeEventListener("focus", handleFocus)
    }
  }, [status, session])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
    // Removed auto-redirect for password change - users can access it via Settings page
  }, [status, session, router])

  if (status === "loading") {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", "bg-white dark:bg-slate-950")}>
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  if (status === "unauthenticated") {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", "bg-white dark:bg-slate-950")}>
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    )
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/" })
  }

  // Check if user is a Manager or Technician (they should be linked to an Admin)
  const isTeamMember = session?.user?.role === "MANAGER" || session?.user?.role === "USER"
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN"

  // Free trial users get full sidebar access; they must add their own API key in Integrations
  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: Plus, label: "New Report", href: "/dashboard/reports/new", highlight: true },
    { icon: FileText, label: "Reports", href: "/dashboard/reports" },
    { icon: ClipboardCheck, label: "Inspections", href: "/dashboard/inspections" },
    { icon: Users, label: "Clients", href: "/dashboard/clients" },
    { icon: Receipt, label: "Invoices", href: "/dashboard/invoices" },
    { icon: FileText, label: "Restoration Documents", href: "/dashboard/restoration-documents" },
    { icon: Users, label: "Team", href: "/dashboard/team" },
    { icon: DollarSign, label: "Pricing Configuration", href: "/dashboard/pricing-config" },
    { icon: Calculator, label: "Quote Generator", href: "/dashboard/quote" },
    { icon: Plug, label: "Integrations", href: "/dashboard/integrations" },
    { icon: Activity, label: "Webhook Logs", href: "/dashboard/integrations/webhooks" },
    { icon: Smartphone, label: "Mobile App", href: "/dashboard/mobile" },
    { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    { icon: FileSearch, label: "Claims Analysis", href: "/dashboard/claims-analysis" },
    { icon: MessageSquare, label: "Interviews", href: "/dashboard/interviews" },
    // Hide Subscription for team members (Managers and Technicians)
    ...(isTeamMember ? [] : [{ icon: CreditCard, label: "Subscription", href: "/dashboard/subscription" }]),
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
    { icon: MessageCircle, label: "Feedback", href: "/dashboard/feedback" },
    { icon: HelpCircle, label: "Help & Support", href: "/dashboard/help" },
    // Admin-only section — hidden from Managers and Technicians
    ...(isAdmin ? [
      { icon: Shield,        label: "Admin",         href: "/dashboard/admin",               adminOnly: true },
      { icon: FlaskConical,  label: "NIR Pilot",     href: "/dashboard/admin/pilot",          adminOnly: true },
      { icon: Lock,          label: "Content Gate",  href: "/dashboard/admin/content-gate",   adminOnly: true },
    ] : []),
  ]

const upgradeItem = {
  icon: Crown,
  label: "Upgrade Package",
  href: "/dashboard/pricing",
  highlight: true,
  special: true
}

  return (
    <>
    <div className={cn("min-h-screen", "bg-white dark:bg-slate-950", "text-neutral-900 dark:text-slate-50")}>
                {/* Mobile backdrop */}
                {mobileMenuOpen && (
                  <div
                    className="fixed inset-0 bg-black/50 z-30 md:hidden"
                    onClick={() => setMobileMenuOpen(false)}
                  />
                )}

                {/* Sidebar */}
                <aside
                  className={cn(
                    "fixed left-0 top-0 h-screen transition-all duration-300 z-40 flex flex-col",
                    "bg-white dark:bg-slate-900",
                    "border-r border-neutral-200 dark:border-slate-800",
                    // Mobile: slide in/out, always w-64 when visible
                    mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
                    "md:translate-x-0",
                    // Desktop: toggle width
                    sidebarOpen ? "w-64" : "md:w-20 w-64"
                  )}
                >
                  {/* Logo */}
                  <div className={cn("h-16 flex items-center justify-between px-4 flex-shrink-0", "border-b border-neutral-200 dark:border-slate-800")}>
                    {sidebarOpen && (
                      <Link href="/dashboard/" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-xs">RA</span>
                        </div>
                        <div className="flex flex-col">
                          <span className={cn("font-semibold text-sm", "text-neutral-900 dark:text-slate-50")}>Restore Assist</span>
                          <span className={cn("text-[10px] font-normal leading-tight", "text-neutral-500 dark:text-slate-400")}>One System. Fewer Gaps. More Confidence.</span>
                        </div>
                      </Link>
                    )}
                    <button
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className={cn(
                        "p-1 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95",
                        "hover:bg-neutral-100 dark:hover:bg-slate-800",
                        "text-neutral-700 dark:text-slate-300"
                      )}
                      title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                    >
                      {sidebarOpen ? <X size={20} className="transition-transform duration-200" /> : <Menu size={20} className="transition-transform duration-200" />}
                    </button>
                  </div>

                  {/* Navigation */}
                  <nav className="flex-1 overflow-y-auto py-4 px-2">
                    {navItems.map((item, index) => {
                      // Insert admin divider before the first adminOnly item
                      const prevItem = navItems[index - 1] as { adminOnly?: boolean } | undefined
                      const isFirstAdminItem = (item as { adminOnly?: boolean }).adminOnly && !prevItem?.adminOnly

                      const divider = isFirstAdminItem ? (
                        <div key={`divider-admin`} className="mt-2 mb-1 px-2">
                          <div className="border-t border-neutral-200 dark:border-slate-700" />
                          {sidebarOpen && (
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-slate-500 mt-2 mb-1 px-2">
                              Admin
                            </p>
                          )}
                        </div>
                      ) : null

                      // Special handling for "New Report" to check credits
                      if (item.label === "New Report") {
                        return (
                          <>
                            {divider}
                            <button
                              key={item.href}
                              onClick={async () => {
                                try {
                                  const response = await fetch('/api/reports/check-credits')
                                  if (response.ok) {
                                    const data = await response.json()
                                    if (!data.hasApiKey) {
                                      toast.error('Please add your API key to create reports.')
                                      router.push('/dashboard/integrations')
                                      return
                                    }
                                    if (!data.canCreate) {
                                      router.push('/dashboard/pricing')
                                      return
                                    }
                                  }
                                  router.push(item.href)
                                } catch (error) {
                                  router.push(item.href)
                                }
                              }}
                              className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 group w-full text-left",
                                item.highlight
                                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02]"
                                  : cn(
                                      "text-neutral-700 dark:text-slate-300",
                                      "hover:bg-neutral-100 dark:hover:bg-slate-800",
                                      "hover:scale-[1.02] hover:shadow-md"
                                    )
                              )}
                              title={!sidebarOpen ? item.label : ""}
                            >
                              <item.icon size={20} className={`flex-shrink-0 transition-transform duration-200 ${item.highlight ? 'group-hover:scale-110 group-hover:rotate-3' : 'group-hover:scale-110'}`} />
                              {sidebarOpen && <span className="text-sm">{item.label}</span>}
                            </button>
                          </>
                        )
                      }
                      return (
                        <>
                          {divider}
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              "flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 group",
                              (item as { adminOnly?: boolean }).adminOnly
                                ? cn(
                                    "text-neutral-500 dark:text-slate-500",
                                    "hover:bg-cyan-50 dark:hover:bg-cyan-950/30 hover:text-cyan-700 dark:hover:text-cyan-400",
                                    pathname === item.href && "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400",
                                    "hover:scale-[1.02]"
                                  )
                                : item.highlight
                                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-medium hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02]"
                                  : cn(
                                      "text-neutral-700 dark:text-slate-300",
                                      "hover:bg-neutral-100 dark:hover:bg-slate-800",
                                      "hover:scale-[1.02] hover:shadow-md"
                                    )
                            )}
                            title={!sidebarOpen ? item.label : ""}
                          >
                            <item.icon size={20} className={`flex-shrink-0 transition-transform duration-200 ${item.highlight ? 'group-hover:scale-110 group-hover:rotate-3' : 'group-hover:scale-110'}`} />
                            {sidebarOpen && <span className="text-sm">{item.label}</span>}
                          </Link>
                        </>
                      )
                    })}
                    
                    {/* Upgrade Package - Special styling - Hide for team members */}
                    {!isTeamMember && (
                      <Link
                        href={upgradeItem.href}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 group",
                          upgradeItem.special
                            ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-medium shadow-lg hover:shadow-yellow-500/50 hover:from-yellow-600 hover:to-orange-600 hover:scale-[1.02] hover:shadow-xl"
                            : cn(
                                "text-neutral-700 dark:text-slate-300",
                                "hover:bg-neutral-100 dark:hover:bg-slate-800",
                                "hover:scale-[1.02]"
                              )
                        )}
                        title={!sidebarOpen ? upgradeItem.label : ""}
                      >
                        <upgradeItem.icon size={20} className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                        {sidebarOpen && <span className="text-sm">{upgradeItem.label}</span>}
                      </Link>
                    )}
                  </nav>

                  {/* User Section - Fixed at bottom */}
                  <div className={cn("border-t p-4 flex-shrink-0", "border-neutral-200 dark:border-slate-800")}>
                    <button
                      onClick={handleLogout}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md group",
                        "text-neutral-700 dark:text-slate-300",
                        "hover:bg-neutral-100 dark:hover:bg-slate-800"
                      )}
                      title="Logout"
                    >
                      <LogOut size={20} className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12" />
                      {sidebarOpen && <span className="text-sm">Logout</span>}
                    </button>
                  </div>
                </aside>

        {/* Main Content */}
        <div className={cn(
          "transition-all duration-300",
          // Mobile: no margin (sidebar is overlay)
          "ml-0",
          // Desktop: margin matches sidebar width
          sidebarOpen ? "md:ml-64" : "md:ml-20"
        )}>
          {/* Top Bar */}
          <header className={cn(
            "h-16 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20",
            "bg-white dark:bg-slate-900",
            "border-b border-neutral-200 dark:border-slate-800"
          )}>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={cn(
                "p-2 rounded-lg md:hidden mr-2",
                "hover:bg-neutral-100 dark:hover:bg-slate-800",
                "text-neutral-700 dark:text-slate-300"
              )}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div className="flex-1 max-w-xs sm:max-w-md">
              <GlobalSearch />
            </div>

            <div className="flex items-center gap-4 ml-6">
              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* Notifications */}
              <NotificationBell />

              {/* User Avatar & Dropdown */}
              <div className={cn("flex items-center gap-3 pl-4", "border-l border-neutral-200 dark:border-slate-700")}>
                <div className="text-right hidden sm:block">
                  <p className={cn("text-sm font-medium", "text-neutral-900 dark:text-slate-50")}>{session?.user?.name}</p>
                  <p className={cn("text-xs", "text-neutral-600 dark:text-slate-400")}>{session?.user?.email}</p>
                </div>
                <button className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/50 hover:scale-110 active:scale-95 transition-all duration-200">
                  {session?.user?.name?.charAt(0) || "U"}
                </button>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className={cn("space-y-6 max-w-9xl mx-auto px-2 sm:px-4 lg:px-6 py-8", "bg-white dark:bg-slate-950")}>{children}</main>
        </div>
      </div>
      {/* Chatbot */}
      <Chatbot />
    </>
  )
}
