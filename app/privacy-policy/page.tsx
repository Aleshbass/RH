import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MedicalWebPageSchema } from '@/components/seo/StructuredData';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Rehabify Health Privacy Policy - How we collect, use, and protect your health data. NDPR compliant healthcare platform with robust data security.',
  keywords: ['privacy policy', 'rehabify health', 'data protection', 'NDPR compliance', 'healthcare privacy', 'patient data security'],
  openGraph: {
    title: 'Privacy Policy | Rehabify Health',
    description: 'Learn how RehabifyHealth protects your personal and health information.',
    type: 'website',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <MedicalWebPageSchema
        title="Privacy Policy - Rehabify Health"
        description="Our commitment to protecting your health data and personal information"
        url="https://rehabifyhealth.com/privacy-policy"
      />

      <div className="min-h-screen bg-gray-50">
        {/* Breadcrumb Header */}
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Link href="/" className="inline-flex lg:hidden items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-6 py-12">
          {/* Header */}
          <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
            <h1 className="text-4xl font-bold text-[#005b57] mb-4">Rehabify Health – Privacy Policy</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-gray-600">
              <p><strong>Effective Date:</strong> 10 January 2026</p>
            </div>
          </div>

          {/* Content */}
          <div className="bg-white rounded-lg shadow-sm p-8 prose prose-lg max-w-none">

            <section id="introduction" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                Rehabify Health ("Rehabify", "we", "our", "us") is committed to protecting the privacy and confidentiality of all users who interact with our digital health platform, including clinics, physiotherapists, patients, and partners.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                This Privacy Policy explains how we collect, use, store, and protect your personal information when you access our website, mobile applications, or related services (collectively, the "Platform"). By using Rehabify, you consent to the practices described in this Policy.
              </p>
            </section>

            <section id="data-collection" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">2. Data We Collect</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We collect different categories of information depending on your role:
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">a) For Patients</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Personal details: name, date of birth, gender, contact information.</li>
                <li>Medical documents you upload (e.g., scans, prescriptions).</li>
                <li>Treatment plans, assigned exercises, and progress logs.</li>
                <li>Billing and payment information (processed securely through Paystack).</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">b) For Physiotherapists</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Professional details: name, license number, years of practice, specialties.</li>
                <li>Verification documents (license, tax certificate, insurance proof, etc.).</li>
                <li>Clinical notes, exercise prescriptions, and patient communication logs.</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">c) For Clinics</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Facility details: registration number, contact details, and location.</li>
                <li>Staff details for assigned physiotherapists.</li>
                <li>Uploaded business documents (licenses, tax documents).</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">d) For All Users</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Device information: browser type, operating system, and IP address.</li>
                <li>Usage data: login times, features accessed, errors encountered.</li>
                <li>Communication data: messages, calls, notifications.</li>
              </ul>
            </section>

            <section id="data-usage" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">3. How We Use Your Data</h2>
              <p className="text-gray-700 leading-relaxed mb-4">We use the collected information to:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Provide access to the Platform and its features.</li>
                <li>Enable secure communication between patients and physiotherapists.</li>
                <li>Process billing, payments, and payouts.</li>
                <li>Verify the credentials of physiotherapists and clinics.</li>
                <li>Track treatment progress and generate reports.</li>
                <li>Improve platform functionality, security, and user experience.</li>
                <li>Generate anonymized, aggregated insights to support healthcare research and system improvements.</li>
              </ul>
            </section>

            <section id="legal-basis" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">4. Legal Basis for Processing</h2>
              <p className="text-gray-700 leading-relaxed mb-4">We process personal data under the following legal grounds:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Consent</strong> – when patients upload documents or share personal information.</li>
                <li><strong>Contractual necessity</strong> – to deliver the services users sign up for.</li>
                <li><strong>Legal obligations</strong> – compliance with NDPR, taxation, or regulatory requirements.</li>
                <li><strong>Legitimate interest</strong> – improving platform safety, preventing fraud, and conducting research.</li>
              </ul>
            </section>

            <section id="data-sharing" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">5. Data Sharing & Disclosure</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                We do not sell or rent user data. However, data may be shared in the following cases:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Physiotherapists and clinics: to provide care and treatment to patients.</li>
                <li>Patients: to receive progress updates and treatment information from physiotherapists.</li>
                <li>With partners – only where referrals are made, with user consent.</li>
                <li>With regulators – if required by Nigerian law or court orders.</li>
                <li>With service providers – payment processors, hosting providers, analytics tools (bound by confidentiality obligations).</li>
              </ul>

              <div className="mt-6 p-4 bg-green-50 border-l-4 border-green-500 rounded">
                <p className="text-green-900 font-semibold">
                  <strong>We never sell your data.</strong> Your information is not sold to third parties for marketing or advertising purposes.
                </p>
              </div>
            </section>

            <section id="data-storage" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">6. Data Storage & Security</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>All data is stored securely on cloud servers with 99.9% uptime.</li>
                <li>Encryption is applied to sensitive health and payment data in transit and at rest.</li>
                <li>Access is role-based, ensuring only authorized users (e.g., assigned physiotherapist) can view specific patient records.</li>
                <li>Regular security audits and penetration testing are conducted.</li>
              </ul>
            </section>

            <section id="data-retention" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">7. Data Retention</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Patient records are retained for the duration of care plus 5 years in compliance with medical record standards.</li>
                <li>Physiotherapist/clinic verification documents are retained as long as the accounts remain active.</li>
                <li>Users may request account deletion; however, some data may be retained for regulatory compliance purposes.</li>
              </ul>
            </section>

            <section id="user-rights" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">8. User Rights</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Under NDPR (and GDPR-style protection for future expansion), you have the right to:
              </p>
              <ul className="list-disc pl-6 text-gray-700 space-y-3">
                <li>Access the personal data we hold about you.</li>
                <li>Correct inaccuracies in your personal data.</li>
                <li>Request deletion of your personal data ("right to be forgotten").</li>
                <li>Withdraw consent at any time.</li>
                <li>Request a copy of your data in a portable format.</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-6">
                Requests can be made via email to{' '}
                <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline font-semibold">
                  rehabify.app@gmail.com
                </a>
              </p>
            </section>

            <section id="children" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">9. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Rehabify does not knowingly collect data from individuals under 18 without the consent of their guardian. Parents or guardians are responsible for supervising child accounts.
              </p>
            </section>

            <section id="third-party" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">10. Third-Party Links & Services</h2>
              <p className="text-gray-700 leading-relaxed">
                Rehabify may contain links to third-party platforms (e.g., referral partners). This Privacy Policy does not cover those platforms, and we are not responsible for their practices.
              </p>
            </section>

            <section id="policy-changes" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">11. Changes to This Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We reserve the right to update this Privacy Policy from time to time. Updates will be communicated via email or platform notification, and continued use of the Platform indicates acceptance.
              </p>
            </section>

            <section id="contact" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">12. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                For privacy-related inquiries or complaints, please contact:
              </p>
              <div className="mt-4 p-6 bg-gray-50 rounded-lg">
                <p className="text-gray-700">
                  <strong>Rehabify Health – Data Protection Officer</strong>
                </p>
                <p className="text-gray-700 mt-2">
                  <strong>Email:</strong> <a href="mailto:support@rehabifyhealth.com" className="text-[#005b57] hover:underline">support@rehabifyhealth.com</a>
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
