'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    UserPlus,
    Users,
    Wallet
} from '@/components/icons'

const navigation = [
    { name: 'Overview', href: '/dashboard/doctor', icon: LayoutDashboard },
    { name: 'Refer a Patient', href: '/dashboard/doctor/referrals/new', icon: UserPlus },
    { name: 'My Referrals', href: '/dashboard/doctor/referrals', icon: Users },
    { name: 'Earnings', href: '/dashboard/doctor/earnings', icon: Wallet },
]

export default function DoctorSidebar() {
    const pathname = usePathname()

    return (
        <div className="flex h-full flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4">
            <div className="flex h-16 shrink-0 items-center">
                <h2 className="text-lg font-bold text-gray-900">Partner Portal</h2>
            </div>
            <nav className="flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                    <li>
                        <ul role="list" className="-mx-2 space-y-1">
                            {navigation.map((item) => {
                                const isActive = pathname === item.href
                                return (
                                    <li key={item.name}>
                                        <Link
                                            href={item.href}
                                            className={cn(
                                                isActive
                                                    ? 'bg-gray-50 text-indigo-600'
                                                    : 'text-gray-700 hover:text-indigo-600 hover:bg-gray-50',
                                                'group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold'
                                            )}
                                        >
                                            <item.icon
                                                className={cn(
                                                    isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-indigo-600',
                                                    'h-6 w-6 shrink-0'
                                                )}
                                                aria-hidden="true"
                                            />
                                            {item.name}
                                        </Link>
                                    </li>
                                )
                            })}
                        </ul>
                    </li>
                </ul>
            </nav>
        </div>
    )
}
