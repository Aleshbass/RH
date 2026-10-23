import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Check } from '@/components/icons';

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
                        <div className="mb-2 text-3xl font-bold text-gray-900">Fixed</div>
                        <div className="text-sm font-medium text-gray-600">Payout per Session</div>
                        <div className="mt-2 text-xs text-gray-500">Set out in your payout schedule</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 text-3xl font-bold text-gray-900">Protected</div>
                        <div className="text-sm font-medium text-gray-600">Patients Pay Upfront</div>
                        <div className="mt-2 text-xs text-gray-500">Every booking is paid before it&apos;s confirmed</div>
                    </div>
                    <div className="rounded-lg border border-gray-200 bg-white p-6">
                        <div className="mb-2 text-3xl font-bold text-gray-900">Secure</div>
                        <div className="text-sm font-medium text-gray-600">Bank Transfer</div>
                        <div className="mt-2 text-xs text-gray-500">To your payout account</div>
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
                                    <h3 className="font-semibold text-gray-900">The Patient Pays Rehabify</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        The patient pays Rehabify&apos;s standard, all-inclusive price through Paystack when they book. The booking is confirmed once the payment is verified, and Rehabify holds the payment.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4 rounded-lg border border-gray-200 bg-white p-6">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                                    2
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">You Complete the Session</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Once the session is marked as completed, your payout for it is added to your earnings in your dashboard.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4 rounded-lg border border-gray-200 bg-white p-6">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                                    3
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Rehabify Pays You</h3>
                                    <p className="mt-1 text-sm text-gray-600">
                                        Rehabify transfers your payout to your payout account (a Nigerian bank account), and you can follow each payout&apos;s status in your dashboard.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* What You Earn */}
                    <section>
                        <h2 className="mb-6 text-2xl font-bold text-gray-900">What You Earn</h2>
                        <div className="rounded-lg border border-gray-200 bg-white p-6">
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-900">A Fixed Payout for Each Service</h3>
                                <p className="mt-2 text-sm text-gray-600">
                                    Rehabify sets one standard price for each service, the same for every patient, and a fixed payout to you for each session you complete. Your payout schedule lists the current payout for every service and is always available in your dashboard under <Link href="/dashboard/physiotherapist/settings/fee-schedule" className="font-medium text-[#005b57] hover:underline">Settings › Fee schedule</Link>.
                                </p>
                            </div>
                            <div className="rounded-lg bg-gray-50 p-4">
                                <h4 className="mb-3 text-sm font-semibold text-gray-700">Good to Know</h4>
                                <ul className="space-y-2 text-sm text-gray-600">
                                    <li><strong>No deductions:</strong> Rehabify pays the Paystack processing fee. It is never taken from your payout.</li>
                                    <li><strong>Home visits:</strong> where a travel charge applies, you also receive your share of it for that travel zone.</li>
                                    <li><strong>Rehabify Access:</strong> if you opt in to assisted care, Access sessions pay the assisted payout in your schedule. You can set a minimum payout for each service, and you&apos;re only matched with Access patients where the payout meets it.</li>
                                    <li><strong>Changes:</strong> if the payout schedule changes, bookings already made keep the payout that applied when they were booked.</li>
                                </ul>
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
                                    <span className="text-sm text-gray-600">Your account approved by the Rehabify team, with your profile set up</span>
                                </li>
                                <li className="flex gap-3">
                                    <Check className="h-5 w-5 shrink-0 text-green-600" />
                                    <span className="text-sm text-gray-600">A valid Nigerian bank account added as your payout account</span>
                                </li>
                                <li className="flex gap-3">
                                    <Check className="h-5 w-5 shrink-0 text-green-600" />
                                    <span className="text-sm text-gray-600">The booking paid for by the patient</span>
                                </li>
                                <li className="flex gap-3">
                                    <Check className="h-5 w-5 shrink-0 text-green-600" />
                                    <span className="text-sm text-gray-600">The session marked as completed</span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    {/* Security */}
                    <section>
                        <h2 className="mb-6 text-2xl font-bold text-gray-900">Security & Privacy</h2>
                        <div className="rounded-lg border border-gray-200 bg-white p-6">
                            <p className="text-sm text-gray-600">
                                Patient payments are processed through <strong>Paystack</strong>, a PCI DSS compliant payment gateway. Your payout account details are used only to pay you.
                            </p>
                            <p className="mt-4 text-sm text-gray-600">
                                You can follow the status of every payout in your dashboard, and we&apos;ll let you know when a payout has been sent.
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
                            href="/sign-up?as=physiotherapist"
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
