import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Mail } from 'lucide-react';

export const RefundPolicy: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Back Button */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <Link
            to="/"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span>Back to Home</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-12 max-w-4xl">
        <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
          {/* Title Section */}
          <div className="flex items-center space-x-4 mb-8">
            <div className="bg-green-100 p-3 rounded-xl">
              <DollarSign className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-gray-900">Refund Policy</h1>
              <p className="text-gray-500 mt-1">Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          {/* Introduction */}
          <div className="prose max-w-none mb-8">
            <p className="text-lg text-gray-700 leading-relaxed">
              At RestoreAssist, we are committed to your satisfaction. This Refund Policy explains our policies regarding refunds for our disaster recovery report generation service.
            </p>
          </div>

          <div className="space-y-8">
            {/* 1. Free Trial Refund Policy */}
            <section>
              <div className="flex items-start space-x-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-600 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">1. Free Trial Refund Policy</h2>
                  <p className="text-gray-700 mb-3">
                    Our free trial offers 7 days OR 3 reports, whichever comes first. Since the trial is completely free with no payment required:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>No refund is necessary as no payment is collected during the trial period</li>
                    <li>You may cancel your trial at any time without charge</li>
                    <li>If you do not upgrade to a paid plan, your account will revert to limited access after the trial expires</li>
                    <li>Trial reports generated during the free period remain accessible to you</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 2. Subscription Refund Policy */}
            <section>
              <div className="flex items-start space-x-3 mb-4">
                <Clock className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">2. Subscription Refund Policy</h2>
                  <p className="text-gray-700 mb-3">
                    For paid subscriptions (Monthly or Yearly plans):
                  </p>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <h3 className="font-semibold text-gray-900 mb-2">7-Day Money-Back Guarantee</h3>
                    <p className="text-gray-700">
                      We offer a full refund within 7 days of your initial subscription purchase if you are not satisfied with our service.
                    </p>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-2 mt-4">Eligibility Criteria:</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Request must be made within 7 days of your initial subscription payment</li>
                    <li>Applies to first-time subscribers only</li>
                    <li>Limited to one refund per customer</li>
                    <li>Valid for both Monthly and Yearly subscription plans</li>
                  </ul>

                  <h3 className="font-semibold text-gray-900 mb-2 mt-4">What Happens After 7 Days:</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Refunds are generally not provided after the 7-day window</li>
                    <li>You may cancel your subscription at any time to prevent future charges</li>
                    <li>Cancellations take effect at the end of your current billing period</li>
                    <li>No partial refunds for unused time within a billing period</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 3. Subscription Renewal Refunds */}
            <section>
              <div className="flex items-start space-x-3 mb-4">
                <XCircle className="w-6 h-6 text-red-600 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">3. Subscription Renewal Refunds</h2>
                  <p className="text-gray-700 mb-3">
                    For subscription renewals:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Subscription renewals are <strong>not eligible for refunds</strong></li>
                    <li>It is your responsibility to cancel your subscription before the renewal date if you do not wish to continue</li>
                    <li>Renewal dates are clearly displayed in your account dashboard</li>
                    <li>We send email reminders before renewal charges are processed</li>
                    <li>You can cancel your subscription at any time to prevent future renewals</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 4. Exceptions and Special Circumstances */}
            <section>
              <div className="flex items-start space-x-3 mb-4">
                <AlertCircle className="w-6 h-6 text-orange-600 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">4. Exceptions and Special Circumstances</h2>
                  <p className="text-gray-700 mb-3">
                    We may consider refunds outside of our standard policy in exceptional circumstances:
                  </p>

                  <h3 className="font-semibold text-gray-900 mb-2">Technical Issues:</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4 mb-4">
                    <li>Service was unavailable for an extended period due to our technical failures</li>
                    <li>Reports could not be generated due to system errors on our end</li>
                    <li>Data loss or corruption caused by our service</li>
                  </ul>

                  <h3 className="font-semibold text-gray-900 mb-2">Billing Errors:</h3>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4 mb-4">
                    <li>You were charged incorrectly or multiple times for the same service</li>
                    <li>Unauthorized charges appeared on your account</li>
                    <li>Price discrepancies between advertised and charged amounts</li>
                  </ul>

                  <p className="text-gray-700 mt-4">
                    These exceptions are handled on a case-by-case basis and require documentation of the issue. Please contact our support team with details of the problem.
                  </p>
                </div>
              </div>
            </section>

            {/* 5. How to Request a Refund */}
            <section>
              <div className="flex items-start space-x-3 mb-4">
                <Mail className="w-6 h-6 text-purple-600 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">5. How to Request a Refund</h2>
                  <p className="text-gray-700 mb-3">
                    To request a refund, please follow these steps:
                  </p>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                    <ol className="list-decimal list-inside space-y-3 text-gray-700">
                      <li>
                        <strong>Email our support team</strong> at{' '}
                        <a href="mailto:airestoreassist@gmail.com" className="text-blue-600 hover:text-blue-800 underline">
                          airestoreassist@gmail.com
                        </a>
                      </li>
                      <li>
                        <strong>Include the following information:</strong>
                        <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                          <li>Your account email address</li>
                          <li>Your subscription plan (Monthly or Yearly)</li>
                          <li>Date of purchase</li>
                          <li>Reason for refund request</li>
                          <li>Any relevant transaction IDs or receipts</li>
                        </ul>
                      </li>
                      <li>
                        <strong>Wait for our response</strong> - We aim to respond to all refund requests within 2-3 business days
                      </li>
                    </ol>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-gray-700">
                      <strong>Important:</strong> Disputing a charge with your credit card company or payment provider before contacting us may result in delays in processing your refund and could affect your access to the service.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* 6. Refund Processing Time */}
            <section>
              <div className="flex items-start space-x-3 mb-4">
                <Clock className="w-6 h-6 text-indigo-600 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">6. Refund Processing Time</h2>
                  <p className="text-gray-700 mb-3">
                    Once your refund request is approved:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>We will process the refund within 3-5 business days</li>
                    <li>Refunds are issued to the original payment method used for the purchase</li>
                    <li>Depending on your bank or credit card company, it may take an additional 5-10 business days for the refund to appear in your account</li>
                    <li>You will receive an email confirmation when the refund has been processed</li>
                  </ul>

                  <p className="text-gray-700 mt-4">
                    If you do not receive your refund within the expected timeframe, please check with your financial institution first, then contact us at{' '}
                    <a href="mailto:airestoreassist@gmail.com" className="text-blue-600 hover:text-blue-800 underline">
                      airestoreassist@gmail.com
                    </a>.
                  </p>
                </div>
              </div>
            </section>

            {/* 7. Cancellation vs. Refund */}
            <section>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-3">7. Cancellation vs. Refund</h2>
                <p className="text-gray-700 mb-3">
                  It's important to understand the difference:
                </p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-300">
                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                      <XCircle className="w-5 h-5 text-blue-600 mr-2" />
                      Cancellation
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                      <li>Stops future billing</li>
                      <li>Can be done anytime</li>
                      <li>Access continues until end of billing period</li>
                      <li>No money back for current period</li>
                    </ul>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-blue-300">
                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                      <DollarSign className="w-5 h-5 text-green-600 mr-2" />
                      Refund
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                      <li>Returns money for current period</li>
                      <li>Must be within 7 days (new subscriptions)</li>
                      <li>Access may be revoked immediately</li>
                      <li>Subject to eligibility criteria</li>
                    </ul>
                  </div>
                </div>

                <p className="text-gray-700 mt-4">
                  You can cancel your subscription at any time from your account dashboard under "Subscription Management" without requesting a refund.
                </p>
              </div>
            </section>

            {/* 8. Non-Refundable Items */}
            <section>
              <div className="flex items-start space-x-3 mb-4">
                <XCircle className="w-6 h-6 text-red-600 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">8. Non-Refundable Items</h2>
                  <p className="text-gray-700 mb-3">
                    The following are not eligible for refunds under any circumstances:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Reports that have been successfully generated and delivered to you</li>
                    <li>Data or information you have downloaded or exported from the platform</li>
                    <li>Services rendered during periods where the platform was available and functioning</li>
                    <li>Subscription renewals after the first 7 days of the renewal period</li>
                    <li>Any portion of a billing period that has already passed</li>
                    <li>Third-party integration costs (if applicable)</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 9. Changes to This Policy */}
            <section>
              <div className="flex items-start space-x-3 mb-4">
                <AlertCircle className="w-6 h-6 text-gray-600 mt-1 flex-shrink-0" />
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-3">9. Changes to This Refund Policy</h2>
                  <p className="text-gray-700 mb-3">
                    We may update this Refund Policy from time to time. Changes will be effective immediately upon posting to this page. We will:
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                    <li>Update the "Last updated" date at the top of this policy</li>
                    <li>Notify active subscribers via email of any material changes</li>
                    <li>Maintain records of previous versions for reference</li>
                  </ul>
                  <p className="text-gray-700 mt-3">
                    Your continued use of RestoreAssist after changes to this policy constitutes acceptance of the updated terms.
                  </p>
                </div>
              </div>
            </section>

            {/* 10. Contact Information */}
            <section>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-start space-x-3">
                  <Mail className="w-6 h-6 text-blue-600 mt-1 flex-shrink-0" />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-3">10. Contact Us</h2>
                    <p className="text-gray-700 mb-4">
                      If you have any questions about our Refund Policy or need assistance with a refund request, please contact us:
                    </p>
                    <div className="space-y-2 text-gray-700">
                      <p>
                        <strong>Email:</strong>{' '}
                        <a href="mailto:airestoreassist@gmail.com" className="text-blue-600 hover:text-blue-800 underline">
                          airestoreassist@gmail.com
                        </a>
                      </p>
                      <p>
                        <strong>Website:</strong>{' '}
                        <a href="https://restoreassist.app" className="text-blue-600 hover:text-blue-800 underline">
                          https://restoreassist.app
                        </a>
                      </p>
                      <p>
                        <strong>Response Time:</strong> We typically respond within 2-3 business days
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Footer Navigation */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
              <Link
                to="/"
                className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
              <div className="flex flex-wrap justify-center gap-4 text-sm">
                <Link to="/privacy" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Privacy Policy
                </Link>
                <span className="text-gray-300">•</span>
                <Link to="/terms" className="text-gray-600 hover:text-gray-900 transition-colors">
                  Terms of Service
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
