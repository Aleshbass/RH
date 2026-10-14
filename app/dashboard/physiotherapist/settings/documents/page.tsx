'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';
import {
    DocumentRow,
    usePhysioDocumentUpload,
    usePhysioDocuments,
    type PhysioDocumentType,
} from '@/components/physio/PhysioDocuments';

/** Needed for review or before going live (see convex/physioSetup.ts). */
const REQUIRED: PhysioDocumentType[] = ['nationalId', 'degreeCertificate', 'passportPhoto'];
const OPTIONAL: PhysioDocumentType[] = [
    'mrtbLicense',
    'practicingLicense',
    'npaMembership',
    'nyscCertificate',
    'transcript',
    'proofOfAddress',
];

export default function DocumentsSettingsPage() {
    const user = useQuery(api.users.getMyUser);
    const profileId = user === undefined ? undefined : user?.physiotherapistProfileId ?? null;
    const documents = usePhysioDocuments(profileId);
    const { upload, remove } = usePhysioDocumentUpload();

    if (documents === undefined) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-56 rounded-xl" />
                <Skeleton className="h-72 rounded-xl" />
            </div>
        );
    }

    const rows = (types: PhysioDocumentType[], required: boolean) => (
        <div className="-my-3 divide-y divide-neutral-100 dark:divide-neutral-800">
            {types.map((type) => (
                <DocumentRow
                    key={type}
                    type={type}
                    required={required}
                    documents={documents}
                    disabled={!profileId}
                    onUpload={(file) =>
                        upload(
                            profileId!,
                            type,
                            file,
                            documents.filter((doc) => doc.documentType === type)
                        )
                    }
                    onRemove={(doc) => remove(doc._id)}
                />
            ))}
        </div>
    );

    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="Documents"
                description="Only Rehabify’s verification team can see these. PDF, JPG or PNG, up to 10 MB each."
            />
            <SettingsSection title="Required" description="Needed before patients can book you.">
                {rows(REQUIRED, true)}
            </SettingsSection>
            <SettingsSection title="Also helpful" description="Optional, but they help us verify you faster.">
                {rows(OPTIONAL, false)}
            </SettingsSection>
        </div>
    );
}
