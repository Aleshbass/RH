'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import { ArrowRight, Loader2, ShieldCheck, Stethoscope, UserPlus, Wallet } from '@/components/icons';
import { errorMessage, inputCls, labelCls } from '@/components/partners/portal/shared';

type DoctorProfile = {
    profile: {
        title?: string;
        specialty?: string;
        medicalLicenseNumber?: string;
        hospitalAffiliation?: string;
        bio?: string;
    } | null;
} | null;

const TITLES = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.'];

/**
 * Referring doctor sign-up: a short professional profile. Saving it creates the doctor's
 * referral account (a partner of type "doctor"), which an admin approves after checking the
 * licence. Everything after that happens in the partner portal.
 */
export default function DoctorOnboardingPage() {
    const router = useRouter();
    const { user } = useUser();
    const existing = useQuery(api.doctors.getMyDoctorProfile) as DoctorProfile | undefined;
    const setupDoctorProfile = useMutation(api.doctors.setupDoctorProfile);
    const [form, setForm] = useState({ title: 'Dr.', specialty: '', medicalLicenseNumber: '', hospitalAffiliation: '', bio: '' });
    const [prefilled, setPrefilled] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Someone coming back to update their details sees what they sent before
    useEffect(() => {
        if (prefilled || !existing?.profile) return;
        const p = existing.profile;
        setForm({
            title: p.title || 'Dr.',
            specialty: p.specialty ?? '',
            medicalLicenseNumber: p.medicalLicenseNumber ?? '',
            hospitalAffiliation: p.hospitalAffiliation ?? '',
            bio: p.bio ?? '',
        });
        setPrefilled(true);
    }, [existing, prefilled]);

    const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
    const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!form.medicalLicenseNumber.trim()) {
            setError('Enter your MDCN folio or licence number so we can verify you.');
            return;
        }
        setSubmitting(true);
        try {
            await setupDoctorProfile({
                title: form.title.trim() || undefined,
                specialty: form.specialty.trim() || undefined,
                medicalLicenseNumber: form.medicalLicenseNumber.trim(),
                hospitalAffiliation: form.hospitalAffiliation.trim() || undefined,
                bio: form.bio.trim() || undefined,
            });
            toast.success('Thanks. We\'re verifying your details.');
            router.replace('/partners/portal');
        } catch (err) {
            setError(errorMessage(err, 'We couldn\'t save your details. Please try again.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAF6E7] text-[#002e2c] px-4 py-10 sm:py-14">
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <Link href="/" aria-label="Rehabify home">
                        <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={120} height={32} className="h-7 w-auto" priority />
                    </Link>
                    <span className="text-xs font-semibold text-[#52706e]">Referring doctors</span>
                </div>

                <div className="bg-white rounded-3xl border border-[#002e2c]/10 p-6 sm:p-8 shadow-xs space-y-6">
                    <div className="space-y-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF6E7] border border-[#002e2c]/10 text-[11px] font-semibold uppercase tracking-wider text-[#52706e]">
                            <Stethoscope className="w-3.5 h-3.5" />
                            Step 1 of 1
                        </span>
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {name ? `Welcome, ${name}` : 'Set up your referral account'}
                        </h1>
                        <p className="text-sm text-[#52706e] leading-relaxed">
                            Tell us a little about your practice. We check your licence, then you can refer patients for physiotherapy and earn a
                            commission on their care.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className={labelCls} htmlFor="title">Title</label>
                                <select
                                    id="title"
                                    value={TITLES.includes(form.title) ? form.title : 'Dr.'}
                                    onChange={(e) => set('title', e.target.value)}
                                    className={inputCls}
                                >
                                    {TITLES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className={labelCls} htmlFor="specialty">Specialty</label>
                                <input
                                    id="specialty"
                                    required
                                    value={form.specialty}
                                    onChange={(e) => set('specialty', e.target.value)}
                                    placeholder="e.g. Orthopaedic surgery, General practice"
                                    className={inputCls}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={labelCls} htmlFor="licence">MDCN folio or licence number</label>
                            <input
                                id="licence"
                                required
                                value={form.medicalLicenseNumber}
                                onChange={(e) => set('medicalLicenseNumber', e.target.value)}
                                placeholder="e.g. MDCN/R/12345"
                                className={`${inputCls} font-mono`}
                            />
                            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-[#52706e] leading-relaxed">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-px" />
                                We use it only to confirm you&apos;re a registered doctor. Patients never see it.
                            </p>
                        </div>

                        <div>
                            <label className={labelCls} htmlFor="hospital">Hospital or clinic</label>
                            <input
                                id="hospital"
                                required
                                value={form.hospitalAffiliation}
                                onChange={(e) => set('hospitalAffiliation', e.target.value)}
                                placeholder="Where you see patients"
                                className={inputCls}
                            />
                        </div>

                        <div>
                            <label className={labelCls} htmlFor="bio">About you (optional)</label>
                            <textarea
                                id="bio"
                                rows={3}
                                value={form.bio}
                                onChange={(e) => set('bio', e.target.value)}
                                placeholder="A line or two for our clinical team"
                                className={`${inputCls} resize-none`}
                            />
                        </div>

                        {error && (
                            <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#002e2c] text-[#FAF6E7] text-sm font-semibold hover:bg-[#004744] transition active:scale-[0.99] disabled:opacity-60"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                            {submitting ? 'Saving…' : prefilled ? 'Save my details' : 'Send for verification'}
                        </button>
                    </form>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                        { icon: ShieldCheck, title: 'We verify you', body: 'Our clinical team checks your licence.' },
                        { icon: UserPlus, title: 'You refer', body: 'Send patients in a minute, or share your link.' },
                        { icon: Wallet, title: 'You earn', body: 'Commission on their care, paid monthly.' },
                    ].map(({ icon: Icon, title, body }) => (
                        <div key={title} className="p-4 rounded-2xl bg-white border border-[#002e2c]/10">
                            <Icon className="w-4 h-4 text-[#005b57]" />
                            <p className="mt-2 text-xs font-semibold">{title}</p>
                            <p className="text-xs text-[#52706e] leading-relaxed">{body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
