import { ArrowLeft } from '@/components/icons'
import { Metadata } from 'next';
import Link from 'next/link';
import { MedicalWebPageSchema } from '@/components/seo/StructuredData';

export const metadata: Metadata = {
  title: 'Payment Policy',
  description: 'Rehabify Health Payment Policy - all-inclusive standard prices, how payment and booking confirmation work, travel charges, refunds and cancellations.',
  keywords: ['payment policy', 'rehabify health', 'billing', 'refund policy', 'physiotherapy fees', 'Paystack payment', 'all-inclusive pricing'],
  openGraph: {
    title: 'Payment Policy | Rehabify Health',
    description: 'How payments, booking confirmation and refunds work on Rehabify Health.',
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
              <p><strong>Effective Date:</strong> October 19, 2026</p>
              <span className="hidden sm:block">•</span>
              <p><strong>Contact:</strong> <a href="mailto:support@physioaroundme.com" className="text-[#005b57] hover:underline">support@physioaroundme.com</a></p>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-lg shadow-sm p-8 prose prose-lg max-w-none">
            
            <section id="introduction" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                This Payment Policy outlines how <strong>Rehabify Health</strong> ("Rehabify," "we," "our," or "us") manages billing, payment processing, and refunds for services facilitated through our platform. By using Rehabify, you agree to these payment terms.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                When you book a Rehabify service, you pay <strong>Rehabify Health</strong> through Paystack&apos;s secure checkout. Rehabify holds the payment and pays the physiotherapist once your session has been completed. Payments a clinic takes from its own patients through Rehabify&apos;s clinic software are settled to that clinic through Paystack and follow the clinic&apos;s own terms.
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
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">3. Prices and Fees</h2>

              <div className="bg-gradient-to-r from-[#005b57] to-[#00877e] text-white rounded-lg p-6 mb-6">
                <h3 className="text-2xl font-bold mb-4">All-Inclusive Prices</h3>
                <div className="bg-white/10 rounded-lg p-4">
                  <p className="text-lg font-semibold mb-2">The price you see is the price you pay</p>
                  <p className="text-sm opacity-90 mt-1">No booking, platform or card processing fee is added at checkout.</p>
                </div>
              </div>

              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Standard prices:</strong> Rehabify sets one price for each service, the same whichever Rehabify physiotherapist you see. Current prices are on our <Link href="/pricing" className="text-[#005b57] hover:underline">Pricing page</Link>.</li>
                <li><strong>Payment processing:</strong> Rehabify pays Paystack&apos;s processing fee. It is never added to your total.</li>
                <li><strong>Travel charges:</strong> some home visits include a travel charge, set by your city and area. It is shown, with your total, before you pay.</li>
                <li><strong>No subscriptions:</strong> you pay for each session as you book it.</li>
                <li><strong>Help with the cost:</strong> eligible patients may receive reduced fees through <Link href="/rehabify-access" className="text-[#005b57] hover:underline">Rehabify Access</Link>. Healthcare financing is also available from our partner MediLoan (MyItura).</li>
              </ul>
            </section>

            <section id="payment-and-confirmation" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">4. Payment and Booking Confirmation</h2>
              <ol className="list-decimal pl-6 text-gray-700 space-y-3">
                <li>You choose a service, a physiotherapist and a time from their availability.</li>
                <li>We hold that time while you pay securely through Paystack.</li>
                <li>Your booking is confirmed as soon as your payment has been verified.</li>
                <li>Rehabify holds your payment and pays the physiotherapist after your session has been completed.</li>
              </ol>
            </section>

            <section id="clinic-payments" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">5. Clinic Payments</h2>
              <p className="text-gray-700 leading-relaxed">
                Clinics that use Rehabify&apos;s software can bill their own patients through invoices and payment links. Those prices are set by the clinic, payments are settled to the clinic&apos;s registered account through Paystack, and the clinic&apos;s own terms apply.
              </p>
            </section>

            <section id="refunds" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">6. Refunds & Cancellations</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Patient-Initiated Cancellations</h3>
              
              <div className="space-y-4">
                <div className="border-l-4 border-green-500 bg-green-50 p-4 rounded">
                  <p className="font-semibold text-green-900 mb-2">✓ Cancellation 24+ Hours Before Appointment</p>
                  <ul className="text-gray-700 space-y-1 text-sm">
                    <li>• <strong>Full refund</strong> of the amount you paid</li>
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
                  <li>• <strong>Full refund</strong> of the amount you paid, including any travel charge</li>
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
                <li><strong>Contact:</strong> <a href="mailto:support@physioaroundme.com" className="text-[#005b57] hover:underline">support@physioaroundme.com</a></li>
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
                <li>Your chosen time is held while you pay. If payment isn&apos;t completed in time, the time may be released</li>
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
                  <strong>Email:</strong> <a href="mailto:support@physioaroundme.com" className="text-[#005b57] hover:underline">support@physioaroundme.com</a>
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
                  <p className="font-semibold mb-2">Prices:</p>
                  <p>Standard and all-inclusive — no platform or processing fee at checkout</p>
                </div>
                <div>
                  <p className="font-semibold mb-2">Travel Charges:</p>
                  <p>Home visits only, shown before you pay</p>
                </div>
                <div>
                  <p className="font-semibold mb-2">Confirmation:</p>
                  <p>As soon as your payment is verified</p>
                </div>
                <div>
                  <p className="font-semibold mb-2">Cancellation:</p>
                  <p>24+ hours before: Full refund</p>
                </div>
              </div>
            </div>

            {/* Back to home link */}
            <div className="mt-12 pt-8 border-t border-gray-200 text-center">
              <Link href="/" className="inline-flex items-center gap-2 text-[#005b57] hover:text-[#00877e] font-semibold transition-colors">
                <ArrowLeft className="w-5 h-5" />
                Back to Homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
