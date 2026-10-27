'use client';

import { useQuery } from 'convex/react';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsPageHeader } from '@/components/physio/SettingsUI';
import { AgreementCenter, getMyAgreementsRef } from '@/components/agreements/AgreementCenter';

export default function AgreementsPage() {
    const data = useQuery(getMyAgreementsRef, {});

    return (
        <div>
            <SettingsPageHeader
                title="Agreements"
                description="Your agreement with Rehabify. Read it, sign it online in a few minutes, and download your copy."
            />
            {data === undefined ? (
                <div className="space-y-4">
                    <Skeleton className="h-40 rounded-[1.75rem]" />
                    <Skeleton className="h-96 rounded-[1.75rem]" />
                </div>
            ) : data === null ? null : (
                <AgreementCenter data={data} />
            )}
        </div>
    );
}
