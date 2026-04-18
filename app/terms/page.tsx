import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — RestoreAssist",
  description:
    "Terms of Service governing your use of RestoreAssist. Australian Consumer Law applies.",
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "18 April 2026";
const SUPPORT_EMAIL = "support@restoreassist.app";
const LEGAL_EMAIL = "legal@restoreassist.app";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-neutral-900 dark:text-white mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-neutral-500 mb-10">
          Effective: {EFFECTIVE_DATE}
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              1. Acceptance
            </h2>
            <p>
              These Terms form a binding agreement between you (or the business
              you act on behalf of) and Unite-Group Nexus Pty Ltd (ABN 95 691
              477 844) ("we", "us", "RestoreAssist"). By creating an account,
              subscribing to a paid plan, or using the RestoreAssist platform
              you accept these Terms. If you do not accept them, do not use the
              service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              2. Your account
            </h2>
            <p>
              You must be at least 18 years old and legally able to enter into a
              contract. You are responsible for keeping your credentials secure
              and for any activity under your account. Notify us immediately at{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-cyan-600 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>{" "}
              if you suspect unauthorised access.
            </p>
            <p className="mt-2">
              If you create an account for a business or team, you warrant that
              you have authority to bind that organisation to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              3. Subscription &amp; billing
            </h2>
            <p>
              RestoreAssist offers free trial and paid subscription plans. Paid
              subscriptions renew automatically at the end of each billing
              period until cancelled. Prices are in Australian dollars and
              include GST where applicable (a tax invoice is issued via Stripe).
              You may cancel at any time from the Subscription page —
              cancellation takes effect at the end of the current billing
              period. No refunds are issued for partial periods unless required
              by law.
            </p>
            <p className="mt-2">
              Failed payments will put your account into a past-due state. If
              payment is not restored within a reasonable period, access to paid
              features may be suspended and your subscription may be cancelled.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              4. Acceptable use
            </h2>
            <p>You must not:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>use the service for unlawful purposes or to harm others;</li>
              <li>
                upload, store, or transmit content you do not own or have
                permission to use, or content that infringes a third
                party&rsquo;s rights;
              </li>
              <li>
                attempt to probe, scan, reverse-engineer, or interfere with the
                platform beyond normal use, including automated scraping or load
                generation beyond reasonable API consumption;
              </li>
              <li>
                resell or sublicense access to the platform without written
                consent;
              </li>
              <li>
                use RestoreAssist to generate reports you know to be false or
                misleading — RestoreAssist outputs assist human judgement but do
                not replace a qualified technician&rsquo;s professional opinion.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              5. Content &amp; ownership
            </h2>
            <p>
              You retain ownership of all content you upload or generate through
              the platform (your reports, photos, client data, etc.). You grant
              us a limited licence to host, process, and display your content
              solely to operate and improve the service.
            </p>
            <p className="mt-2">
              The RestoreAssist platform, software, brand, and derived
              aggregated insights remain our property.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              6. AI-generated output
            </h2>
            <p>
              RestoreAssist uses large language models and other AI systems to
              generate draft content — report narratives, classifications, scope
              suggestions, and similar. AI output is best-effort and may be
              incomplete, inaccurate, or subtly wrong. You are responsible for
              reviewing all AI-generated content before relying on it, and for
              ensuring the final report complies with the applicable
              professional standards (IICRC S500:2025, NCC, state-specific
              building codes, etc.). RestoreAssist is a tool for qualified
              technicians, not a substitute for one.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              7. Australian Consumer Law
            </h2>
            <p>
              Our services come with guarantees that cannot be excluded under
              the Australian Consumer Law. To the extent permitted by law, our
              liability for any breach of a non-excludable guarantee is limited,
              at our option, to supplying the service again or refunding the
              subscription fees paid for the period in which the failure
              occurred.
            </p>
            <p className="mt-2">
              Nothing in these Terms limits, restricts, or modifies any rights
              you have under the Australian Consumer Law or the Competition and
              Consumer Act 2010 (Cth).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              8. Limitation of liability
            </h2>
            <p>
              Subject to section 7, we are not liable for indirect,
              consequential, special, or incidental losses (including lost
              profits, lost data, or business interruption) arising from your
              use of the platform. Our total aggregate liability to you over any
              12-month period will not exceed the subscription fees you paid to
              us in that period.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              9. Third-party integrations
            </h2>
            <p>
              The platform integrates with third-party services (Stripe, Xero,
              QuickBooks, MYOB, ServiceM8, Ascora, Google, Anthropic, and
              others). Your use of those services is governed by their own terms
              — we do not control their availability, accuracy, or pricing. If a
              third-party service fails or changes, we will act reasonably to
              restore or replace affected functionality but do not guarantee
              uninterrupted integration.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              10. Termination
            </h2>
            <p>
              You may terminate your account at any time via the Subscription
              page. We may suspend or terminate your access if you breach these
              Terms, if required by law, or if we reasonably believe continued
              access poses a risk to the platform, other users, or the public.
            </p>
            <p className="mt-2">
              On termination your data is retained for up to 90 days to allow
              you to export it. After that period we may permanently delete your
              data, subject to any retention we are legally required to
              maintain.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              11. Changes to these Terms
            </h2>
            <p>
              We may update these Terms from time to time. Material changes will
              be notified by email and/or in-app at least 30 days before they
              take effect. Continuing to use the platform after the effective
              date constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              12. Governing law
            </h2>
            <p>
              These Terms are governed by the laws of Queensland, Australia.
              Each party submits to the exclusive jurisdiction of the courts of
              Queensland and Australian federal courts.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              13. Contact
            </h2>
            <p>
              Legal enquiries:{" "}
              <a
                href={`mailto:${LEGAL_EMAIL}`}
                className="text-cyan-600 hover:underline"
              >
                {LEGAL_EMAIL}
              </a>
              . Support:{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-cyan-600 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
            <p className="mt-2 text-neutral-400 text-xs">
              Restore Assist by Unite-Group Nexus Pty Ltd | Australia | ABN 95
              691 477 844
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
