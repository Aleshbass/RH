'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { cn } from '@/lib/utils';
import {
    User,
    Store,
    Clock,
    Calendar,
    DollarSign,
    Bell,
    Shield,
    Settings,
    ArrowLeft,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface NavItem {
    label: string;
    href: string;
    icon: React.ElementType;
}

const navItems: NavItem[] = [
    { label: 'Profile', href: '/dashboard/physiotherapist/settings/profile', icon: User },
    { label: 'Marketplace', href: '/dashboard/physiotherapist/settings/marketplace', icon: Store },
    { label: 'Availability', href: '/dashboard/physiotherapist/settings/availability', icon: Clock },
    { label: 'Calendar', href: '/dashboard/physiotherapist/settings/calendar', icon: Calendar },
    { label: 'Payout', href: '/dashboard/physiotherapist/settings/payout', icon: DollarSign },
    { label: 'Notifications', href: '/dashboard/physiotherapist/settings/notifications', icon: Bell },
    { label: 'Privacy', href: '/dashboard/physiotherapist/settings/privacy', icon: Shield },
    { label: 'Preferences', href: '/dashboard/physiotherapist/settings/preferences', icon: Settings },
];

interface SettingsSidebarProps {
    onItemClick?: () => void;
}

export function SettingsSidebar({ onItemClick }: SettingsSidebarProps) {
    const pathname = usePathname();
    const currentUser = useQuery(api.users.getMyUser);

    // Check if we're on the main settings page (should highlight Profile)
    const isMainSettingsPage = pathname === '/dashboard/physiotherapist/settings';

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a] text-white">
            {/* Back Button */}
            <div className="p-4 border-b border-white/10">
                <Link
                    href="/dashboard/physiotherapist"
                    className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>
            </div>

            {/* User Info */}
            <div className="p-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={currentUser?.imageUrl || ''} alt={currentUser?.firstName || 'User'} />
                        <AvatarFallback className="bg-[#005b57] text-white">
                            {currentUser?.firstName?.[0]}{currentUser?.lastName?.[0]}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                            {currentUser?.firstName} {currentUser?.lastName}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{currentUser?.email}</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href ||
                        (isMainSettingsPage && item.href.endsWith('/profile'));

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onItemClick}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                                isActive
                                    ? 'bg-white/10 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            )}
                        >
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
