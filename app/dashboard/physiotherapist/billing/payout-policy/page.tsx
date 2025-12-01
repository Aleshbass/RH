'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, CreditCard, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PayoutPolicyPage() {
    const router = useRouter();

    return (
        <div className="space-y-6 pb-10 max-w-4xl mx-auto">
            <Button
                variant="ghost"
                onClick={() => router.back()}
                className="mb-4 pl-0 hover:bg-transparent hover:text-blue-600"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Settings
            </Button>

            <div>
                <h1 className="text-3xl font-bold text-gray-900">Payout Policy & Schedule</h1>
                <p className="text-gray-600 mt-2">Understanding how and when you get paid.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader>
                        <Clock className="h-8 w-8 text-blue-600 mb-2" />
                        <CardTitle className="text-lg">Timing</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-600">
                            Payouts are processed automatically <strong>24 hours</strong> after you mark an appointment as completed.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CreditCard className="h-8 w-8 text-green-600 mb-2" />
                        <CardTitle className="text-lg">Method</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-600">
                            Funds are disbursed directly to your connected bank account via our secure payment partner, Paystack.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <ShieldCheck className="h-8 w-8 text-purple-600 mb-2" />
                        <CardTitle className="text-lg">Security</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-gray-600">
                            Your banking details are encrypted and handled securely. We never store your sensitive banking credentials directly.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Detailed Payout Schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-900">1. Appointment Completion</h3>
                        <p className="text-gray-600">
                            The payout process begins immediately after you successfully complete a session and mark it as "Completed" in your dashboard.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-900">2. Processing Period (T+1)</h3>
                        <p className="text-gray-600">
                            There is a standard 24-hour processing period. This allows for any necessary dispute resolution or administrative checks.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-900">3. Disbursement</h3>
                        <p className="text-gray-600">
                            After the processing period, the funds (minus the platform fee) are automatically transferred to your designated bank account. Depending on your bank, this may take a few minutes to a few hours to reflect.
                        </p>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg mt-4">
                        <h4 className="font-semibold text-blue-900 mb-1">Important Note</h4>
                        <p className="text-sm text-blue-800">
                            Please ensure your bank account details are always up to date in your Settings to avoid any delays in receiving your payments.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
