'use client';

import { useState } from 'react';
import { SettingsSidebar } from '@/components/settings/SettingsSidebar';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    return (
        // Use negative margins to break out of parent dashboard layout padding
        // and position fixed to overlay on top of the dashboard sidebar
        <div className="fixed inset-0 z-50 bg-[#1a1a1a]">
            {/* Mobile Header */}
            <SettingsHeader onMenuClick={() => setIsMobileMenuOpen(true)} />

            {/* Mobile Sidebar Drawer */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetContent side="left" className="w-[280px] p-0 border-r border-white/10 bg-[#0a0a0a]">
                    <SettingsSidebar onItemClick={() => setIsMobileMenuOpen(false)} />
                </SheetContent>
            </Sheet>

            <div className="flex h-full md:pt-0 pt-14">
                {/* Desktop Sidebar */}
                <aside className="hidden md:flex md:w-[280px] md:flex-col md:flex-shrink-0 border-r border-white/10 h-full">
                    <SettingsSidebar />
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-4xl mx-auto p-4 md:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
