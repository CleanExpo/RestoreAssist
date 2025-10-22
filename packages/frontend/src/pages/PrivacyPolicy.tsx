import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

export const PrivacyPolicy: React.FC = () => {
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
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Privacy Policy</h1>
              <p className="text-gray-500 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          <div className="prose prose-lg max-w-none">
            {/* Introduction */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                Welcome to RestoreAssist ("we," "our," or "us"). We are committed to protecting your personal information
                and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your
                information when you use our website and services at restoreassist.app (the "Service").
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                By using our Service, you agree to the collection and use of information in accordance with this Privacy Policy.
                If you do not agree with our policies and practices, please do not use our Service.
              </p>
            </section>

            {/* Information We Collect */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">2.1 Personal Information You Provide</h3>
              <p className="text-gray-700 leading-relaxed">
                We collect personal information that you voluntarily provide to us when you:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Sign up for an account using Google OAuth</li>
                <li>Create disaster recovery reports</li>
                <li>Subscribe to our paid plans</li>
                <li>Contact us for support</li>
                <li>Participate in surveys or promotions</li>
              </ul>

              <p className="text-gray-700 leading-relaxed mt-4">
                The personal information we collect may include:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Account Information:</strong> Name, email address, profile picture (from Google OAuth)</li>
                <li><strong>Report Data:</strong> Property addresses, damage descriptions, client names, insurance information</li>
                <li><strong>Payment Information:</strong> Billing address, payment method details (processed securely by Stripe)</li>
                <li><strong>Communication Data:</strong> Email correspondence, support requests, feedback</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">2.2 Information Automatically Collected</h3>
              <p className="text-gray-700 leading-relaxed">
                When you access our Service, we automatically collect certain information about your device and usage:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers</li>
                <li><strong>Usage Data:</strong> Pages visited, time spent, features used, report generation history</li>
                <li><strong>Cookies and Tracking:</strong> Session cookies, authentication tokens, analytics cookies</li>
              </ul>
            </section>

            {/* How We Use Your Information */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-700 leading-relaxed">
                We use your personal information for the following purposes:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Service Delivery:</strong> To provide, maintain, and improve our disaster recovery report generation service</li>
                <li><strong>Account Management:</strong> To create and manage your account, authenticate users, and provide customer support</li>
                <li><strong>Payment Processing:</strong> To process subscriptions, handle billing, and prevent fraud</li>
                <li><strong>Communication:</strong> To send service updates, trial expiry notifications, payment receipts, and marketing communications (with your consent)</li>
                <li><strong>Analytics:</strong> To understand how users interact with our Service and improve user experience</li>
                <li><strong>Legal Compliance:</strong> To comply with legal obligations, enforce our terms, and protect our rights</li>
                <li><strong>Security:</strong> To detect, prevent, and address fraud, security issues, and technical problems</li>
              </ul>
            </section>

            {/* Third-Party Services */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed">
                We use the following trusted third-party service providers to operate our Service:
              </p>

              <div className="mt-4 space-y-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900">Google OAuth</h4>
                  <p className="text-gray-700 mt-1">For user authentication and account creation</p>
                  <a href="https://policies.google.com/privacy" className="text-blue-600 hover:underline text-sm">
                    Google Privacy Policy →
                  </a>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900">Stripe</h4>
                  <p className="text-gray-700 mt-1">For secure payment processing and subscription management</p>
                  <a href="https://stripe.com/privacy" className="text-blue-600 hover:underline text-sm">
                    Stripe Privacy Policy →
                  </a>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900">Supabase</h4>
                  <p className="text-gray-700 mt-1">For database hosting and authentication services</p>
                  <a href="https://supabase.com/privacy" className="text-blue-600 hover:underline text-sm">
                    Supabase Privacy Policy →
                  </a>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900">SendGrid</h4>
                  <p className="text-gray-700 mt-1">For transactional email delivery (receipts, notifications)</p>
                  <a href="https://www.twilio.com/legal/privacy" className="text-blue-600 hover:underline text-sm">
                    SendGrid Privacy Policy →
                  </a>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900">Vercel</h4>
                  <p className="text-gray-700 mt-1">For web hosting and content delivery</p>
                  <a href="https://vercel.com/legal/privacy-policy" className="text-blue-600 hover:underline text-sm">
                    Vercel Privacy Policy →
                  </a>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-gray-900">Sentry</h4>
                  <p className="text-gray-700 mt-1">For error tracking and performance monitoring</p>
                  <a href="https://sentry.io/privacy/" className="text-blue-600 hover:underline text-sm">
                    Sentry Privacy Policy →
                  </a>
                </div>
              </div>
            </section>

            {/* Data Retention */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed">
                We retain your personal information for as long as necessary to provide our Service and fulfill the
                purposes outlined in this Privacy Policy. Specifically:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Account Data:</strong> Retained while your account is active and for 30 days after account deletion</li>
                <li><strong>Report Data:</strong> Retained for the duration of your subscription plus 90 days</li>
                <li><strong>Payment Records:</strong> Retained for 7 years for tax and legal compliance</li>
                <li><strong>Analytics Data:</strong> Aggregated and anonymized after 24 months</li>
              </ul>
            </section>

            {/* Your Rights */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Your Privacy Rights</h2>
              <p className="text-gray-700 leading-relaxed">
                Depending on your location, you may have the following rights regarding your personal information:
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">6.1 General Rights</h3>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information</li>
                <li><strong>Portability:</strong> Request transfer of your data to another service</li>
                <li><strong>Objection:</strong> Object to processing of your personal information</li>
                <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">6.2 GDPR Rights (European Users)</h3>
              <p className="text-gray-700 leading-relaxed">
                If you are located in the European Economic Area (EEA), you have additional rights under the General
                Data Protection Regulation (GDPR), including the right to lodge a complaint with your local data
                protection authority.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">6.3 CCPA Rights (California Users)</h3>
              <p className="text-gray-700 leading-relaxed">
                California residents have specific rights under the California Consumer Privacy Act (CCPA), including
                the right to know what personal information is collected and the right to opt-out of the sale of
                personal information (we do not sell personal information).
              </p>

              <div className="bg-blue-50 border-l-4 border-blue-600 p-4 mt-6">
                <p className="text-gray-900 font-semibold">Exercise Your Rights</p>
                <p className="text-gray-700 mt-2">
                  To exercise any of these rights, please contact us at{' '}
                  <a href="mailto:airestoreassist@gmail.com" className="text-blue-600 hover:underline">
                    airestoreassist@gmail.com
                  </a>
                </p>
              </div>
            </section>

            {/* Data Security */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Data Security</h2>
              <p className="text-gray-700 leading-relaxed">
                We implement appropriate technical and organizational security measures to protect your personal information:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Encryption:</strong> All data in transit is encrypted using TLS/SSL</li>
                <li><strong>Access Controls:</strong> Strict access controls and authentication requirements</li>
                <li><strong>Secure Storage:</strong> Data at rest is encrypted in secure databases</li>
                <li><strong>Regular Audits:</strong> Security assessments and vulnerability scans</li>
                <li><strong>Incident Response:</strong> Procedures for detecting and responding to security breaches</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                However, no method of transmission over the internet or electronic storage is 100% secure. While we
                strive to protect your personal information, we cannot guarantee absolute security.
              </p>
            </section>

            {/* Cookies */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Cookies and Tracking Technologies</h2>
              <p className="text-gray-700 leading-relaxed">
                We use cookies and similar tracking technologies to enhance your experience:
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">8.1 Types of Cookies We Use</h3>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li><strong>Essential Cookies:</strong> Required for authentication and core functionality</li>
                <li><strong>Analytics Cookies:</strong> Help us understand how you use our Service</li>
                <li><strong>Preference Cookies:</strong> Remember your settings and preferences</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mb-3 mt-6">8.2 Managing Cookies</h3>
              <p className="text-gray-700 leading-relaxed">
                You can control cookies through your browser settings. However, disabling essential cookies may
                affect your ability to use certain features of our Service.
              </p>
            </section>

            {/* Children's Privacy */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Our Service is not intended for children under the age of 16. We do not knowingly collect personal
                information from children under 16. If you believe we have collected information from a child under 16,
                please contact us immediately at{' '}
                <a href="mailto:airestoreassist@gmail.com" className="text-blue-600 hover:underline">
                  airestoreassist@gmail.com
                </a>
                {' '}and we will delete such information.
              </p>
            </section>

            {/* International Transfers */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">10. International Data Transfers</h2>
              <p className="text-gray-700 leading-relaxed">
                Your information may be transferred to and processed in countries other than your country of residence.
                These countries may have data protection laws that differ from the laws of your country. We ensure
                appropriate safeguards are in place to protect your information in accordance with this Privacy Policy.
              </p>
            </section>

            {/* Changes to Privacy Policy */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Changes to This Privacy Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by:
              </p>
              <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-700">
                <li>Posting the new Privacy Policy on this page</li>
                <li>Updating the "Last updated" date at the top of this policy</li>
                <li>Sending you an email notification (for significant changes)</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Your continued use of our Service after any changes indicates your acceptance of the updated Privacy Policy.
              </p>
            </section>

            {/* Contact Us */}
            <section className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices,
                please contact us:
              </p>

              <div className="bg-gray-50 p-6 rounded-lg mt-4">
                <p className="text-gray-900 font-semibold">RestoreAssist Privacy Team</p>
                <p className="text-gray-700 mt-2">
                  Email: <a href="mailto:airestoreassist@gmail.com" className="text-blue-600 hover:underline">
                    airestoreassist@gmail.com
                  </a>
                </p>
                <p className="text-gray-700 mt-1">
                  Support: <a href="mailto:airestoreassist@gmail.com" className="text-blue-600 hover:underline">
                    airestoreassist@gmail.com
                  </a>
                </p>
                <p className="text-gray-700 mt-1">
                  Website: <a href="https://restoreassist.app" className="text-blue-600 hover:underline">
                    https://restoreassist.app
                  </a>
                </p>
              </div>
            </section>
          </div>

          {/* Footer Navigation */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <Link
                to="/terms"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                View Terms of Service →
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
