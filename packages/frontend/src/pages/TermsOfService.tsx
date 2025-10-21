import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ArrowLeft } from 'lucide-react';

export const TermsOfService: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
          {/* Title */}
          <div className="flex items-center space-x-4 mb-8">
            <div className="bg-blue-100 p-3 rounded-xl">
              <FileText className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Terms of Service</h1>
              <p className="text-gray-500 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          <div className="prose prose-lg max-w-none">
            {/* Introduction */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Agreement to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                Welcome to RestoreAssist ("Company," "we," "our," or "us"). These Terms of Service ("Terms") govern your
                access to and use of our website, products, and services (collectively, the "Service") located at
                restoreassist.app.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                By accessing or using our Service, you agree to be bound by these Terms. If you disagree with any part
                of the Terms, you may not access the Service.
              </p>
              <div className="bg-yellow-50 border-l-4 border-yellow-600 p-4 mt-6">
                <p className="text-gray-900 font-semibold">Important Notice</p>
                <p className="text-gray-700 mt-2">
                  These Terms constitute a legally binding agreement. Please read them carefully before using our Service.
                </p>
              </div>
            </section>

            {/* Service Description */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Service Description</h2>
              <p className="text-gray-700 leading-relaxed">
                RestoreAssist is an AI-powered disaster recovery report generation platform that enables restoration
                professionals to create detailed, professional restoration reports quickly and efficiently.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">2.1 Service Features</h3>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>AI-powered report generation for various damage types (water, fire, storm, mold, biohazard)</li>
                <li>Professional templates and cost estimation tools</li>
                <li>PDF and DOCX export functionality</li>
                <li>7-day free trial with 3 professional reports included</li>
                <li>Subscription-based access for continued use</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">2.2 Service Availability</h3>
              <p className="text-gray-700 leading-relaxed">
                We strive to provide continuous availability of our Service, but we do not guarantee uninterrupted access.
                We reserve the right to modify, suspend, or discontinue any part of the Service with or without notice.
              </p>
            </section>

            {/* Account Registration */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Account Registration and Security</h2>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">3.1 Account Creation</h3>
              <p className="text-gray-700 leading-relaxed">
                To use our Service, you must create an account by signing in with Google OAuth. By creating an account, you represent that:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>You are at least 16 years of age</li>
                <li>All information you provide is accurate and current</li>
                <li>You will maintain the accuracy of your account information</li>
                <li>You are legally capable of entering into binding contracts</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">3.2 Account Security</h3>
              <p className="text-gray-700 leading-relaxed">
                You are responsible for maintaining the confidentiality of your account and for all activities that occur
                under your account. You agree to:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Immediately notify us of any unauthorized use of your account</li>
                <li>Ensure that you log out from your account at the end of each session</li>
                <li>Not share your account credentials with others</li>
                <li>Accept responsibility for any activities conducted through your account</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">3.3 Account Termination</h3>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to suspend or terminate your account if we reasonably believe you have violated these
                Terms or engaged in fraudulent, abusive, or illegal activity.
              </p>
            </section>

            {/* Free Trial */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Free Trial</h2>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">4.1 Trial Period</h3>
              <p className="text-gray-700 leading-relaxed">
                New users are eligible for a 7-day free trial period that includes:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Access to all professional report templates</li>
                <li>Generation of up to 3 professional reports</li>
                <li>PDF and DOCX export functionality</li>
                <li>Full access to all Service features</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">4.2 Trial Limitations</h3>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>One free trial per user (determined by email address and device fingerprint)</li>
                <li>No credit card required for trial activation</li>
                <li>Trial expires after 7 days or 3 reports, whichever comes first</li>
                <li>Reports created during trial remain accessible after trial expires</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">4.3 After Trial Expiry</h3>
              <p className="text-gray-700 leading-relaxed">
                Once your free trial expires, you must upgrade to a paid subscription to continue generating new reports.
                Existing reports will remain viewable and exportable.
              </p>
            </section>

            {/* Subscriptions and Payments */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Subscriptions and Payments</h2>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">5.1 Subscription Plans</h3>
              <p className="text-gray-700 leading-relaxed">
                We offer the following subscription plans:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Monthly Subscription:</strong> Billed monthly with unlimited report generation</li>
                <li><strong>Yearly Subscription:</strong> Billed annually with unlimited report generation at a discounted rate</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">5.2 Payment Processing</h3>
              <p className="text-gray-700 leading-relaxed">
                All payments are processed securely through Stripe. By subscribing, you:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Authorize us to charge your payment method for the subscription fees</li>
                <li>Agree to maintain valid payment information</li>
                <li>Accept responsibility for all charges incurred under your account</li>
                <li>Understand that we do not store your payment card details</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">5.3 Automatic Renewal</h3>
              <p className="text-gray-700 leading-relaxed">
                Subscriptions automatically renew at the end of each billing period unless cancelled before the renewal date.
                You will be charged the then-current subscription fee using your payment method on file.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">5.4 Failed Payments</h3>
              <p className="text-gray-700 leading-relaxed">
                If a payment fails, we will attempt to process the payment again. If payment continues to fail, your
                subscription may be suspended or cancelled. You remain responsible for all unpaid fees.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">5.5 Price Changes</h3>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to change subscription prices at any time. Price changes will not affect existing
                subscriptions until the next renewal period. We will provide at least 30 days' notice of any price changes.
              </p>
            </section>

            {/* Cancellation and Refunds */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Cancellation and Refunds</h2>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">6.1 Cancellation Policy</h3>
              <p className="text-gray-700 leading-relaxed">
                You may cancel your subscription at any time through your account settings or by contacting support at{' '}
                <a href="mailto:support@restoreassist.app" className="text-blue-600 hover:underline">
                  support@restoreassist.app
                </a>
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Cancellations take effect at the end of the current billing period</li>
                <li>You retain access to paid features until the end of your billing period</li>
                <li>No partial refunds for unused time within a billing period</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">6.2 Refund Policy</h3>
              <p className="text-gray-700 leading-relaxed">
                For complete details on our refund policy, please visit our{' '}
                <Link to="/refunds" className="text-blue-600 hover:underline">
                  Refund Policy page
                </Link>
                . In general:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Refunds may be issued within 7 days of initial subscription purchase</li>
                <li>Refunds are provided at our discretion</li>
                <li>Renewal charges are generally non-refundable</li>
                <li>Technical issues preventing service access may qualify for pro-rated refunds</li>
              </ul>
            </section>

            {/* User Conduct */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Acceptable Use Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                You agree NOT to use our Service to:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Violate any applicable laws or regulations</li>
                <li>Infringe on intellectual property rights of others</li>
                <li>Upload malicious code, viruses, or harmful software</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Create fake or fraudulent reports</li>
                <li>Share your account credentials with unauthorized users</li>
                <li>Scrape, copy, or reverse engineer any part of the Service</li>
                <li>Use automated systems (bots) to access the Service</li>
                <li>Resell or redistribute the Service without authorization</li>
              </ul>
            </section>

            {/* Intellectual Property */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Intellectual Property Rights</h2>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">8.1 Our Rights</h3>
              <p className="text-gray-700 leading-relaxed">
                The Service and its original content, features, and functionality are owned by RestoreAssist and are
                protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">8.2 Your Content</h3>
              <p className="text-gray-700 leading-relaxed">
                You retain ownership of all reports, data, and content you create using our Service. By using our Service, you grant us:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>A limited license to store, process, and display your content solely to provide the Service</li>
                <li>Permission to use aggregated, anonymized data for improving our Service</li>
                <li>The right to create derivative works from your reports for machine learning model training</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">8.3 Trademark</h3>
              <p className="text-gray-700 leading-relaxed">
                "RestoreAssist" and our logo are trademarks of our company. You may not use our trademarks without
                prior written permission.
              </p>
            </section>

            {/* Disclaimers */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Disclaimers and Warranties</h2>

              <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-6">
                <p className="text-gray-900 font-semibold">Important Disclaimer</p>
                <p className="text-gray-700 mt-2">
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND.
                </p>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">9.1 No Warranty</h3>
              <p className="text-gray-700 leading-relaxed">
                We disclaim all warranties, express or implied, including but not limited to:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Warranties of merchantability and fitness for a particular purpose</li>
                <li>Warranties that the Service will be uninterrupted, secure, or error-free</li>
                <li>Warranties regarding the accuracy or reliability of reports generated</li>
                <li>Warranties that defects will be corrected</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">9.2 Professional Judgment</h3>
              <p className="text-gray-700 leading-relaxed">
                Reports generated by our Service are tools to assist restoration professionals. They should not replace
                professional judgment, on-site inspections, or expert analysis. You are solely responsible for verifying
                the accuracy of all reports before using them for business purposes.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">9.3 Cost Estimates</h3>
              <p className="text-gray-700 leading-relaxed">
                Cost estimates provided by our Service are AI-generated approximations based on industry data. Actual
                costs may vary significantly. We do not guarantee the accuracy of cost estimates and are not liable for
                any discrepancies between estimated and actual costs.
              </p>
            </section>

            {/* Limitation of Liability */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Limitation of Liability</h2>

              <div className="bg-red-50 border-l-4 border-red-600 p-4 mb-6">
                <p className="text-gray-900 font-semibold">Liability Limitation</p>
                <p className="text-gray-700 mt-2">
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
                  SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
                </p>
              </div>

              <p className="text-gray-700 leading-relaxed">
                Our total liability to you for any claims arising from or related to these Terms or the Service shall
                not exceed the amount you paid to us in the 12 months preceding the claim, or $100, whichever is greater.
              </p>

              <p className="text-gray-700 leading-relaxed mt-4">
                We are not liable for:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Loss of profits, revenue, data, or business opportunities</li>
                <li>Damages caused by third-party services (Google, Stripe, etc.)</li>
                <li>Errors or inaccuracies in AI-generated reports</li>
                <li>Service interruptions or data loss</li>
                <li>Unauthorized access to your account due to your failure to secure credentials</li>
              </ul>
            </section>

            {/* Indemnification */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Indemnification</h2>
              <p className="text-gray-700 leading-relaxed">
                You agree to indemnify, defend, and hold harmless RestoreAssist and its officers, directors, employees,
                and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Your use or misuse of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any rights of third parties</li>
                <li>Any reports you generate and distribute using our Service</li>
                <li>Your breach of any applicable laws or regulations</li>
              </ul>
            </section>

            {/* Dispute Resolution */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Dispute Resolution</h2>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">12.1 Informal Resolution</h3>
              <p className="text-gray-700 leading-relaxed">
                Before filing a claim, you agree to contact us at{' '}
                <a href="mailto:legal@restoreassist.app" className="text-blue-600 hover:underline">
                  legal@restoreassist.app
                </a>
                {' '}and attempt to resolve the dispute informally for at least 30 days.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">12.2 Governing Law</h3>
              <p className="text-gray-700 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of Australia, without regard
                to conflict of law principles.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">12.3 Arbitration</h3>
              <p className="text-gray-700 leading-relaxed">
                Any disputes that cannot be resolved informally shall be resolved through binding arbitration in
                accordance with the rules of the Australian Centre for International Commercial Arbitration (ACICA).
              </p>
            </section>

            {/* Changes to Terms */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">13. Changes to Terms</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify you of material changes by:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Posting the updated Terms on this page</li>
                <li>Updating the "Last updated" date</li>
                <li>Sending an email notification (for significant changes)</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Your continued use of the Service after changes take effect constitutes acceptance of the modified Terms.
                If you do not agree to the changes, you must stop using the Service and cancel your subscription.
              </p>
            </section>

            {/* Miscellaneous */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">14. Miscellaneous</h2>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">14.1 Entire Agreement</h3>
              <p className="text-gray-700 leading-relaxed">
                These Terms, together with our Privacy Policy and Refund Policy, constitute the entire agreement between
                you and RestoreAssist regarding the Service.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">14.2 Severability</h3>
              <p className="text-gray-700 leading-relaxed">
                If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in
                full force and effect.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">14.3 Waiver</h3>
              <p className="text-gray-700 leading-relaxed">
                Our failure to enforce any right or provision of these Terms will not constitute a waiver of such right
                or provision.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">14.4 Assignment</h3>
              <p className="text-gray-700 leading-relaxed">
                You may not assign or transfer these Terms without our prior written consent. We may assign these Terms
                without restriction.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">14.5 No Agency</h3>
              <p className="text-gray-700 leading-relaxed">
                Nothing in these Terms creates any agency, partnership, joint venture, or employment relationship between
                you and RestoreAssist.
              </p>
            </section>

            {/* Contact */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">15. Contact Information</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about these Terms, please contact us:
              </p>

              <div className="bg-gray-50 p-6 rounded-lg mt-4">
                <p className="text-gray-900 font-semibold">RestoreAssist Legal Team</p>
                <p className="text-gray-700 mt-2">
                  Email: <a href="mailto:legal@restoreassist.app" className="text-blue-600 hover:underline">
                    legal@restoreassist.app
                  </a>
                </p>
                <p className="text-gray-700 mt-1">
                  Support: <a href="mailto:support@restoreassist.app" className="text-blue-600 hover:underline">
                    support@restoreassist.app
                  </a>
                </p>
                <p className="text-gray-700 mt-1">
                  Website: <a href="https://restoreassist.app" className="text-blue-600 hover:underline">
                    https://restoreassist.app
                  </a>
                </p>
              </div>
            </section>

            {/* Acknowledgment */}
            <div className="bg-blue-50 border-l-4 border-blue-600 p-6 mt-8">
              <p className="text-gray-900 font-semibold">Acknowledgment</p>
              <p className="text-gray-700 mt-2">
                BY USING RESTOREASSIST, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE
                TERMS OF SERVICE.
              </p>
            </div>
          </div>

          {/* Footer Navigation */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <Link
                to="/privacy"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                View Privacy Policy →
              </Link>
              <Link
                to="/"
                className="inline-flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Home</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
