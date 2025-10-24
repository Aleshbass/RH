import { Metadata } from 'next';
import Link from 'next/link';
import { MedicalWebPageSchema } from '@/components/seo/StructuredData';

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description: 'Rehabify Health Terms and Conditions - User agreements, platform rules, and service guidelines for our AI-powered physiotherapy platform.',
  keywords: ['terms and conditions', 'rehabify health', 'user agreement', 'healthcare platform terms', 'physiotherapy services'],
  openGraph: {
    title: 'Terms and Conditions | Rehabify Health',
    description: 'Read our terms and conditions for using RehabifyHealth platform and services.',
    type: 'website',
  },
};

export default function TermsAndConditionsPage() {
  return (
    <>
      <MedicalWebPageSchema
        title="Terms and Conditions - Rehabify Health"
        description="User agreements and service guidelines for RehabifyHealth platform"
        url="https://rehabifyhealth.com/terms-and-conditions"
      />
      
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-6">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
            <h1 className="text-4xl font-bold text-[#005b57] mb-4">Terms and Conditions</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-gray-600">
              <p><strong>Effective Date:</strong> October 2, 2025</p>
              <span className="hidden sm:block">•</span>
              <p><strong>Contact:</strong> <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline">rehabify.app@gmail.com</a></p>
            </div>
            
            {/* Download Option */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <a 
                href="/docs/Rehabify Health – Terms and Conditions of Use 2_10_25.docx"
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
                Welcome to <strong>Rehabify Health</strong> ("Rehabify," "we," "our," or "us"). Rehabify is a comprehensive digital platform designed to connect clinics, physiotherapists, patients, and healthcare partners across Africa. Our platform facilitates seamless access to physiotherapy services through innovative technology, including appointment scheduling, patient management, secure communication, and AI-powered tools.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                By accessing or using our services, you agree to comply with and be bound by these Terms and Conditions. If you do not agree, please discontinue use of the platform immediately.
              </p>
            </section>

            <section id="scope" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">2. Scope of Services</h2>
              <p className="text-gray-700 leading-relaxed mb-4">Rehabify provides the following services:</p>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Clinics</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Patient management and appointment scheduling</li>
                <li>Staff management and billing tools</li>
                <li>Analytics and reporting dashboards</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Physiotherapists</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Profile creation and verification</li>
                <li>Appointment and session management</li>
                <li>Treatment planning and exercise prescription</li>
                <li>AI-powered tools for assessments</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Patients</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Search and book verified physiotherapists</li>
                <li>Access treatment plans and exercise programs</li>
                <li>Secure video calls and messaging</li>
                <li>Payment processing and invoicing</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Partners</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>API integration for third-party platforms</li>
                <li>Referral and collaboration tools</li>
              </ul>
            </section>

            <section id="eligibility" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">3. Eligibility</h2>
              
              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Physiotherapists and Clinics</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Must hold valid professional licenses</li>
                <li>Must provide accurate verification documents</li>
                <li>Must comply with local healthcare regulations</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Patients</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Must be 18+ years or have guardian consent</li>
                <li>Must provide accurate medical information</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Partners</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Must have a legitimate business purpose</li>
                <li>Must comply with data protection standards</li>
              </ul>
            </section>

            <section id="accounts" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">4. User Accounts</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Registration:</strong> Users must create accounts with accurate information</li>
                <li><strong>Security:</strong> You are responsible for maintaining account confidentiality</li>
                <li><strong>Verification:</strong> Healthcare providers must complete identity and license verification</li>
                <li><strong>Suspension:</strong> We reserve the right to suspend accounts for violations</li>
              </ul>
            </section>

            <section id="platform-use" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">5. Platform Use Rules</h2>
              <p className="text-gray-700 leading-relaxed mb-4">Users must not:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Use the platform for unlawful purposes</li>
                <li>Share false or misleading information</li>
                <li>Harass, abuse, or harm other users</li>
                <li>Attempt to access unauthorized areas or data</li>
                <li>Engage in fraudulent activities or payment manipulation</li>
                <li>Use automated tools to scrape or extract data</li>
              </ul>
            </section>

            <section id="data-privacy" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">6. Patient Data & Privacy</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Rehabify collects and processes data as described in our <Link href="/privacy-policy" className="text-[#005b57] hover:underline">Privacy Policy</Link></li>
                <li>Healthcare providers must handle patient data in compliance with applicable laws</li>
                <li>Data is encrypted and stored securely</li>
                <li>Patients have rights to access, correct, or delete their data</li>
              </ul>
            </section>

            <section id="billing" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">7. Billing & Payments</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Payment Processing:</strong> All payments are processed through Paystack</li>
                <li><strong>Platform Fee:</strong> ₦1,000 per transaction</li>
                <li><strong>Processing Fee:</strong> 1.5% + ₦100 (capped at ₦2,000 for transactions over ₦100,000)</li>
                <li><strong>Payouts:</strong> Within 48 hours to 2 weeks after payment confirmation</li>
                <li><strong>Refunds:</strong> See our <Link href="/payment-policy" className="text-[#005b57] hover:underline">Payment Policy</Link> for details</li>
              </ul>
            </section>

            <section id="verification" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">8. Verification & Badges</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Verified providers receive a badge indicating their credentials have been confirmed. Verification requirements include:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Valid professional licenses</li>
                <li>Identity verification</li>
                <li>Proof of qualifications</li>
                <li>Compliance with platform standards</li>
              </ul>
            </section>

            <section id="referrals" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">9. Referrals & Partnerships</h2>
              <p className="text-gray-700 leading-relaxed">
                Rehabify may integrate with third-party platforms for referrals and collaborations. Partners must comply with our data protection and quality standards.
              </p>
            </section>

            <section id="communications" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">10. Communications</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Secure chat and video call features are provided for healthcare communications</li>
                <li>Users must maintain professional and respectful communications</li>
                <li>Recording calls without consent is prohibited</li>
                <li>Platform communications may be monitored for quality and safety</li>
              </ul>
            </section>

            <section id="intellectual-property" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">11. Intellectual Property</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Rehabify owns all platform content, code, and branding</li>
                <li>Users retain ownership of their uploaded content</li>
                <li>By uploading content, users grant Rehabify a license to use it for platform operations</li>
                <li>Unauthorized use of Rehabify's intellectual property is prohibited</li>
              </ul>
            </section>

            <section id="liability" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">12. Limitation of Liability</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                <strong>Important:</strong> Rehabify is a technology platform that facilitates connections between healthcare providers and patients. We are not a healthcare provider and do not provide medical advice, diagnosis, or treatment.
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Healthcare providers are solely responsible for the care they provide</li>
                <li>Rehabify is not liable for medical outcomes or provider-patient disputes</li>
                <li>Use of the platform is at your own risk</li>
                <li>We do not guarantee service availability or error-free operation</li>
              </ul>
            </section>

            <section id="indemnification" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">13. Indemnification</h2>
              <p className="text-gray-700 leading-relaxed">
                Users agree to indemnify and hold Rehabify harmless from any claims, damages, or losses arising from:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Violation of these Terms and Conditions</li>
                <li>Misuse of the platform</li>
                <li>Healthcare services provided or received</li>
                <li>Data breaches caused by user negligence</li>
              </ul>
            </section>

            <section id="modifications" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">14. Service Modifications & Termination</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Rehabify reserves the right to modify, suspend, or discontinue services</li>
                <li>We will notify users of significant changes</li>
                <li>Users may terminate their accounts at any time</li>
                <li>We may terminate accounts for violations of these terms</li>
              </ul>
            </section>

            <section id="governing-law" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">15. Governing Law & Dispute Resolution</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Governing Law:</strong> These terms are governed by Nigerian law</li>
                <li><strong>Arbitration:</strong> Disputes will be resolved through arbitration in Lagos, Nigeria</li>
                <li><strong>Jurisdiction:</strong> Nigerian courts have exclusive jurisdiction</li>
              </ul>
            </section>

            <section id="contact" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">16. Contact Information</h2>
              <p className="text-gray-700 leading-relaxed">
                For questions or concerns about these Terms and Conditions, please contact us:
              </p>
              <div className="mt-4 p-6 bg-gray-50 rounded-lg">
                <p className="text-gray-700">
                  <strong>Email:</strong> <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline">rehabify.app@gmail.com</a>
                </p>
                <p className="text-gray-700 mt-2">
                  <strong>Platform:</strong> <a href="https://rehabifyhealth.com" className="text-[#005b57] hover:underline">https://rehabifyhealth.com</a>
                </p>
              </div>
            </section>

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
