import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Check } from 'lucide-react';

export const metadata: Metadata = {
    title: 'Payout Policy | Rehabify Health',
    description: 'Understand how and when physiotherapists receive their earnings on Rehabify Health platform.',
};

export default function PayoutPolicyPage() {
    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            {/* Header */}
            <header className="border-b border-gray-200 bg-white">
                <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                    <Link href="/" className="inline-flex lg:hidden items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                        <ArrowLeft className="h-4 w-4" />
                        Back to Home
                    </Link>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
                {/* Title Section */}
                <div className="mb-12">
                    <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                        Payout Policy
                    </h1>
                    <p className="mt-4 text-lg text-gray-600">
                        Clear, transparent, and timely payments for healthcare providers on Rehabify Health.
                    </p>
                </div>

                {/* Key Highlights */}
                <div className="mb-12 grid gap-6 sm:grid-cols-3">
                    <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 text-3xl font-bold text-gray-900">24h</div>
                        <div className="text-sm font-medium text-gray-600">Processing Time</div>
                        <div className="mt-2 text-xs text-gray-500">After appointment completion</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 text-3xl font-bold text-gray-900">100%</div>
                        <div className="text-sm font-medium text-gray-600">Your Earnings</div>
                        <div className="mt-2 text-xs text-gray-500">No hidden deductions</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 text-3xl font-bold text-gray-900">Secure</div>
                        <div className="text-sm font-medium text-gray-600">Direct Transfer</div>
                        <div className="mt-2 text-xs text-gray-500">Via Paystack</div>
                    </div>
                </div>

                {/* Content Sections */}
                <div className="space-y-12">
                    {/* How It Works */}
                    <section>
                        <h2 className="mb-6 text-2xl font-bold text-gray-900">How Payouts Work</h2>
                        <div className="space-y-4">
                            <div className="flex gap-4 rounded-lg border border-gray-200 bg-white p-6">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                                    1
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Complete Your Session</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Mark your appointment as completed in your dashboard after providing treatment.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4 rounded-lg border border-gray-200 bg-white p-6">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                                    2
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Automatic Processing</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Your payout is automatically queued for processing within 24 hours.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4 rounded-lg border border-gray-200 bg-white p-6">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                                    3
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Receive Payment</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Funds are transferred directly to your connected bank account.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Fee Structure */}
                    <section>
                        <h2 className="mb-6 text-2xl font-bold text-gray-900">Fee Structure</h2>
                        <div className="rounded-lg border border-gray-200 bg-white p-6">
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900">Platform Fee</h3>
                                <p className="mt-2 text-sm text-gray-600">
                                    Rehabify charges a flat platform fee of <strong>₦1,000</strong> per transaction. This fee is automatically added to the patient's payment and does not affect your earnings.
                                </p>
                            </div>
                            <div className="rounded-lg bg-gray-50 p-4">
                                <h4 className="mb-3 text-sm font-semibold text-gray-700">Example Breakdown</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Your Session Rate</span>
                                        <span className="font-medium text-gray-900">₦20,000</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Platform Fee (paid by patient)</span>
                                        <span className="font-medium text-gray-900">₦1,000</span>
                                    </div>
                                    <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                                        <span className="text-gray-900">You Receive</span>
                                        <span className="text-green-700">₦20,000</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Requirements */}
                    <section>
                        <h2 className="mb-6 text-2xl font-bold text-gray-900">Payout Requirements</h2>
                        <div className="rounded-lg border border-gray-200 bg-white p-6">
                            <ul className="space-y-3">
                                <li className="flex gap-3">
                                    <Check className="h-5 w-5 shrink-0 text-green-600" />
                                    <span className="text-sm text-gray-600">Valid Nigerian bank account linked to your profile</span>
                                </li>
                                <li className="flex gap-3">
                                    <Check className="h-5 w-5 shrink-0 text-green-600" />
                                    <span className="text-sm text-gray-600">Completed identity and professional license verification</span>
                                </li>
                                <li className="flex gap-3">
                                    <Check className="h-5 w-5 shrink-0 text-green-600" />
                                    <span className="text-sm text-gray-600">Minimum payout threshold: ₦1,000</span>
                                </li>
                                <li className="flex gap-3">
                                    <Check className="h-5 w-5 shrink-0 text-green-600" />
                                    <span className="text-sm text-gray-600">Appointment marked as completed with documentation</span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    {/* Security */}
                    <section>
                        <h2 className="mb-6 text-2xl font-bold text-gray-900">Security & Privacy</h2>
                        <div className="rounded-lg border border-gray-200 bg-white p-6">
                            <p className="text-sm text-gray-600">
                                All payments are processed through <strong>Paystack</strong>, a PCI DSS compliant payment gateway. Your banking details are encrypted and securely stored. Rehabify never has direct access to your full bank account information.
                            </p>
                            <p className="mt-4 text-sm text-gray-600">
                                You'll receive email notifications for every payout transaction, keeping you informed at every step of the process.
                            </p>
                        </div>
                    </section>

                    {/* Support */}
                    <section>
                        <h2 className="mb-6 text-2xl font-bold text-gray-900">Questions?</h2>
                        <div className="rounded-lg border border-gray-200 bg-white p-6">
                            <p className="text-sm text-gray-600">
                                If you have any questions about payouts or need assistance, our support team is here to help.
                            </p>
                            <div className="mt-4">
                                <a
                                    href="mailto:rehabify.app@gmail.com"
                                    className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700"
                                >
                                    Contact Support →
                                </a>
                            </div>
                        </div>
                    </section>
                </div>

                {/* CTA */}
                <div className="mt-16 rounded-lg border border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-8 text-center">
                    <h2 className="text-2xl font-bold text-gray-900">Ready to Join Rehabify?</h2>
                    <p className="mt-2 text-gray-600">
                        Start receiving timely payments for your physiotherapy services.
                    </p>
                    <div className="mt-6">
                        <Link
                            href="/sign-up"
                            className="inline-flex items-center justify-center rounded-lg bg-[#005b57] px-6 py-3 text-sm font-semibold text-white hover:bg-[#004a47] transition-colors"
                        >
                            Get Started Today
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
}
