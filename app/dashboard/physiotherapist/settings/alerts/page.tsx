'use client';

import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';
import { NotificationSettings } from '@/components/pwa/NotificationSettings';
import { OfflineUseSettings } from '@/components/offline/OfflineUseSettings';
import { useOfflineAvailable } from '@/lib/pwa';

export default function NotificationSettingsPage() {
    // Offline use on this phone: only for accounts that may use it (the offline pilot)
    const offlineAvailable = useOfflineAvailable();
    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="Notifications"
                description={
                    offlineAvailable
                        ? 'What reaches your phone, when Rehabify should stay quiet, and using it without internet.'
                        : 'What reaches your phone, and when Rehabify should stay quiet.'
                }
            />
            <SettingsSection title="Phone notifications">
                <NotificationSettings />
            </SettingsSection>
            {offlineAvailable && (
                <SettingsSection title="Without internet">
                    <OfflineUseSettings />
                </SettingsSection>
            )}
        </div>
    );
}
