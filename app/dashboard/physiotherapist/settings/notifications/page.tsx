'use client';

import { SettingsPageHeader, SettingsSection } from '@/components/physio/SettingsUI';
import { NotificationSettings } from '@/components/pwa/NotificationSettings';

export default function NotificationSettingsPage() {
    return (
        <div className="space-y-6">
            <SettingsPageHeader
                title="Notifications"
                description="What reaches your phone, and when Rehabify should stay quiet."
            />
            <SettingsSection title="Phone notifications">
                <NotificationSettings />
            </SettingsSection>
        </div>
    );
}
