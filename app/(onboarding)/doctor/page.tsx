'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export default function DoctorOnboardingPage() {
    const router = useRouter();
    const { data: storeData, updateDoctorData, completeOnboarding } = useOnboardingStore();
    const { doctorData } = storeData;
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [banks, setBanks] = useState<{name: string, code: string}[]>([]);
    const [bankCode, setBankCode] = useState('');
    const [isResolving, setIsResolving] = useState(false);
    const [resolveError, setResolveError] = useState('');

    useEffect(() => {
        fetch('/api/paystack/banks')
            .then(res => res.json())
            .then(data => {
                if (data.status) setBanks(data.data);
            })
            .catch(err => console.error("Failed to load banks", err));
    }, []);

    useEffect(() => {
        if (doctorData?.accountNumber?.length === 10 && bankCode) {
            setIsResolving(true);
            setResolveError('');
            fetch(`/api/paystack/resolve-account?account_number=${doctorData.accountNumber}&bank_code=${bankCode}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status) {
                        updateDoctorData({ accountName: data.data.account_name });
                        setResolveError('');
                    } else {
                        updateDoctorData({ accountName: '' });
                        setResolveError(data.message || 'Could not resolve account');
                    }
                })
                .catch(err => {
                    updateDoctorData({ accountName: '' });
                    setResolveError('Failed to resolve account');
                })
                .finally(() => setIsResolving(false));
        }
    }, [doctorData?.accountNumber, bankCode, updateDoctorData]);

    const setupDoctorProfile = useMutation(api.doctors.setupDoctorProfile);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            setIsSubmitting(true);

            // Call convex mutation
            await setupDoctorProfile({
                title: doctorData.title,
                medicalLicenseNumber: doctorData.medicalLicenseNumber,
                specialty: doctorData.specialty,
                hospitalAffiliation: doctorData.hospitalAffiliation,
                bio: doctorData.bio,
                bankName: doctorData.bankName,
                accountNumber: doctorData.accountNumber,
                accountName: doctorData.accountName,
            });

            // Update local store state
            completeOnboarding();

            toast.success("Profile setup complete!");

            // Redirect to dashboard
            router.push('/dashboard');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'An unexpected error occurred';
            console.error("Failed to setup doctor profile:", message);
            toast.error(message || "Failed to save profile. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        updateDoctorData({ [name]: value });
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
            <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8">
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold text-gray-900">Partner Profile Setup</h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Complete your profile to start referring patients and tracking your referral commissions.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                                Title
                            </label>
                            <Input
                                id="title"
                                name="title"
                                value={doctorData?.title || ''}
                                onChange={handleChange}
                                placeholder="e.g., Dr., Prof."
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <label htmlFor="specialty" className="block text-sm font-medium text-gray-700">
                                Specialty
                            </label>
                            <Input
                                id="specialty"
                                name="specialty"
                                value={doctorData?.specialty || ''}
                                onChange={handleChange}
                                placeholder="e.g., Orthopedic Surgeon"
                                required
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <label htmlFor="medicalLicenseNumber" className="block text-sm font-medium text-gray-700">
                                Medical License Number
                            </label>
                            <Input
                                id="medicalLicenseNumber"
                                name="medicalLicenseNumber"
                                value={doctorData?.medicalLicenseNumber || ''}
                                onChange={handleChange}
                                placeholder="MDCN-12345"
                                className="mt-1"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label htmlFor="hospitalAffiliation" className="block text-sm font-medium text-gray-700">
                                Primary Hospital Affiliation
                            </label>
                            <Input
                                id="hospitalAffiliation"
                                name="hospitalAffiliation"
                                value={doctorData?.hospitalAffiliation || ''}
                                onChange={handleChange}
                                placeholder="Where do you practice?"
                                required
                                className="mt-1"
                            />
                        </div>

                        <div className="sm:col-span-2">
                            <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                                Professional Bio
                            </label>
                            <Textarea
                                id="bio"
                                name="bio"
                                value={doctorData?.bio || ''}
                                onChange={handleChange}
                                rows={3}
                                placeholder="Brief summary of your practice and expertise"
                                className="mt-1"
                            />
                        </div>
                    </div>

                    <div className="pt-6 border-t border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Payout Details</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            We need your bank details to process your referral commissions.
                        </p>
                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <label htmlFor="bankCode" className="block text-sm font-medium text-gray-700">
                                    Bank Name
                                </label>
                                <select
                                    id="bankCode"
                                    value={bankCode}
                                    onChange={(e) => {
                                        setBankCode(e.target.value);
                                        const selectedBank = banks.find(b => b.code === e.target.value);
                                        if (selectedBank) {
                                            updateDoctorData({ bankName: selectedBank.name });
                                        }
                                    }}
                                    required
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#005b57] focus:ring focus:ring-[#005b57] focus:ring-opacity-50 py-2 px-3 border bg-white"
                                >
                                    <option value="" disabled>Select your bank</option>
                                    {banks.map(bank => (
                                        <option key={bank.code} value={bank.code}>{bank.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="accountNumber" className="block text-sm font-medium text-gray-700">
                                    Account Number
                                </label>
                                <div className="relative">
                                    <Input
                                        id="accountNumber"
                                        name="accountNumber"
                                        value={doctorData?.accountNumber || ''}
                                        onChange={handleChange}
                                        placeholder="0123456789"
                                        required
                                        maxLength={10}
                                        className="mt-1"
                                    />
                                    {isResolving && (
                                        <div className="absolute right-3 top-3">
                                            <Loader2 className="w-4 h-4 animate-spin text-[#005b57]" />
                                        </div>
                                    )}
                                </div>
                                {resolveError && <p className="mt-1 text-xs text-red-500">{resolveError}</p>}
                            </div>
                            <div>
                                <label htmlFor="accountName" className="block text-sm font-medium text-gray-700">
                                    Account Name
                                </label>
                                <Input
                                    id="accountName"
                                    name="accountName"
                                    value={doctorData?.accountName || ''}
                                    readOnly
                                    placeholder="Auto-filled from account number"
                                    required
                                    className="mt-1 bg-gray-50 text-gray-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 flex justify-end">
                        <Button
                            type="submit"
                            disabled={isSubmitting || !doctorData?.accountName || !!resolveError}
                            className="w-full sm:w-auto px-8 bg-[#005b57] hover:bg-[#004a46] text-white transition-colors"
                        >
                            {isSubmitting ? "Saving..." : "Complete Setup"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
