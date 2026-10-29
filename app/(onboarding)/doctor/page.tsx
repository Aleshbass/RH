'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { useMutation, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock, Mail, ShieldCheck, UserPlus, Wallet } from '@/components/icons';
import { primaryButtonClass, secondaryButtonClass } from '@/components/physio/ui';
import { IconChip } from '@/components/patient/ui';
import { FieldLabel, errorText, inputClass, textareaClass } from '@/components/partners/doctor/ui';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';

type DoctorProfile = {
    profile: {
        title?: string;
        specialty?: string;
        medicalLicenseNumber?: string;
        hospitalAffiliation?: string;
        bio?: string;
    } | null;
} | null;

/** Closed while an admin has paused new doctor sign-ups (existing doctors can always update their details). */
const signupStatusRef = makeFunctionReference<'query', Record<string, never>, { open: boolean }>('doctors:getDoctorSignupStatus');

const TITLES = ['Dr.', 'Prof.', 'Mr.', 'Mrs.', 'Ms.'];
const SUPPORT_EMAIL = 'partners@physioaroundme.com';

/**
 * Referring doctor sign-up: a short professional profile. Saving it creates the doctor's
 * referral account (a partner of type "doctor"), which an admin approves after checking the
 * licence. Everything after that happens in the partner portal.
 */
export default function DoctorOnboardingPage() {
    const router = useRouter();
    const { user } = useUser();
    const existing = useQuery(api.doctors.getMyDoctorProfile) as DoctorProfile | undefined;
    const signup = useQuery(signupStatusRef, {});
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
            playSound('success');
            toast.success("Thanks. We're checking your details.");
            router.replace('/partners/portal');
        } catch (err) {
            playSound('error');
            setError(errorText(err, "We couldn't save your details. Please try again."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-pt-canvas px-4 py-10 text-pt-ink sm:py-14">
            <div className="mx-auto max-w-2xl space-y-6">
                <div className="flex items-center justify-between">
                    <Link href="/" aria-label="Rehabify home">
                        <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={120} height={32} className="h-7 w-auto" priority />
                    </Link>
                    <span className="text-sm font-medium text-pt-muted">Referring doctors</span>
                </div>

                {signup?.open === false ? (
                    <PausedCard />
                ) : (
                    <div className="space-y-6 rounded-3xl border border-pt-line bg-pt-surface p-6 shadow-pt sm:p-8">
                        <div className="space-y-2">
                            <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">
                                {name ? `Welcome, ${name}` : 'Set up your referral account'}
                            </h1>
                            <p className="text-[15px] text-pt-muted">
                                Tell us about your practice. We check your licence, then you can refer patients for physiotherapy and earn a commission on their care.
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div>
                                    <FieldLabel htmlFor="title">Title</FieldLabel>
                                    <select
                                        id="title"
                                        value={TITLES.includes(form.title) ? form.title : 'Dr.'}
                                        onChange={(e) => set('title', e.target.value)}
                                        className={inputClass}
                                    >
                                        {TITLES.map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <FieldLabel htmlFor="specialty">Specialty</FieldLabel>
                                    <input
                                        id="specialty"
                                        required
                                        value={form.specialty}
                                        onChange={(e) => set('specialty', e.target.value)}
                                        placeholder="e.g. Orthopaedic surgery, General practice"
                                        className={inputClass}
                                    />
                                </div>
                            </div>

                            <div>
                                <FieldLabel htmlFor="licence">MDCN folio or licence number</FieldLabel>
                                <input
                                    id="licence"
                                    required
                                    value={form.medicalLicenseNumber}
                                    onChange={(e) => set('medicalLicenseNumber', e.target.value)}
                                    placeholder="e.g. MDCN/R/12345"
                                    className={cn(inputClass, 'font-mono')}
                                />
                                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-pt-muted">
                                    <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
                                    We use it only to confirm you&apos;re a registered doctor. Patients never see it.
                                </p>
                            </div>

                            <div>
                                <FieldLabel htmlFor="hospital">Hospital or clinic</FieldLabel>
                                <input
                                    id="hospital"
                                    required
                                    value={form.hospitalAffiliation}
                                    onChange={(e) => set('hospitalAffiliation', e.target.value)}
                                    placeholder="Where you see patients"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <FieldLabel htmlFor="bio" hint="Optional">About you</FieldLabel>
                                <textarea
                                    id="bio"
                                    rows={3}
                                    value={form.bio}
                                    onChange={(e) => set('bio', e.target.value)}
                                    placeholder="A line or two for our clinical team"
                                    className={textareaClass}
                                />
                            </div>

                            {error && (
                                <p role="alert" className="rounded-xl bg-pt-rose-bg px-3.5 py-2.5 text-[13px] text-pt-rose-fg">
                                    {error}
                                </p>
                            )}

                            <Button type="submit" disabled={submitting} className={cn(primaryButtonClass, 'h-12 w-full text-[15px]')}>
                                {submitting ? 'Saving…' : prefilled ? 'Save my details' : 'Send for verification'}
                                {!submitting && <ArrowRight className="h-4 w-4" />}
                            </Button>
                        </form>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                        { icon: ShieldCheck, title: 'We verify you', body: 'Our clinical team checks your licence.' },
                        { icon: UserPlus, title: 'You refer', body: 'Send a patient in a minute, or share your link.' },
                        { icon: Wallet, title: 'You earn', body: 'Commission on their care, paid monthly.' },
                    ].map(({ icon, title, body }) => (
                        <div key={title} className="rounded-2xl border border-pt-line bg-pt-surface p-4">
                            <IconChip icon={icon} tone="neutral" size="sm" />
                            <p className="mt-3 text-sm font-semibold">{title}</p>
                            <p className="text-[13px] text-pt-muted">{body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Admin Settings paused new referring doctors. */
function PausedCard() {
    return (
        <div className="rounded-3xl border border-pt-line bg-pt-surface p-6 shadow-pt sm:p-8">
            <IconChip icon={Clock} tone="neutral" size="lg" />
            <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">We&apos;re not taking new referring doctors right now</h1>
            <p className="mt-2 text-[15px] text-pt-muted">
                Sign-ups are paused for a short while. Email us and we&apos;ll let you know as soon as we open again. Your patients can still reach us through Joy on WhatsApp.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button asChild className={cn(primaryButtonClass, 'h-11 flex-1')}>
                    <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Referring doctor sign-up')}`}>
                        <Mail className="h-4 w-4" />
                        Email us
                    </a>
                </Button>
                <Button asChild variant="outline" className={cn(secondaryButtonClass, 'h-11 flex-1')}>
                    <Link href="/platform/doctors">How referring works</Link>
                </Button>
            </div>
        </div>
    );
}
