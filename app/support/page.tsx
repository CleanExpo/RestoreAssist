import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Support — RestoreAssist",
  description:
    "Get help with RestoreAssist. Contact our support team, browse FAQs, or access documentation for the RestoreAssist field app and CET kiosk.",
  robots: { index: true, follow: true },
};

const SUPPORT_EMAIL = "support@restoreassist.app";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-neutral-900 dark:text-white mb-2">
          Support
        </h1>
        <p className="text-neutral-500 dark:text-neutral-400 mb-12">
          We&rsquo;re here to help. Choose an option below.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 mb-16">
          {/* Email Support */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
            <h2 className="font-semibold text-neutral-900 dark:text-white mb-1">
              Email Support
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              For account issues, billing, and technical problems. We respond
              within one business day (Mon–Fri, AEST).
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="inline-block text-sm font-medium text-[#1C2E47] dark:text-[#D4A574] hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
          </div>

          {/* FAQ */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
            <h2 className="font-semibold text-neutral-900 dark:text-white mb-1">
              FAQs
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
              Answers to common questions about inspections, reports, billing,
              and integrations.
            </p>
            <Link
              href="/faq"
              className="inline-block text-sm font-medium text-[#1C2E47] dark:text-[#D4A574] hover:underline"
            >
              Browse FAQs →
            </Link>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white mb-6">
          Common Topics
        </h2>

        <div className="space-y-4 mb-16">
          <details className="group border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <summary className="flex justify-between items-center cursor-pointer px-5 py-4 text-sm font-medium text-neutral-800 dark:text-neutral-200 select-none">
              How do I reset my password?
              <span className="text-neutral-400 group-open:rotate-180 transition-transform">
                ↓
              </span>
            </summary>
            <div className="px-5 pb-4 text-sm text-neutral-600 dark:text-neutral-400">
              Go to the{" "}
              <Link
                href="/forgot-password"
                className="text-[#1C2E47] dark:text-[#D4A574] hover:underline"
              >
                forgot password page
              </Link>{" "}
              and enter your account email address. You will receive a reset
              link within a few minutes.
            </div>
          </details>

          <details className="group border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <summary className="flex justify-between items-center cursor-pointer px-5 py-4 text-sm font-medium text-neutral-800 dark:text-neutral-200 select-none">
              How do I cancel my subscription?
              <span className="text-neutral-400 group-open:rotate-180 transition-transform">
                ↓
              </span>
            </summary>
            <div className="px-5 pb-4 text-sm text-neutral-600 dark:text-neutral-400">
              Log in to your account, go to Dashboard → Settings → Billing, and
              select Cancel Subscription. Your access continues until the end of
              the current billing period. Email{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[#1C2E47] dark:text-[#D4A574] hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              if you need assistance.
            </div>
          </details>

          <details className="group border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <summary className="flex justify-between items-center cursor-pointer px-5 py-4 text-sm font-medium text-neutral-800 dark:text-neutral-200 select-none">
              How do I install the mobile app?
              <span className="text-neutral-400 group-open:rotate-180 transition-transform">
                ↓
              </span>
            </summary>
            <div className="px-5 pb-4 text-sm text-neutral-600 dark:text-neutral-400">
              Search for <strong>RestoreAssist</strong> on the Apple App Store
              (iOS) or Google Play Store (Android) and install it. Log in with
              your existing RestoreAssist account credentials.
            </div>
          </details>

          <details className="group border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <summary className="flex justify-between items-center cursor-pointer px-5 py-4 text-sm font-medium text-neutral-800 dark:text-neutral-200 select-none">
              The app is not syncing — what should I do?
              <span className="text-neutral-400 group-open:rotate-180 transition-transform">
                ↓
              </span>
            </summary>
            <div className="px-5 pb-4 text-sm text-neutral-600 dark:text-neutral-400">
              RestoreAssist works offline and syncs when a connection is
              restored. If sync is not completing after reconnecting: (1) check
              your internet connection, (2) force-close and reopen the app, (3)
              log out and log back in. If the issue persists, contact{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-[#1C2E47] dark:text-[#D4A574] hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </div>
          </details>

          <details className="group border border-neutral-200 dark:border-neutral-800 rounded-lg">
            <summary className="flex justify-between items-center cursor-pointer px-5 py-4 text-sm font-medium text-neutral-800 dark:text-neutral-200 select-none">
              How do I request deletion of my account and data?
              <span className="text-neutral-400 group-open:rotate-180 transition-transform">
                ↓
              </span>
            </summary>
            <div className="px-5 pb-4 text-sm text-neutral-600 dark:text-neutral-400">
              Email{" "}
              <a
                href="mailto:privacy@restoreassist.app"
                className="text-[#1C2E47] dark:text-[#D4A574] hover:underline"
              >
                privacy@restoreassist.app
              </a>{" "}
              with the subject line &ldquo;Account Deletion Request&rdquo;. We
              will confirm deletion within 30 days. Note that inspection records
              may be retained for up to 7 years to comply with Australian
              business record-keeping obligations.
            </div>
          </details>
        </div>

        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-8 text-sm text-neutral-500 dark:text-neutral-400">
          <p>
            RestoreAssist support is available Monday to Friday, 8am–6pm AEST.
            For urgent issues outside business hours, email{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-[#1C2E47] dark:text-[#D4A574] hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            and we will respond on the next business day.
          </p>
        </div>
      </div>
    </main>
  );
}
