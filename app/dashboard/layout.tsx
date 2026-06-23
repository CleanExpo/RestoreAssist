"use client";

import { Fragment } from "react";
import type React from "react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { isCapacitorIOS } from "@/lib/capacitor";
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
  Camera,
  PlayCircle,
} from "lucide-react";
import { useSession, signOut } from "next-auth/react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { NotificationBell } from "@/components/notifications";
import { NirSyncStatusBadge } from "@/components/nir-offline-provider";
import { WhatsNewModal } from "@/components/releases/WhatsNewModal";
import { ProductTour } from "@/components/onboarding/ProductTour";
import { TrialBanner } from "@/components/TrialBanner";
import { PastDueBanner } from "@/components/billing/PastDueBanner";
import { CancellationCountdownBanner } from "@/components/billing/CancellationCountdownBanner";
import TrialCountdownBanner from "@/components/billing/TrialCountdownBanner";
import CreditExhaustModal from "@/components/billing/CreditExhaustModal";

const Chatbot = dynamic(() => import("@/components/Chatbot"), { ssr: false });
import GlobalSearch from "@/components/GlobalSearch";
import { ThemeToggle } from "@/components/theme-toggle";
import { AutoBreadcrumbs } from "@/components/AutoBreadcrumbs";
import HowToDropdown from "@/components/help/HowToDropdown";
import HelpSearchModal from "@/components/help/HelpSearchModal";
import { cn } from "@/lib/utils";
import {
  simpleNavItems,
  buildAdvancedNavGroups,
  isAdvancedMode,
  type ExperienceMode,
  type NavItem,
} from "./nav-config";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Default: collapsed (icon-only) on tablets to give the content pane
  // breathing room. Apple App Review (1.0.2) flagged the iPad layout because
  // an expanded 256px sidebar on iPad portrait left the main pane cramped
  // and pushed cards off-screen. Lazy SSR-safe init: assume collapsed during
  // SSR (matches the worst case) and refine on mount via useEffect below.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // RA-1842 — suppress billing nav items on iOS shell (Apple 3.1.1).
  const [hideBillingNav, setHideBillingNav] = useState(false);
  useEffect(() => {
    setHideBillingNav(isCapacitorIOS());
  }, []);

  // On mount, collapse sidebar by default for tablet-class viewports
  // (768px ≤ width < 1280px). Covers iPad portrait (1024px), iPad Pro 11"
  // portrait (1180px), and iPad Pro 13" portrait (1024px). Desktop (≥ 1280px)
  // and tablet landscape default expanded. Mobile (< 768px) uses overlay menu.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window.innerWidth;
    if (w >= 768 && w < 1280) {
      setSidebarOpen(false);
    }
  }, []);
  // NotificationBell manages its own open/close state
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(
    null,
  );

  // Experience mode drives Simple (default) vs Advanced sidebar nav.
  // null while loading; APPRENTICE/null => Simple, EXPERIENCED => Advanced.
  // New accounts default to Simple (see /api/user/experience-mode + the
  // isAdvancedMode resolver). Optimistic: we flip local state immediately on
  // toggle, then persist via PATCH and re-fetch reconciles on next mount.
  const [experienceMode, setExperienceMode] = useState<ExperienceMode | null>(
    null,
  );
  const [savingMode, setSavingMode] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Fetch subscription status on mount and window focus only (not polling)
  useEffect(() => {
    const fetchSubscriptionStatus = async () => {
      try {
        const response = await fetch("/api/user/profile");
        if (response.ok) {
          const data = await response.json();
          setSubscriptionStatus(data.profile?.subscriptionStatus);
        }
      } catch (error) {
        console.error("Error fetching subscription status:", error);
      }
    };

    if (status === "authenticated") {
      fetchSubscriptionStatus();

      // Refetch on window focus (e.g., after Stripe checkout redirect)
      const handleFocus = () => fetchSubscriptionStatus();
      window.addEventListener("focus", handleFocus);

      return () => window.removeEventListener("focus", handleFocus);
    }
  }, [status, session]);

  // Load the persisted experience mode once authenticated. Anything other than
  // an explicit EXPERIENCED opt-in resolves to Simple mode (see nav-config),
  // so a fetch failure safely degrades to the default Simple experience.
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/experience-mode");
        if (!res.ok) return;
        const data = (await res.json()) as { experienceMode?: ExperienceMode };
        if (!cancelled && data.experienceMode) {
          setExperienceMode(data.experienceMode);
        }
      } catch {
        // Non-fatal: leave as null => Simple mode default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    // Removed auto-redirect for password change - users can access it via Settings page
  }, [status, session, router]);

  if (status === "loading") {
    return (
      <div
        className={cn(
          "min-h-screen flex items-center justify-center",
          "bg-white dark:bg-slate-950",
        )}
      >
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div
        className={cn(
          "min-h-screen flex items-center justify-center",
          "bg-white dark:bg-slate-950",
        )}
      >
        <div className="w-8 h-8 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  const handleLogout = async () => {
    // RA-1818 — signOut({ callbackUrl }) can silently fail on prod when the
    // Next.js router intercepts the redirect before the cookie is cleared.
    // Using redirect:false + window.location forces a full navigation that
    // guarantees the session cookie is gone before the page reloads.
    await signOut({ redirect: false });
    window.location.href = "/";
  };

  // Check if user is a Manager or Technician (they should be linked to an Admin)
  const isTeamMember =
    session?.user?.role === "MANAGER" || session?.user?.role === "USER";
  const isTechnician = session?.user?.role === "USER";
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  // Free trial users get full sidebar access; they must add their own API key in Integrations
  const fullNavItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    {
      icon: Plus,
      label: "New Report",
      href: "/dashboard/reports/new",
      highlight: true,
    },
    { icon: FileText, label: "Reports", href: "/dashboard/reports" },
    {
      icon: ClipboardCheck,
      label: "Inspections",
      href: "/dashboard/inspections",
    },
    { icon: Users, label: "Clients", href: "/dashboard/clients" },
    { icon: Receipt, label: "Invoices", href: "/dashboard/invoices" },
    {
      icon: FileText,
      label: "Restoration Documents",
      href: "/dashboard/restoration-documents",
    },
    { icon: Users, label: "Team", href: "/dashboard/team" },
    {
      icon: DollarSign,
      label: "Pricing Configuration",
      href: "/dashboard/pricing-config",
    },
    { icon: Calculator, label: "Quote Generator", href: "/dashboard/quote" },
    { icon: Plug, label: "Integrations", href: "/dashboard/integrations" },
    // RA-905: Webhook Logs removed from top-level nav — operational tool, not a user feature.
    // Accessible via Integrations > Webhook Logs tab for users who need it.
    { icon: Smartphone, label: "Field Mode", href: "/dashboard/field" },
    { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    {
      icon: FileSearch,
      label: "Claims Analysis",
      href: "/dashboard/claims-analysis",
    },
    { icon: MessageSquare, label: "Interviews", href: "/dashboard/interviews" },
    { icon: Camera, label: "Media Library", href: "/dashboard/media" },
    // Hide Subscription for team members and on iOS shell (Apple 3.1.1)
    ...(isTeamMember || hideBillingNav
      ? []
      : [
          {
            icon: CreditCard,
            label: "Subscription",
            href: "/dashboard/subscription",
          },
        ]),
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
    { icon: MessageCircle, label: "Feedback", href: "/dashboard/feedback" },
    { icon: PlayCircle, label: "Tutorials", href: "/dashboard/learn" },
    { icon: HelpCircle, label: "Help & Support", href: "/dashboard/help" },
    // Admin-only section — hidden from Managers and Technicians
    ...(isAdmin
      ? [
          {
            icon: Shield,
            label: "Admin",
            href: "/dashboard/admin",
            adminOnly: true,
          },
          {
            icon: FlaskConical,
            label: "NIR Pilot",
            href: "/dashboard/admin/pilot",
            adminOnly: true,
          },
          {
            icon: Lock,
            label: "Content Gate",
            href: "/dashboard/admin/content-gate",
            adminOnly: true,
          },
        ]
      : []),
  ];

  const fieldTechNavItems = [
    { icon: Smartphone, label: "Field Mode", href: "/dashboard/field" },
    {
      icon: ClipboardCheck,
      label: "Active Jobs",
      href: "/dashboard/inspections",
    },
    {
      icon: Plus,
      label: "New Job",
      href: "/dashboard/inspections/new",
      highlight: true,
    },
    { icon: Camera, label: "Media", href: "/dashboard/media" },
    { icon: HelpCircle, label: "Help", href: "/dashboard/help" },
    { icon: Settings, label: "Account", href: "/dashboard/settings" },
  ];

  // Simple mode is the default for every non-technician user; Advanced mode is
  // opt-in via the persisted experienceMode. Technicians keep their dedicated
  // 6-item field nav regardless of mode.
  const advanced = isAdvancedMode(experienceMode);

  // The flat list used by the renderer. In Simple mode this is the short
  // plain-language set; in Advanced mode it's the existing full nav (which
  // already carries role/billing/admin gating). Technicians always get the
  // field nav. `fullNavItems` items omit highlight/special, so we widen to
  // NavItem for the shared grouping/rendering paths.
  const navItems: NavItem[] = isTechnician
    ? fieldTechNavItems
    : advanced
      ? fullNavItems
      : simpleNavItems;

  // Advanced mode renders the full nav grouped under section headers instead of
  // one flat 24-item list. Only computed when relevant.
  const advancedGroups =
    advanced && !isTechnician ? buildAdvancedNavGroups(fullNavItems) : null;

  // Toggle handler — flips Simple <-> Advanced, persists via the existing
  // PATCH endpoint. Optimistic: update local state first, revert on failure.
  const toggleExperienceMode = async () => {
    if (savingMode) return;
    const next: ExperienceMode = advanced ? "APPRENTICE" : "EXPERIENCED";
    const previous = experienceMode;
    setExperienceMode(next);
    setSavingMode(true);
    try {
      const res = await fetch("/api/user/experience-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experienceMode: next }),
      });
      if (!res.ok) throw new Error("Failed to save preference");
    } catch {
      setExperienceMode(previous);
      toast.error("Couldn't save your preference. Please try again.");
    } finally {
      setSavingMode(false);
    }
  };

  const upgradeItem = {
    icon: Crown,
    label: "Upgrade Package",
    href: "/dashboard/pricing",
    highlight: true,
    special: true,
  };

  const isDemoAccount = session?.user?.email === "demo@restoreassist.app";

  // Render a single nav entry. Shared by the flat (Simple/field) list and the
  // grouped (Advanced) sections so the styling stays identical across modes.
  // "New Report" keeps its credit-check button behaviour.
  const renderNavItem = (item: NavItem) => {
    if (item.label === "New Report") {
      return (
        <button
          key={item.href}
          onClick={async () => {
            try {
              const response = await fetch("/api/reports/check-credits");
              if (response.ok) {
                const data = await response.json();
                if (!data.hasApiKey) {
                  toast.error("Please add your API key to create reports.");
                  router.push("/dashboard/integrations");
                  return;
                }
                if (!data.canCreate) {
                  // RA-1842: iOS billing happens on web; do not auto-redirect.
                  if (!isCapacitorIOS()) {
                    router.push("/dashboard/pricing");
                  } else {
                    toast.error(
                      "Contact your workspace admin to manage your subscription.",
                    );
                  }
                  return;
                }
              }
              router.push(item.href);
            } catch (error) {
              router.push(item.href);
            }
          }}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 group w-full text-left",
            item.highlight
              ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02]"
              : cn(
                  "text-neutral-700 dark:text-slate-300",
                  "hover:bg-neutral-100 dark:hover:bg-slate-800",
                  "hover:scale-[1.02] hover:shadow-md",
                ),
          )}
          title={!sidebarOpen ? item.label : ""}
        >
          <item.icon
            size={20}
            className={`flex-shrink-0 transition-transform duration-200 ${item.highlight ? "group-hover:scale-110 group-hover:rotate-3" : "group-hover:scale-110"}`}
          />
          {sidebarOpen && <span className="text-sm">{item.label}</span>}
        </button>
      );
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 group",
          item.adminOnly
            ? cn(
                "text-neutral-500 dark:text-slate-500",
                "hover:bg-cyan-50 dark:hover:bg-cyan-950/30 hover:text-cyan-700 dark:hover:text-cyan-400",
                pathname === item.href &&
                  "bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400",
                "hover:scale-[1.02]",
              )
            : item.highlight
              ? "bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:from-blue-600 hover:to-cyan-600 hover:shadow-lg hover:shadow-blue-500/30 hover:scale-[1.02]"
              : cn(
                  "text-neutral-700 dark:text-slate-300",
                  "hover:bg-neutral-100 dark:hover:bg-slate-800",
                  "hover:scale-[1.02] hover:shadow-md",
                ),
        )}
        title={!sidebarOpen ? item.label : ""}
      >
        <item.icon
          size={20}
          className={`flex-shrink-0 transition-transform duration-200 ${item.highlight ? "group-hover:scale-110 group-hover:rotate-3" : "group-hover:scale-110"}`}
        />
        {sidebarOpen && <span className="text-sm">{item.label}</span>}
      </Link>
    );
  };

  return (
    <>
      <div
        className={cn(
          "min-h-screen",
          "bg-white dark:bg-slate-950",
          "text-neutral-900 dark:text-slate-50",
        )}
      >
        {/* SP-3 T16 — trial-countdown banner. Renders at the very top of
            the dashboard chrome (above demo banner, sidebar, and nav) so
            it's the first thing every trial user sees on every page. */}
        <TrialCountdownBanner />
        {/* RA-1583 — demo-mode banner. Makes it obvious the user is
            exploring sample data (seeded via /api/admin/seed-demo) so
            data they create during the demo session isn't mistaken
            for their real tenant. */}
        {isDemoAccount && (
          <div
            role="status"
            aria-live="polite"
            className="w-full bg-amber-500 text-warning text-sm font-medium text-center px-4 py-2"
          >
            DEMO MODE — you're signed in as the sample account. Data shown is
            illustrative; changes are shared with other demo viewers.
          </div>
        )}
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
            sidebarOpen ? "w-64" : "md:w-20 w-64",
          )}
        >
          {/* Logo */}
          <div
            className={cn(
              "h-16 flex items-center justify-between px-4 flex-shrink-0",
              "border-b border-neutral-200 dark:border-slate-800",
            )}
          >
            {sidebarOpen && (
              <Link href="/dashboard/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xs">RA</span>
                </div>
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "font-semibold text-sm",
                      "text-neutral-900 dark:text-slate-50",
                    )}
                  >
                    Restore Assist
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-normal leading-tight",
                      "text-neutral-500 dark:text-slate-400",
                    )}
                  >
                    {isTechnician
                      ? "Field tools. Fewer taps."
                      : "One System. Fewer Gaps. More Confidence."}
                  </span>
                </div>
              </Link>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={cn(
                "p-1 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95",
                "hover:bg-neutral-100 dark:hover:bg-slate-800",
                "text-neutral-700 dark:text-slate-300",
              )}
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? (
                <X size={20} className="transition-transform duration-200" />
              ) : (
                <Menu size={20} className="transition-transform duration-200" />
              )}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4 px-2">
            {advancedGroups
              ? // ADVANCED mode — full nav rendered under labelled section
                // headers instead of one flat 24-item list. Every existing
                // destination remains reachable, just grouped.
                advancedGroups.map((group) => (
                  <Fragment key={group.label}>
                    {sidebarOpen && (
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-slate-500 mt-3 mb-1 px-2 first:mt-0">
                        {group.label}
                      </p>
                    )}
                    {!sidebarOpen && (
                      <div className="my-2 px-2">
                        <div className="border-t border-neutral-200 dark:border-slate-700" />
                      </div>
                    )}
                    {group.items.map((item) => renderNavItem(item))}
                  </Fragment>
                ))
              : // SIMPLE mode (default) and the technician field nav — flat list.
                navItems.map((item) => renderNavItem(item))}

            {/* Upgrade Package - Special styling - Hide for team members and iOS shell (Apple 3.1.1) */}
            {!isTeamMember && !hideBillingNav && (
              <Link
                href={upgradeItem.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-200 group",
                  upgradeItem.special
                    ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-medium shadow-lg hover:shadow-yellow-500/50 hover:from-yellow-600 hover:to-orange-600 hover:scale-[1.02] hover:shadow-xl"
                    : cn(
                        "text-neutral-700 dark:text-slate-300",
                        "hover:bg-neutral-100 dark:hover:bg-slate-800",
                        "hover:scale-[1.02]",
                      ),
                )}
                title={!sidebarOpen ? upgradeItem.label : ""}
              >
                <upgradeItem.icon
                  size={20}
                  className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12"
                />
                {sidebarOpen && (
                  <span className="text-sm">{upgradeItem.label}</span>
                )}
              </Link>
            )}
          </nav>

          {/* User Section - Fixed at bottom */}
          <div
            className={cn(
              "border-t p-4 flex-shrink-0 space-y-2",
              "border-neutral-200 dark:border-slate-800",
            )}
          >
            {/* Simple/Advanced mode toggle. Hidden for technicians (they have a
                dedicated field nav). Flips the persisted experienceMode via
                /api/user/experience-mode. Reads "Switch to Advanced" in Simple
                mode and "Switch to Simple" in Advanced mode. */}
            {!isTechnician && (
              <button
                onClick={toggleExperienceMode}
                disabled={savingMode}
                aria-pressed={advanced}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100",
                  "text-neutral-700 dark:text-slate-300",
                  "hover:bg-neutral-100 dark:hover:bg-slate-800",
                )}
                title={
                  !sidebarOpen
                    ? advanced
                      ? "Switch to Simple"
                      : "Switch to Advanced"
                    : ""
                }
              >
                <Activity
                  size={20}
                  className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110"
                />
                {sidebarOpen && (
                  <span className="text-sm">
                    {advanced ? "Switch to Simple" : "Switch to Advanced"}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:shadow-md group",
                "text-neutral-700 dark:text-slate-300",
                "hover:bg-neutral-100 dark:hover:bg-slate-800",
              )}
              title="Logout"
            >
              <LogOut
                size={20}
                className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-12"
              />
              {sidebarOpen && <span className="text-sm">Logout</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div
          className={cn(
            "transition-all duration-300",
            // Mobile: no margin (sidebar is overlay)
            "ml-0",
            // Desktop: margin matches sidebar width
            sidebarOpen ? "md:ml-64" : "md:ml-20",
          )}
        >
          {/* Top Bar */}
          <header
            className={cn(
              "h-16 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20",
              "bg-white dark:bg-slate-900",
              "border-b border-neutral-200 dark:border-slate-800",
            )}
          >
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={cn(
                "p-2 rounded-lg md:hidden mr-2",
                "hover:bg-neutral-100 dark:hover:bg-slate-800",
                "text-neutral-700 dark:text-slate-300",
              )}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div className="flex-1 max-w-xs sm:max-w-md">
              {isTechnician ? (
                <Link
                  href="/dashboard/field"
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Smartphone className="h-4 w-4" />
                  Field Mode
                </Link>
              ) : (
                <GlobalSearch />
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-4 ml-3 sm:ml-6">
              {/* RA-1124 MVP — persistent sync-status pill. The offline
                  infrastructure (service worker + IndexedDB queue +
                  reconnect listeners) already ships via NirOfflineProvider,
                  but the user-facing badge was never mounted, so a
                  technician in the field had no signal that their save
                  was queued vs. actually on the wire. */}
              <NirSyncStatusBadge />

              {/* SP-8 T12 — How To dropdown (in-app Help Library entry point) */}
              {!isTechnician && <HowToDropdown />}

              {/* Theme Toggle */}
              {!isTechnician && <ThemeToggle />}

              {/* Notifications */}
              <NotificationBell />

              {/* User Avatar & Dropdown */}
              <div
                className={cn(
                  "flex items-center gap-3 pl-4",
                  "border-l border-neutral-200 dark:border-slate-700",
                )}
              >
                <div className="text-right hidden sm:block">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      "text-neutral-900 dark:text-slate-50",
                    )}
                  >
                    {session?.user?.name}
                  </p>
                  <p
                    className={cn(
                      "text-xs",
                      "text-neutral-600 dark:text-slate-400",
                    )}
                  >
                    {session?.user?.email}
                  </p>
                </div>
                <button className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center font-semibold text-sm hover:shadow-lg hover:shadow-blue-500/50 hover:scale-110 active:scale-95 transition-all duration-200">
                  {session?.user?.name?.charAt(0) || "U"}
                </button>
              </div>
            </div>
          </header>

          {/* RA-1241 — persistent trial-countdown banner. Silent unless
              subscriptionStatus === TRIAL + daysRemaining set. Dismissible
              per-session. Escalates amber → orange → red at ≤3d and ≤1d. */}
          <TrialBanner />

          {/* PAST_DUE dunning banner — RA-1244 */}
          <PastDueBanner status={subscriptionStatus} />

          {/* Cancellation countdown — RA-1256 */}
          <CancellationCountdownBanner />

          {/* Page Content */}
          <main
            className={cn(
              "space-y-6 max-w-9xl mx-auto px-2 sm:px-4 lg:px-6 py-8",
              "bg-white dark:bg-slate-950",
            )}
          >
            {/* RA-1569 adoption — auto-crumbs derived from the URL.
                Hidden on /dashboard itself (one segment); visible on
                every deeper route. Detail pages can pass an override
                via the `labels` prop when they know the entity
                name; by default the slug map in lib/breadcrumb-labels
                renders friendly text plus a short-hash fallback for
                cuids so the trail never shows a raw 25-char id. */}
            <AutoBreadcrumbs className="text-xs" />
            {children}
          </main>
        </div>
      </div>
      {/* Chatbot */}
      <Chatbot />
      {/* What's New — shown once per release after login */}
      <WhatsNewModal />
      {/* Product tour — RA-1238, auto-fires once for new users */}
      <ProductTour />
      {/* SP-3 T16 — credit-exhaustion modal. Listens for the
          `credit-exhausted` event; self-portals via fixed positioning. */}
      <CreditExhaustModal />
      {/* SP-8 T12 — global ⌘K help search modal. Self-portals via fixed
          positioning; listens for the ⌘K / Ctrl+K shortcut. */}
      <HelpSearchModal />
    </>
  );
}
