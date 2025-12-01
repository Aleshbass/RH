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
            <h1 className="text-4xl font-bold text-[#005b57] mb-4">Privacy Policy</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-sm text-gray-600">
              <p><strong>Effective Date:</strong> October 2, 2025</p>
              <span className="hidden sm:block">•</span>
              <p><strong>Data Protection Officer:</strong> <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline">rehabify.app@gmail.com</a></p>
            </div>

            {/* Download Option */}
            <div className="mt-6">
              <a
                href="/docs/Rehabify Health – Privacy Policy 2_10_25.docx"
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
                At <strong>Rehabify Health</strong> ("Rehabify," "we," "our," or "us"), we are committed to protecting the privacy and security of your personal and health information. This Privacy Policy explains how we collect, use, store, and share your data when you use our platform.
              </p>
              <p className="text-gray-700 leading-relaxed mt-4">
                By using Rehabify, you consent to the practices described in this policy. If you do not agree, please discontinue use of our services.
              </p>
            </section>

            <section id="data-collection" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">2. Data We Collect</h2>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Patients</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Personal Information:</strong> Name, email, phone number, date of birth, address</li>
                <li><strong>Health Information:</strong> Medical history, treatment records, exercise progress, pain levels</li>
                <li><strong>Payment Information:</strong> Billing details (processed securely through Paystack)</li>
                <li><strong>Usage Data:</strong> Appointment history, communication logs, platform interactions</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For Physiotherapists & Clinics</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Professional Information:</strong> Licenses, qualifications, certifications, specializations</li>
                <li><strong>Business Details:</strong> Clinic information, staff data, service offerings</li>
                <li><strong>Verification Documents:</strong> ID proof, professional credentials</li>
                <li><strong>Financial Information:</strong> Bank account details for payouts</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">For All Users</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Device Information:</strong> IP address, browser type, device ID</li>
                <li><strong>Cookies & Analytics:</strong> Usage patterns, session data, preferences</li>
                <li><strong>Communications:</strong> Chat messages, video call metadata, email correspondence</li>
              </ul>
            </section>

            <section id="data-usage" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">3. How We Use Your Data</h2>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Service Delivery</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Facilitate appointments and treatment sessions</li>
                <li>Enable secure communication between users</li>
                <li>Provide access to treatment plans and exercise programs</li>
                <li>Generate invoices and process payments</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Verification & Compliance</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Verify professional credentials</li>
                <li>Ensure platform safety and quality</li>
                <li>Comply with legal and regulatory requirements</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Platform Improvement</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Analyze usage patterns to enhance features</li>
                <li>Develop AI-powered tools and recommendations</li>
                <li>Improve user experience and platform performance</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Research & Development</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li>Conduct anonymized research to advance physiotherapy practices</li>
                <li>Generate aggregated insights and statistics</li>
                <li>Develop new healthcare solutions</li>
              </ul>
            </section>

            <section id="legal-basis" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">4. Legal Basis for Processing</h2>
              <p className="text-gray-700 leading-relaxed mb-4">We process your data based on:</p>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Consent:</strong> You explicitly agree to data collection and use</li>
                <li><strong>Contractual Necessity:</strong> Required to provide our services</li>
                <li><strong>Legal Obligations:</strong> Compliance with healthcare regulations</li>
                <li><strong>Legitimate Interest:</strong> Platform security, fraud prevention, and improvements</li>
              </ul>
            </section>

            <section id="data-sharing" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">5. Data Sharing & Disclosure</h2>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">With Care Providers</h3>
              <p className="text-gray-700 leading-relaxed">
                Patient health information is shared with assigned physiotherapists and clinics for treatment purposes.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">With Partners</h3>
              <p className="text-gray-700 leading-relaxed">
                Limited data may be shared with integrated third-party platforms (e.g., referral partners) with your consent.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">With Regulators</h3>
              <p className="text-gray-700 leading-relaxed">
                We may disclose information to comply with legal requirements or regulatory requests.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">With Service Providers</h3>
              <p className="text-gray-700 leading-relaxed">
                We work with trusted providers for payment processing (Paystack), cloud storage, and analytics. These providers are bound by confidentiality agreements.
              </p>

              <div className="mt-6 p-4 bg-green-50 border-l-4 border-green-500 rounded">
                <p className="text-green-900 font-semibold">
                  <strong>We never sell your data.</strong> Your information is not sold to third parties for marketing or advertising purposes.
                </p>
              </div>
            </section>

            <section id="data-storage" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">6. Data Storage & Security</h2>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Storage Location</h3>
              <p className="text-gray-700 leading-relaxed">
                Data is stored securely in cloud infrastructure with industry-leading security standards.
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Security Measures</h3>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Encryption:</strong> Data is encrypted in transit (SSL/TLS) and at rest</li>
                <li><strong>Access Controls:</strong> Role-based access with multi-factor authentication</li>
                <li><strong>Regular Audits:</strong> Security assessments and vulnerability testing</li>
                <li><strong>Monitoring:</strong> 24/7 system monitoring for suspicious activity</li>
                <li><strong>Backups:</strong> Regular data backups for disaster recovery</li>
              </ul>
            </section>

            <section id="data-retention" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">7. Data Retention</h2>
              <ul className="list-disc pl-6 text-gray-700 space-y-2">
                <li><strong>Patient Records:</strong> Retained for 5 years after the last care interaction (as required by healthcare regulations)</li>
                <li><strong>Verification Documents:</strong> Retained while account is active and for compliance purposes</li>
                <li><strong>Financial Records:</strong> Retained for 7 years for tax and audit purposes</li>
                <li><strong>Communications:</strong> Retained as necessary for service delivery and dispute resolution</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Data may be anonymized for research purposes after the retention period.
              </p>
            </section>

            <section id="user-rights" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">8. Your Rights (NDPR Compliance)</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Under the Nigeria Data Protection Regulation (NDPR), you have the following rights:
              </p>

              <ul className="list-disc pl-6 text-gray-700 space-y-3">
                <li>
                  <strong>Right to Access:</strong> Request a copy of your personal data
                </li>
                <li>
                  <strong>Right to Correction:</strong> Update inaccurate or incomplete information
                </li>
                <li>
                  <strong>Right to Deletion:</strong> Request deletion of your data (subject to legal retention requirements)
                </li>
                <li>
                  <strong>Right to Withdraw Consent:</strong> Revoke consent for data processing at any time
                </li>
                <li>
                  <strong>Right to Data Portability:</strong> Request your data in a machine-readable format
                </li>
                <li>
                  <strong>Right to Object:</strong> Object to certain types of data processing
                </li>
                <li>
                  <strong>Right to Complain:</strong> File a complaint with the Nigeria Data Protection Bureau (NDPB)
                </li>
              </ul>

              <p className="text-gray-700 leading-relaxed mt-6">
                To exercise these rights, contact our Data Protection Officer at{' '}
                <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline font-semibold">
                  rehabify.app@gmail.com
                </a>
              </p>
            </section>

            <section id="children" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">9. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Rehabify is not intended for children under 18 without parental or guardian consent. If you are a minor, you must have your parent or guardian create and manage your account. We do not knowingly collect data from children without appropriate consent.
              </p>
            </section>

            <section id="third-party" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">10. Third-Party Links & Services</h2>
              <p className="text-gray-700 leading-relaxed">
                Our platform may contain links to third-party websites or services (e.g., payment gateways, exercise databases). We are not responsible for the privacy practices of these external platforms. Please review their privacy policies before sharing your information.
              </p>
            </section>

            <section id="policy-changes" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">11. Changes to This Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy to reflect changes in our practices or legal requirements. Significant changes will be communicated via email or platform notifications. Continued use of Rehabify after updates constitutes acceptance of the revised policy.
              </p>
            </section>

            <section id="contact" className="mb-8">
              <h2 className="text-2xl font-bold text-[#005b57] mb-4">12. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                For questions, concerns, or requests regarding your privacy or data:
              </p>
              <div className="mt-4 p-6 bg-gray-50 rounded-lg">
                <p className="text-gray-700">
                  <strong>Data Protection Officer</strong>
                </p>
                <p className="text-gray-700 mt-2">
                  <strong>Email:</strong> <a href="mailto:rehabify.app@gmail.com" className="text-[#005b57] hover:underline">rehabify.app@gmail.com</a>
                </p>
                <p className="text-gray-700 mt-2">
                  <strong>Platform:</strong> <a href="https://rehabifyhealth.com" className="text-[#005b57] hover:underline">https://rehabifyhealth.com</a>
                </p>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                <p className="text-blue-900">
                  <strong>Nigeria Data Protection Bureau (NDPB)</strong><br />
                  If you wish to file a complaint about our data practices, you may contact the NDPB through their official channels.
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
