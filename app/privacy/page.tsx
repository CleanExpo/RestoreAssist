import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — RestoreAssist",
  description:
    "Privacy Policy for RestoreAssist and RestoreAssist CET applications.",
  robots: { index: true, follow: true },
};

const EFFECTIVE_DATE = "26 March 2026";
const CONTACT_EMAIL = "privacy@restoreassist.app";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold text-neutral-900 dark:text-white mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-neutral-500 mb-10">
          Effective: {EFFECTIVE_DATE}
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              1. Who we are
            </h2>
            <p>
              RestoreAssist is a property restoration management platform
              operated by Unite-Group Nexus Pty Ltd ABN 95 691 477 844, trading
              as Restore Assist (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
              &ldquo;our&rdquo;). This policy applies to the RestoreAssist web
              application, the RestoreAssist field iOS and Android application (
              <em>com.restoreassist.app</em>), and the RestoreAssist CET kiosk
              application (<em>com.restoreassist.cet</em>).
            </p>
            <p className="mt-2">
              Contact:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-cyan-600 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              2. Information we collect
            </h2>
            <h3 className="font-medium text-neutral-800 dark:text-neutral-200 mb-2">
              2.1 Account and business information
            </h3>
            <p>
              When you create a RestoreAssist account we collect your name,
              email address, business name, ABN, and business address. This
              information is used to provision your account, generate reports,
              and comply with applicable law.
            </p>

            <h3 className="font-medium text-neutral-800 dark:text-neutral-200 mt-4 mb-2">
              2.2 Inspection and report data
            </h3>
            <p>
              We collect data you enter during property inspections including
              moisture readings, photographs, floor plans, scope of works, and
              property addresses. This data belongs to you and is used solely to
              generate inspection reports and to power the RestoreAssist
              platform features you use.
            </p>

            <h3 className="font-medium text-neutral-800 dark:text-neutral-200 mt-4 mb-2">
              2.3 Photographs and files
            </h3>
            <p>
              Photographs uploaded to RestoreAssist are stored on
              Cloudinary&rsquo;s content delivery network and are accessible
              only to authorised users of your account.
            </p>

            <h3 className="font-medium text-neutral-800 dark:text-neutral-200 mt-4 mb-2">
              2.4 Video viewing data (CET app)
            </h3>
            <p>
              The RestoreAssist CET application records anonymous video viewing
              events including a random session identifier (no personally
              identifiable information), video completion percentage, and device
              type (iPad, Android tablet). This data is used for analytics
              purposes to help restoration companies understand which
              educational videos clients watch. No names, email addresses, or
              personal details are collected from clients using the CET app.
            </p>

            <h3 className="font-medium text-neutral-800 dark:text-neutral-200 mt-4 mb-2">
              2.5 Usage and technical data
            </h3>
            <p>
              We collect standard web server logs including IP addresses,
              browser type, and pages visited. This information is used for
              security monitoring and service improvement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              3. How we use your information
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and improve the RestoreAssist platform</li>
              <li>
                To generate inspection reports and scope-of-works documents
              </li>
              <li>To process payments via Stripe</li>
              <li>
                To communicate with you about your account and service updates
              </li>
              <li>To comply with our legal obligations under Australian law</li>
              <li>
                To provide analytics reports to restoration company
                administrators (CET video views)
              </li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information to third parties. We do
              not use your data to train AI models without your explicit
              consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              4. Third-party services
            </h2>
            <p>
              RestoreAssist uses the following third-party services to deliver
              the platform:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>
                <strong>Cloudinary</strong> — Photo and video storage and
                delivery (cloudinary.com)
              </li>
              <li>
                <strong>Stripe</strong> — Payment processing (stripe.com)
              </li>
              <li>
                <strong>Anthropic / OpenAI / Google</strong> — Optional
                AI-powered report analysis features, used only when you supply
                your own API key (&ldquo;Bring Your Own Key&rdquo;) or when you
                explicitly invoke an AI feature. Report content is not retained
                by AI providers for training.
              </li>
              <li>
                <strong>ElevenLabs</strong> — Text-to-speech narration for CET
                educational videos
              </li>
              <li>
                <strong>Amazon Web Services</strong> — Video rendering
                infrastructure (Remotion Lambda)
              </li>
              <li>
                <strong>DigitalOcean</strong> — Application hosting
                infrastructure
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              5. Data storage, security, and retention
            </h2>
            <p>
              Data is stored on servers located in Australia or the United
              States. We implement industry-standard security measures including
              encrypted connections (HTTPS), encrypted data at rest, and access
              controls. Passwords are never stored in plaintext.
            </p>
            <p className="mt-3">
              We apply a <strong>class-based retention schedule</strong>: the
              legal basis and minimum retention period depend on what the data
              records. We retain each class for no longer than required by the
              applicable legislation.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border border-neutral-300 dark:border-neutral-700">
                <thead className="bg-neutral-100 dark:bg-neutral-800">
                  <tr>
                    <th className="text-left p-2 border-b border-neutral-300 dark:border-neutral-700">
                      Record class
                    </th>
                    <th className="text-left p-2 border-b border-neutral-300 dark:border-neutral-700">
                      Retention period
                    </th>
                    <th className="text-left p-2 border-b border-neutral-300 dark:border-neutral-700">
                      Legal basis
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Claim financial records (invoices, payments, scope-of-works, carrier authorisations)
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      7 years after claim closure
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Income Tax Assessment Act 1997 (Cth) s&nbsp;262A; ATO recordkeeping; A New Tax System (GST) Act 1999
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Contract records (customer agreements, carrier-authorisation instruments)
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      6 years after end of contract (7 years in VIC/SA)
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      State Limitation Acts (limitation period for contract claims)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      WHS incident records (non-hazardous-substance)
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      5 years after incident
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Work Health and Safety Regulation 2011 (general duty)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      WHS records involving hazardous substances (incl. asbestos, mould health exposure)
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      30 years after last exposure
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      WHS Regulation 2011 – hazardous-substance health monitoring rules
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Photographs and moisture readings attached to a claim (C2PA-manifested attestations)
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Follows the parent claim&rsquo;s class (minimum 7 years)
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Evidentiary integrity for Income Tax &amp; contract limitation periods
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Disputed claims (invoice disputed or under legal process)
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Held until dispute fully resolved, then retained per the applicable class above
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Litigation hold; evidentiary preservation duty
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Customer personal information (name, email, phone) not attached to a claim
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Duration of account + 12 months after closure
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Australian Privacy Principle 11.2 (destroy / de-identify when no longer needed)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Marketing consent records and opt-outs
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      7 years after last use
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Spam Act 2003 (Cth); Privacy Act 1988 (Cth)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Application security and access logs
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      12 months
                    </td>
                    <td className="p-2 border-b border-neutral-200 dark:border-neutral-800">
                      Australian Privacy Principle 11.1 (security); incident-investigation window
                    </td>
                  </tr>
                  <tr>
                    <td className="p-2">
                      Product telemetry (aggregated usage analytics, raw events)
                    </td>
                    <td className="p-2">
                      Raw: 30 days. Aggregated: 24 months.
                    </td>
                    <td className="p-2">
                      Australian Privacy Principle 11.2; de-identification
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              Where a record would otherwise be deleted under this schedule but
              is subject to an active legal process, statutory investigation, or
              unresolved dispute, we retain it until the process concludes. This
              is required by our evidentiary-preservation obligations and
              overrides the timetable above.
            </p>
            <p className="mt-2">
              You can request deletion of your personal data under Section 7. We
              will honour deletion requests to the extent permitted by the
              retention requirements above; data we are legally required to
              retain will be held until its retention period expires, after
              which it is destroyed or de-identified.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              6. Camera and device permissions
            </h2>
            <p>
              The RestoreAssist field app (<em>com.restoreassist.app</em>) and
              the CET app (<em>com.restoreassist.cet</em>) may request access to
              your device camera to photograph meters, damage, and site
              conditions. Camera access is used only when you explicitly
              initiate a photo capture within the app. Photos are not accessed,
              uploaded, or transmitted without your action.
            </p>
            <p className="mt-2">
              The field app may request Bluetooth access to connect to moisture
              meters and environmental sensors. Bluetooth is used only to
              receive meter readings and is not used to track your location.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              7. Your rights under Australian privacy law
            </h2>
            <p>
              Under the Privacy Act 1988 (Cth) and the Australian Privacy
              Principles, you have the right to:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Access the personal information we hold about you</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
              <li>Make a complaint about how we handle your information</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-cyan-600 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              8. Cookies
            </h2>
            <p>
              We use essential cookies to maintain your login session and
              application preferences. We do not use third-party advertising or
              tracking cookies. You can disable cookies in your browser
              settings, though this may affect the functionality of the web
              application.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              9. Changes to this policy
            </h2>
            <p>
              We may update this policy from time to time. We will notify you of
              material changes via email or a prominent notice in the
              application. Continued use of RestoreAssist after the effective
              date of a revised policy constitutes your acceptance of the
              changes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-3">
              10. Contact
            </h2>
            <p>
              For privacy enquiries or complaints:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-cyan-600 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
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
