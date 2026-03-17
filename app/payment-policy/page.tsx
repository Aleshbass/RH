import { Metadata } from 'next';
import Link from 'next/link';
import { MedicalWebPageSchema } from '@/components/seo/StructuredData';

export const metadata: Metadata = {
  title: 'Payment Policy',
  description: 'Rehabify Health Payment Policy - Fee structure, billing practices, refund procedures, and payout terms for physiotherapy services.',
  keywords: ['payment policy', 'rehabify health', 'billing', 'refund policy', 'physiotherapy fees', 'Paystack payment'],
  openGraph: {
    title: 'Payment Policy | Rehabify Health',
    description: 'Understand Rehabify Health payment policies, fees, and refund procedures.',
    type: 'website',
  },
};

export default function PaymentPolicyPage() {
  return (
    <>
      <MedicalWebPageSchema
        title="Payment Policy - Rehabify Health"
        description="Fee structure, billing practices, and payment terms for Rehabify Health services"
        url="https://physioaroundme.com/payment-policy"
      />
      
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
            <h1 className="text-4xl font-bold text-[#005b57] mb-4">Payment Policy</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-gray-600">
              <p><strong>Effective Date:</strong> October 2, 2025</p>
              <span className="hidden sm:block">•</span>
              <p><strong>Contact:</strong> <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline">rehabify.app@gmail.com</a></p>
            </div>
            
            {/* Download Option */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <a 
                href="/docs/Rehabify Health – Payment Policy 2_10_25.docx"
                download
                className="inline-flex items-center gap-2 text-[#005b57] hover:text-[#00877e] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download as Word Document
              </a>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-lg shadow-sm p-8 prose prose-lg max-w-none">
            
            <section id="introduction" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                This Payment Policy outlines how <strong>Rehabify Health</strong> ("Rehabify," "we," "our," or "us") manages fees, billing, payments, refunds, and payouts for services provided through our platform. By using Rehabify, you agree to these payment terms.
              </p>
            </section>

            <section id="payment-methods" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">2. Payment Methods & Processing</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                All payments on Rehabify are processed securely through <strong>Paystack</strong>, our trusted payment gateway.
              </p>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Accepted Payment Methods</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Debit/Credit Cards:</strong> Visa, Mastercard, Verve</li>
                <li><strong>Bank Transfers:</strong> Direct bank account transfers</li>
                <li><strong>USSD:</strong> Mobile banking codes</li>
                <li><strong>Mobile Money:</strong> Mobile wallet payments</li>
              </ul>

              <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                <p className="text-blue-900">
                  <strong>Secure Processing:</strong> Rehabify does not store your full card details. All payment information is handled securely by Paystack in compliance with PCI DSS standards.
                </p>
              </div>
            </section>

            <section id="fee-structure" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">3. Fee Structure</h2>
              
              <div className="bg-gradient-to-r from-[#005b57] to-[#00877e] text-white rounded-lg p-6 mb-6">
                <h3 className="text-2xl font-bold mb-4">Rehabify Platform Fees</h3>
                
                <div className="space-y-4">
                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-lg font-semibold mb-2">Base Platform Fee</p>
                    <p className="text-3xl font-bold">₦1,000</p>
                    <p className="text-sm opacity-90 mt-1">Per transaction</p>
                  </div>

                  <div className="bg-white/10 rounded-lg p-4">
                    <p className="text-lg font-semibold mb-2">Payment Processing Fee</p>
                    <p className="text-3xl font-bold">1.5% + ₦100</p>
                    <p className="text-sm opacity-90 mt-1">Capped at ₦2,000 for transactions over ₦100,000</p>
                  </div>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Fee Calculation Example</h3>
              <div className="bg-gray-50 p-6 rounded-lg">
                <p className="text-gray-700 font-semibold mb-3">For a ₦20,000 appointment:</p>
                <ul className="space-y-2 text-gray-700">
                  <li>• Appointment Fee: <strong>₦20,000</strong></li>
                  <li>• Platform Fee: <strong>₦1,000</strong></li>
                  <li>• Processing Fee: <strong>₦415</strong> (1.5% of ₦21,000 + ₦100)</li>
                  <li className="pt-2 border-t border-gray-300 font-bold">Patient Pays: <strong>₦21,415</strong></li>
                  <li className="text-green-700 font-bold">Physiotherapist Receives: <strong>₦20,000</strong></li>
                </ul>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded">
                <p className="text-yellow-900">
                  <strong>Note:</strong> For transactions over ₦100,000, the processing fee is capped at ₦2,000 total.
                </p>
              </div>
            </section>

            <section id="pricing-flexibility" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">4. Pricing Flexibility</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>Physiotherapists and clinics have full control over their pricing.</strong> You can set your own rates for:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Initial consultations</li>
                <li>Follow-up sessions</li>
                <li>Specialized treatments</li>
                <li>Package deals and bundles</li>
                <li>Home visit services</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Rehabify's platform and processing fees are added transparently to your set prices.
              </p>
            </section>

            <section id="payouts" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">5. Payouts to Providers</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Payout Timeline</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Physiotherapists and clinics receive their earnings (after deducting platform and processing fees) within:
              </p>
              <div className="bg-green-50 p-6 rounded-lg">
                <p className="text-2xl font-bold text-green-700 mb-2">48 hours to 2 weeks</p>
                <p className="text-gray-700">After successful payment confirmation</p>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Payout Requirements</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Valid Nigerian bank account linked to your profile</li>
                <li>Completed identity and license verification</li>
                <li>Minimum payout threshold: ₦1,000</li>
                <li>Session completion and documentation</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Payout Method</h3>
              <p className="text-gray-700 leading-relaxed">
                Payouts are made via direct bank transfer to your registered account. You will receive email notifications when payouts are processed.
              </p>
            </section>

            <section id="refunds" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">6. Refunds & Cancellations</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Patient-Initiated Cancellations</h3>
              
              <div className="space-y-4">
                <div className="border-l-4 border-green-500 bg-green-50 p-4 rounded">
                  <p className="font-semibold text-green-900 mb-2">✓ Cancellation 24+ Hours Before Appointment</p>
                  <ul className="text-gray-700 space-y-1 text-sm">
                    <li>• <strong>Full refund</strong> of appointment fee</li>
                    <li>• Processing fees are non-refundable</li>
                    <li>• Refund processed within 5-7 business days</li>
                  </ul>
                </div>

                <div className="border-l-4 border-red-500 bg-red-50 p-4 rounded">
                  <p className="font-semibold text-red-900 mb-2">✗ Cancellation Less Than 24 Hours Before</p>
                  <ul className="text-gray-700 space-y-1 text-sm">
                    <li>• <strong>Non-refundable</strong></li>
                    <li>• Exceptions: Medical emergencies (documentation required)</li>
                    <li>• Provider may offer rescheduling at their discretion</li>
                  </ul>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Provider-Initiated Cancellations</h3>
              <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
                <ul className="text-gray-700 space-y-2">
                  <li>• <strong>Full refund</strong> including all fees</li>
                  <li>• Patient receives 100% refund regardless of timing</li>
                  <li>• Refund processed within 3-5 business days</li>
                  <li>• Provider may face penalties for frequent cancellations</li>
                </ul>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Dispute Resolution</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Dispute Window:</strong> 7 days from appointment date to raise a dispute</li>
                <li><strong>Processing Time:</strong> 5-10 business days for investigation</li>
                <li><strong>Resolution:</strong> Refunds granted based on evidence and platform policies</li>
                <li><strong>Contact:</strong> <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline">rehabify.app@gmail.com</a></li>
              </ul>
            </section>

            <section id="invoices" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">7. Invoices & Receipts</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Automatic Generation:</strong> Digital invoices created for every transaction</li>
                <li><strong>Access:</strong> Available in your dashboard under "Billing" or "Payments"</li>
                <li><strong>Contents:</strong> Detailed breakdown of fees, appointment details, payment method</li>
                <li><strong>Download:</strong> PDF format available for tax and record-keeping</li>
                <li><strong>Receipt:</strong> Email confirmation sent to both patient and provider</li>
              </ul>
            </section>

            <section id="taxes" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">8. Taxes & Compliance</h2>
              
              <div className="p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded mb-4">
                <p className="text-yellow-900 font-semibold">
                  <strong>Important:</strong> Physiotherapists and clinics are responsible for their own tax obligations in Nigeria.
                </p>
              </div>

              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Tax Responsibility:</strong> Providers must declare income and pay applicable taxes</li>
                <li><strong>VAT:</strong> Value Added Tax (VAT) compliance is the provider's responsibility</li>
                <li><strong>Business Registration:</strong> Ensure proper business registration with Nigerian authorities</li>
                <li><strong>Tax Documentation:</strong> Rehabify provides payment records for tax filing purposes</li>
                <li><strong>Professional Advice:</strong> Consult with a tax professional for specific guidance</li>
              </ul>

              <p className="text-gray-700 leading-relaxed mt-4">
                Rehabify is not responsible for individual tax obligations. We recommend keeping detailed records of all transactions.
              </p>
            </section>

            <section id="late-payments" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">9. Late Payments & Failed Transactions</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Payment Confirmation</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Appointments are only confirmed after successful payment</li>
                <li>If payment fails, you will be notified to retry</li>
                <li>Unpaid appointments are automatically cancelled after 24 hours</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Failed Payment Retries</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>You may retry payment up to 3 times</li>
                <li>After 3 failed attempts, appointment slot may be released</li>
                <li>Contact support if you experience persistent payment issues</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">No Late Fees</h3>
              <p className="text-gray-700 leading-relaxed">
                Rehabify does not charge late fees. However, appointments require upfront payment before confirmation.
              </p>
            </section>

            <section id="policy-updates" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">10. Payment Policy Updates</h2>
              <p className="text-gray-700 leading-relaxed">
                Rehabify reserves the right to modify this Payment Policy. Significant changes will be communicated via email and platform notifications at least 30 days in advance. Continued use of the platform after updates constitutes acceptance of the revised policy.
              </p>
            </section>

            <section id="contact" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">11. Contact for Payment Issues</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                For payment-related questions, disputes, or technical issues:
              </p>
              <div className="mt-4 p-6 bg-gray-50 rounded-lg">
                <p className="text-gray-700 font-semibold mb-3">Payment Support Team</p>
                <p className="text-gray-700">
                  <strong>Email:</strong> <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline">rehabify.app@gmail.com</a>
                </p>
                <p className="text-gray-700 mt-2">
                  <strong>Subject Line:</strong> "Payment Issue - [Your Issue]"
                </p>
                <p className="text-gray-700 mt-2">
                  <strong>Response Time:</strong> Within 24-48 hours
                </p>
              </div>

              <div className="mt-6 p-4 bg-green-50 border-l-4 border-green-500 rounded">
                <p className="text-green-900">
                  <strong>Paystack Support:</strong> For payment gateway technical issues, you may also contact Paystack directly at <a href="mailto:support@paystack.com" className="text-green-700 hover:underline">support@paystack.com</a>
                </p>
              </div>
            </section>

            {/* Summary Box */}
            <div className="mt-8 bg-gradient-to-r from-[#005b57] to-[#00877e] text-white rounded-lg p-8">
              <h3 className="text-2xl font-bold mb-4">Quick Summary</h3>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold mb-2">Platform Fee:</p>
                  <p>₦1,000 per transaction</p>
                </div>
                <div>
                  <p className="font-semibold mb-2">Processing Fee:</p>
                  <p>1.5% + ₦100</p>
                </div>
                <div>
                  <p className="font-semibold mb-2">Payout Time:</p>
                  <p>48 hours to 2 weeks</p>
                </div>
                <div>
                  <p className="font-semibold mb-2">Cancellation:</p>
                  <p>24+ hours: Full refund</p>
                </div>
              </div>
            </div>

            {/* Back to home link */}
            <div className="mt-12 pt-8 border-t border-gray-200 text-center">
              <Link href="/" className="inline-flex items-center gap-2 text-[#005b57] hover:text-[#00877e] font-semibold transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
