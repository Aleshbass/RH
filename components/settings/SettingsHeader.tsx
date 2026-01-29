'use client';

import Link from 'next/link';
import { Menu, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SettingsHeaderProps {
    onMenuClick: () => void;
}

export function SettingsHeader({ onMenuClick }: SettingsHeaderProps) {
    return (
        <header className="sticky top-0 z-40 flex items-center gap-4 px-4 py-3 bg-[#0a0a0a] border-b border-white/10 md:hidden">
            {/* Menu Button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={onMenuClick}
                className="text-white hover:bg-white/10"
            >
                <Menu className="h-5 w-5" />
            </Button>

            {/* Back Button */}
            <Link
                href="/dashboard/physiotherapist"
                className="text-gray-400 hover:text-white transition-colors"
            >
                <ArrowLeft className="h-5 w-5" />
            </Link>

            {/* Title */}
            <h1 className="text-lg font-semibold text-white">Settings</h1>
        </header>
    );
}
