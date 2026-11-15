/**
 * Countries a physiotherapist can apply from (onboarding). Nigeria is the default.
 *
 * Rehabify Care patients, Naira prices and payouts only run in Nigeria today, so physios in any
 * other country join as independent physios (enforced in convex/users.ts and convex/physioSetup.ts).
 * The profile stores the country's name (physiotherapistProfiles.country); a country that isn't
 * listed is stored as typed.
 */

export type PracticeCountry = {
    /** ISO 3166-1 alpha-2, or OTHER_COUNTRY for one not listed */
    code: string;
    name: string;
    /** International dialling code, shown in front of the phone number */
    dialCode: string;
    phonePlaceholder: string;
    /** The board that licenses physiotherapists there, when there is one national board */
    board?: string;
    /** Recognises a saved board as this country's board (older or shortened spellings) */
    boardMatch?: RegExp;
    /** Placeholder for the board name when there is no single national board */
    boardPlaceholder?: string;
    /** What the licence document is called there */
    licenceLabel: string;
    idHint: string;
    /** Where the map opens before a pin is dropped */
    center: { lat: number; lng: number; zoom: number };
};

export const DEFAULT_COUNTRY_CODE = 'NG';
export const OTHER_COUNTRY = 'OTHER';

export const PRACTICE_COUNTRIES: PracticeCountry[] = [
    {
        code: 'NG',
        name: 'Nigeria',
        dialCode: '+234',
        phonePlaceholder: '0803 123 4567',
        board: 'Medical Rehabilitation Therapists Board (MRTB)',
        boardMatch: /mrtb|medical rehabilitation/i,
        licenceLabel: 'MRTB licence',
        idHint: 'NIN slip, national ID card, international passport or driver’s licence',
        center: { lat: 9.082, lng: 8.6753, zoom: 6 },
    },
    {
        code: 'GH',
        name: 'Ghana',
        dialCode: '+233',
        phonePlaceholder: '024 123 4567',
        board: 'Allied Health Professions Council (AHPC)',
        boardMatch: /ahpc|allied health/i,
        licenceLabel: 'AHPC licence',
        idHint: 'Ghana Card, passport or driver’s licence',
        center: { lat: 7.9465, lng: -1.0232, zoom: 6 },
    },
    {
        code: 'KE',
        name: 'Kenya',
        dialCode: '+254',
        phonePlaceholder: '0712 345 678',
        board: 'Physiotherapy Council of Kenya (PCK)',
        boardMatch: /\bpck\b|physiotherapy council of kenya/i,
        licenceLabel: 'PCK licence',
        idHint: 'National ID card, passport or driver’s licence',
        center: { lat: 0.0236, lng: 37.9062, zoom: 5.5 },
    },
    {
        code: 'ZA',
        name: 'South Africa',
        dialCode: '+27',
        phonePlaceholder: '071 234 5678',
        board: 'Health Professions Council of South Africa (HPCSA)',
        boardMatch: /hpcsa|health professions council of south africa/i,
        licenceLabel: 'HPCSA registration',
        idHint: 'Smart ID card, ID book, passport or driver’s licence',
        center: { lat: -30.5595, lng: 22.9375, zoom: 4.5 },
    },
    {
        code: 'UG',
        name: 'Uganda',
        dialCode: '+256',
        phonePlaceholder: '0772 123 456',
        board: 'Allied Health Professionals Council (AHPC)',
        boardMatch: /ahpc|allied health/i,
        licenceLabel: 'AHPC licence',
        idHint: 'National ID card, passport or driver’s licence',
        center: { lat: 1.3733, lng: 32.2903, zoom: 6 },
    },
    {
        code: 'RW',
        name: 'Rwanda',
        dialCode: '+250',
        phonePlaceholder: '0788 123 456',
        board: 'Rwanda Allied Health Professions Council (RAHPC)',
        boardMatch: /rahpc|allied health/i,
        licenceLabel: 'RAHPC licence',
        idHint: 'National ID card, passport or driver’s licence',
        center: { lat: -1.9403, lng: 29.8739, zoom: 7.5 },
    },
    {
        code: 'GB',
        name: 'United Kingdom',
        dialCode: '+44',
        phonePlaceholder: '07700 900123',
        board: 'Health and Care Professions Council (HCPC)',
        boardMatch: /hcpc|health and care professions/i,
        licenceLabel: 'HCPC registration',
        idHint: 'Passport, driving licence or national ID card',
        center: { lat: 54, lng: -2.5, zoom: 4.5 },
    },
    {
        code: 'US',
        name: 'United States',
        dialCode: '+1',
        phonePlaceholder: '(555) 123-4567',
        boardPlaceholder: 'Your state’s physical therapy board',
        licenceLabel: 'State licence',
        idHint: 'Passport, driver’s license or state ID',
        center: { lat: 39.8283, lng: -98.5795, zoom: 3 },
    },
    {
        code: 'CA',
        name: 'Canada',
        dialCode: '+1',
        phonePlaceholder: '(555) 123-4567',
        boardPlaceholder: 'e.g. College of Physiotherapists of Ontario',
        licenceLabel: 'Licence',
        idHint: 'Passport, driver’s licence or provincial ID',
        center: { lat: 56.1304, lng: -106.3468, zoom: 3 },
    },
    {
        code: OTHER_COUNTRY,
        name: 'Another country',
        dialCode: '',
        phonePlaceholder: '+ country code and number',
        boardPlaceholder: 'Name of the board that licenses you',
        licenceLabel: 'Licence',
        idHint: 'National ID card, passport or driver’s licence',
        center: { lat: 12, lng: 15, zoom: 1.5 },
    },
];

export function practiceCountry(code: string): PracticeCountry {
    return PRACTICE_COUNTRIES.find((c) => c.code === code) ?? PRACTICE_COUNTRIES[0];
}

/** A saved country name back to a listed country, or OTHER_COUNTRY (empty means Nigeria). */
export function countryCodeFromName(name: string | null | undefined): string {
    const value = (name ?? '').trim().toLowerCase();
    if (!value) return DEFAULT_COUNTRY_CODE;
    const match = PRACTICE_COUNTRIES.find(
        (c) => c.code !== OTHER_COUNTRY && (c.name.toLowerCase() === value || c.code.toLowerCase() === value)
    );
    return match?.code ?? OTHER_COUNTRY;
}

/** Rehabify Care (network) patients are only matched in Nigeria today. */
export function hasRehabifyCare(code: string) {
    return code === DEFAULT_COUNTRY_CODE;
}

/** Server check on a saved country name (unset means Nigeria): outside Nigeria = independent only. */
export function isOutsideRehabifyCare(countryName: string | null | undefined) {
    return !hasRehabifyCare(countryCodeFromName(countryName));
}

/**
 * The phone number as saved. Nigerian numbers are kept as typed, as before; elsewhere a local
 * number gets the country's dialling code so our team (and WhatsApp) can reach it.
 */
export function internationalPhone(code: string, phone: string) {
    const trimmed = phone.trim();
    const country = practiceCountry(code);
    if (code === DEFAULT_COUNTRY_CODE || !country.dialCode || trimmed.startsWith('+')) return trimmed;
    return `${country.dialCode} ${trimmed.replace(/^0+/, '')}`;
}

/** The part of a saved number typed after the dialling code shown in front of the field. */
export function localPhone(code: string, phone: string) {
    const country = practiceCountry(code);
    if (code === DEFAULT_COUNTRY_CODE || !country.dialCode) return phone;
    const trimmed = phone.trim();
    return trimmed.startsWith(country.dialCode) ? trimmed.slice(country.dialCode.length).trim() : trimmed;
}
