'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useClerk, useUser } from '@clerk/nextjs';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { playSound, setSoundsEnabled, soundsEnabled } from '@/lib/sounds';
import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';

const SUPPORT_EMAIL = 'support@rehabify.ng';

function Row({
    title,
    description,
    action,
}: {
    title: string;
    description: string;
    action: React.ReactNode;
}) {
    return (
        <div className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{title}</p>
                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
            </div>
            <div className="shrink-0">{action}</div>
        </div>
    );
}

function LinkRow({ href, label }: { href: string; label: string }) {
    return (
        <Link
            href={href}
            className="flex items-center justify-between py-3 text-sm text-neutral-700 first:pt-0 last:pb-0 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
        >
            {label}
            <ChevronRight className="h-4 w-4 text-neutral-300 dark:text-neutral-600" />
        </Link>
    );
}

function SoundsSetting() {
    const [enabled, setEnabled] = useState(true);
    useEffect(() => setEnabled(soundsEnabled()), []);
    return (
        <Row
            title="Sounds"
            description="A soft chime when you send a message, a booking comes in or a payment arrives."
            action={
                <Switch
                    checked={enabled}
                    aria-label="Sounds"
                    onCheckedChange={(next) => {
                        setEnabled(next);
                        setSoundsEnabled(next);
                        if (next) playSound('success');
                    }}
                />
            }
        />
    );
}

export default function AccountPrivacyPage() {
    const { openUserProfile, signOut } = useClerk();
    const { user } = useUser();
    const email = user?.primaryEmailAddress?.emailAddress;

    const deletionMail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my Rehabify account')}&body=${encodeURIComponent(
        `Please delete my physiotherapist account${email ? ` (${email})` : ''}.`
    )}`;

    return (
        <div className="space-y-6">
            <SettingsPageHeader title="Account & privacy" description="Sign-in, security, sounds and your data." />

            <SettingsSection title="Sign-in and security">
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    <Row
                        title="Email, password and two-step verification"
                        description={email ? `Signed in as ${email}` : 'Manage how you sign in.'}
                        action={
                            <Button variant="outline" size="sm" onClick={() => openUserProfile()}>
                                Manage
                            </Button>
                        }
                    />
                    <Row
                        title="Sign out"
                        description="Sign out of Rehabify on this device."
                        action={
                            <Button variant="outline" size="sm" onClick={() => signOut({ redirectUrl: '/' })}>
                                Sign out
                            </Button>
                        }
                    />
                </div>
            </SettingsSection>

            <SettingsSection title="Sounds">
                <SoundsSetting />
            </SettingsSection>

            <SettingsSection title="Your data">
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    <LinkRow href="/privacy-policy" label="Privacy policy" />
                    <LinkRow href="/terms-and-conditions" label="Terms and conditions" />
                    <LinkRow href="/payout-policy" label="Payout policy" />
                </div>
            </SettingsSection>

            <SettingsSection title="Delete account">
                <Row
                    title="Close your account"
                    description="Email our team to close your account. We’ll confirm with you before anything is deleted."
                    action={
                        <Button asChild variant="outline" size="sm" className="text-red-600 hover:text-red-700 dark:text-red-400">
                            <a href={deletionMail}>Request deletion</a>
                        </Button>
                    }
                />
            </SettingsSection>
        </div>
    );
}
