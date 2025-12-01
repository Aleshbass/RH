'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DashboardFooter() {
    const pathname = usePathname();
    const isPhysiotherapist = pathname?.includes('/physiotherapist');

    return (
        <footer className="mt-auto py-6 px-8 border-t border-gray-200 bg-white/50 backdrop-blur-sm">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-500">
                <p>&copy; {new Date().getFullYear()} Rehabify Health. All rights reserved.</p>
                <div className="flex items-center gap-6">
                    <Link href="/help" className="hover:text-blue-600 transition-colors">
                        Help Center
                    </Link>
                    {isPhysiotherapist && (
                        <Link
                            href="/dashboard/physiotherapist/billing/payout-policy"
                            className="hover:text-blue-600 transition-colors"
                        >
                            Payout Policy
                        </Link>
                    )}
                    <Link href="/privacy-policy" className="hover:text-blue-600 transition-colors">
                        Privacy
                    </Link>
                    <Link href="/terms-and-conditions" className="hover:text-blue-600 transition-colors">
                        Terms
                    </Link>
                </div>
            </div>
        </footer>
    );
}
