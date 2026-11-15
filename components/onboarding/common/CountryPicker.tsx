'use client';

/**
 * Country select with small flags (physio onboarding). Flags are drawn inline because emoji flags
 * show as two letters on Windows. Simplified, but recognisable at 20 px.
 */

import { Globe } from '@/components/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OTHER_COUNTRY, PRACTICE_COUNTRIES } from '@/lib/practiceCountries';
import { cn } from '@/lib/utils';

const STAR = '15,6.7 15.75,8.97 18.14,8.98 16.21,10.39 16.94,12.67 15,11.27 13.06,12.67 13.79,10.39 11.86,8.98 14.25,8.97';
const MAPLE =
    'M15 4.5 16.2 7 17.6 6.4 17.1 9.2 19.3 8 18.8 9.6 20.2 10 17.6 12.2 18 13.4 15.4 13 15.4 15.5 14.6 15.5 14.6 13 12 13.4 12.4 12.2 9.8 10 11.2 9.6 10.7 8 12.9 9.2 12.4 6.4 13.8 7Z';

function FlagArt({ code }: { code: string }) {
    switch (code) {
        case 'NG':
            return (
                <>
                    <rect width="30" height="20" fill="#fff" />
                    <rect width="10" height="20" fill="#008751" />
                    <rect x="20" width="10" height="20" fill="#008751" />
                </>
            );
        case 'GH':
            return (
                <>
                    <rect width="30" height="6.67" fill="#CE1126" />
                    <rect y="6.67" width="30" height="6.67" fill="#FCD116" />
                    <rect y="13.33" width="30" height="6.67" fill="#006B3F" />
                    <polygon points={STAR} fill="#000" />
                </>
            );
        case 'KE':
            return (
                <>
                    <rect width="30" height="20" fill="#fff" />
                    <rect width="30" height="6" fill="#000" />
                    <rect y="7" width="30" height="6" fill="#BB0000" />
                    <rect y="14" width="30" height="6" fill="#006600" />
                    <ellipse cx="15" cy="10" rx="3.2" ry="6.6" fill="#000" />
                    <ellipse cx="15" cy="10" rx="1.9" ry="6.4" fill="#BB0000" />
                </>
            );
        case 'ZA':
            return (
                <>
                    <rect width="30" height="10" fill="#E03C31" />
                    <rect y="10" width="30" height="10" fill="#001489" />
                    <path d="M0 0 15 10H30M0 20 15 10" stroke="#fff" strokeWidth="6.6" fill="none" />
                    <path d="M0 0 15 10H30M0 20 15 10" stroke="#007749" strokeWidth="4" fill="none" />
                    <polygon points="0,2.4 11.4,10 0,17.6" fill="#FFB81C" />
                    <polygon points="0,4 9,10 0,16" fill="#000" />
                </>
            );
        case 'UG':
            return (
                <>
                    {['#000', '#FCDC04', '#D90000', '#000', '#FCDC04', '#D90000'].map((fill, i) => (
                        <rect key={i} y={i * 3.34} width="30" height="3.34" fill={fill} />
                    ))}
                    <circle cx="15" cy="10" r="3.4" fill="#fff" />
                    <circle cx="15" cy="10" r="1.2" fill="#9CA3AF" />
                </>
            );
        case 'RW':
            return (
                <>
                    <rect width="30" height="10" fill="#00A1DE" />
                    <rect y="10" width="30" height="5" fill="#FAD201" />
                    <rect y="15" width="30" height="5" fill="#20603D" />
                    <circle cx="25" cy="5" r="2" fill="#E5BE01" />
                </>
            );
        case 'GB':
            return (
                <>
                    <rect width="30" height="20" fill="#012169" />
                    <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
                    <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="1.4" />
                    <path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth="6" />
                    <path d="M15 0V20M0 10H30" stroke="#C8102E" strokeWidth="3.6" />
                </>
            );
        case 'US':
            return (
                <>
                    <rect width="30" height="20" fill="#fff" />
                    {Array.from({ length: 7 }, (_, i) => (
                        <rect key={i} y={(i * 2 * 20) / 13} width="30" height={20 / 13} fill="#B22234" />
                    ))}
                    <rect width="12" height={(7 * 20) / 13} fill="#3C3B6E" />
                </>
            );
        case 'CA':
            return (
                <>
                    <rect width="30" height="20" fill="#fff" />
                    <rect width="7.5" height="20" fill="#D52B1E" />
                    <rect x="22.5" width="7.5" height="20" fill="#D52B1E" />
                    <path d={MAPLE} fill="#D52B1E" />
                </>
            );
        default:
            return null;
    }
}

export function CountryFlag({ code, className }: { code: string; className?: string }) {
    if (code === OTHER_COUNTRY) {
        return (
            <span aria-hidden className={cn('inline-flex h-3.5 w-5 shrink-0 items-center justify-center text-neutral-500', className)}>
                <Globe className="h-3.5 w-3.5" />
            </span>
        );
    }
    return (
        <svg
            aria-hidden
            viewBox="0 0 30 20"
            className={cn('h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/10', className)}
        >
            <FlagArt code={code} />
        </svg>
    );
}

export function CountryPicker({
    value,
    onChange,
    id,
    className,
}: {
    value: string;
    onChange: (code: string) => void;
    id?: string;
    className?: string;
}) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger id={id} className={cn('h-11', className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {PRACTICE_COUNTRIES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                        <span className="flex items-center gap-2.5">
                            <CountryFlag code={country.code} />
                            {country.name}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
