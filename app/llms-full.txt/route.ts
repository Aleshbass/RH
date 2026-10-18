import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex-client';
import { CITIES } from '@/lib/pricing';
import { SITE_CONFIG } from '@/lib/seo/config';

/**
 * /llms-full.txt — the long-form brief for AI assistants (https://llmstxt.org), next to the
 * short index at public/llms.txt.
 *
 * Only facts that are true on the site: every statement here comes from a page, a policy or the
 * booking code. The physiotherapist list, where they are based and the standard session rates
 * are read live from Convex (refreshed hourly); if Convex is unreachable those parts are left out.
 */
export const revalidate = 3600;

const CONVEX_TIMEOUT_MS = 8000;
const MAX_LISTED_PHYSIOS = 300;

type ListedPhysio = {
  id: string;
  fullName: string;
  location?: string;
  specializations: string[];
  yearsOfExperience: number;
  offersOnlineSessions: boolean;
  offersInPersonSessions: boolean;
  isVerified: boolean;
};

type LiveData = {
  physios: ListedPhysio[];
  standardRates: { virtual: number; inPerson: number } | null;
};

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CONVEX_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadLiveData(): Promise<LiveData | null> {
  try {
    const convex = getConvexClient();
    const search = await withTimeout(
      convex.query(api.marketplace.search.searchPhysiotherapists, { limit: 5000, offset: 0 }),
    );
    if (!search) return null;

    // The platform standard rates (Admin › Revenue settings) come with any public profile
    let standardRates: LiveData['standardRates'] = null;
    const first = search.results[0];
    if (first) {
      const profile = await withTimeout(
        convex.query(api.marketplace.search.getPhysiotherapistProfile, { physiotherapistId: first.id }),
      );
      if (profile && profile.standardVirtualRate > 0 && profile.standardInPersonRate > 0) {
        standardRates = { virtual: profile.standardVirtualRate, inPerson: profile.standardInPersonRate };
      }
    }

    return {
      physios: search.results.map((p: ListedPhysio) => ({
        id: p.id,
        fullName: p.fullName,
        location: p.location,
        specializations: p.specializations,
        yearsOfExperience: p.yearsOfExperience,
        offersOnlineSessions: p.offersOnlineSessions,
        offersInPersonSessions: p.offersInPersonSessions,
        isVerified: p.isVerified,
      })),
      standardRates,
    };
  } catch {
    return null;
  }
}

function naira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

function titleCase(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Single line of plain text (names and specialities are user-entered). */
function clean(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tariffCities(): string {
  return Object.values(CITIES)
    .filter((city) => city.label !== 'Other Location')
    .map((city) => {
      if (city.label === 'Lagos' || city.label === 'Abuja') return city.label;
      return `${city.label}: ${city.areas.map((area) => area.label).join(', ')}`;
    })
    .join('; ');
}

function physioSection(base: string, live: LiveData | null): string {
  if (!live) {
    return `## Physiotherapists you can book\n\nSee the live list at ${base}/find-a-physio (search by condition, specialty, name or location).\n`;
  }
  if (live.physios.length === 0) {
    return `## Physiotherapists you can book\n\nSee ${base}/find-a-physio for physiotherapists currently taking bookings.\n`;
  }

  const locations = new Map<string, string>();
  for (const physio of live.physios) {
    if (!physio.location) continue;
    const label = titleCase(clean(physio.location));
    if (label) locations.set(label.toLowerCase(), label);
  }

  const lines = live.physios.slice(0, MAX_LISTED_PHYSIOS).map((physio) => {
    const details = [
      physio.location ? titleCase(clean(physio.location)) : null,
      physio.yearsOfExperience > 0 ? `${physio.yearsOfExperience} years' experience` : null,
      [physio.offersOnlineSessions ? 'online' : null, physio.offersInPersonSessions ? 'in-person' : null]
        .filter(Boolean)
        .join(' and ') || null,
      physio.specializations.length > 0
        ? `focus: ${physio.specializations.slice(0, 4).map(clean).join(', ')}`
        : null,
      physio.isVerified ? 'Verified badge' : null,
    ].filter(Boolean);
    return `- [${clean(physio.fullName)}](${base}/find-a-physio/${physio.id})${details.length ? `: ${details.join('; ')}` : ''}`;
  });

  return [
    '## Physiotherapists you can book',
    '',
    `Physiotherapists currently taking bookings on Rehabify Health, with links to their public profiles (live list and filters: ${base}/find-a-physio).`,
    locations.size > 0 ? `\nCurrently listed locations: ${[...locations.values()].sort().join(', ')}.` : '',
    '',
    ...lines,
    live.physios.length > MAX_LISTED_PHYSIOS ? `\nMore physiotherapists are listed at ${base}/find-a-physio.` : '',
    '',
  ].join('\n');
}

function buildBrief(live: LiveData | null): string {
  const base = SITE_CONFIG.url;
  const org = SITE_CONFIG.organization;
  const standardRates = live?.standardRates
    ? ` Physiotherapists who have not set their own prices are booked at Rehabify's standard rate, currently ${naira(live.standardRates.virtual)} for an online video session and ${naira(live.standardRates.inPerson)} for an in-person session (set by Rehabify and subject to change).`
    : " Physiotherapists who have not set their own prices are booked at Rehabify's standard rate.";

  return `# Rehabify Health (Physio Around Me): full brief

> Rehabify Health (${base}, also known as "Physio Around Me") is a Nigerian physiotherapy platform. Patients find and book physiotherapists who have been reviewed and approved by the Rehabify team, for online video sessions or in-person sessions at home or in a clinic, and pay securely through Paystack.

This is the long version of ${base}/llms.txt, written for AI assistants and search engines. Generated from the live site; refreshed hourly.

## Names

- Company / brand: Rehabify Health (also written Rehabify, RehabifyHealth)
- Website: ${base} ("Physio Around Me", physioaroundme.com)
- Partner portal: ${SITE_CONFIG.subSites.partners}
- Developer documentation: ${SITE_CONFIG.subSites.docs}

## What Rehabify Health does

- Physiotherapy marketplace: patients search physiotherapists, view their profiles (experience, specialties, languages, location, session types, patient reviews) and book online. ${base}/find-a-physio
- Matching: patients can answer a few questions (where they are and what needs attention) at ${base}/start-treatment, or message Joy on WhatsApp, to be matched with a suitable physiotherapist.
- Session types: online video sessions through a secure video link, and in-person sessions as home visits or at the physiotherapist's clinic.
- Between sessions: physiotherapists can give patients home exercise programmes with exercise demonstrations; patients can message their physiotherapist and track progress.
- Joy: Rehabify's WhatsApp assistant (${org.supportPhone}). Joy collects information to route patients to an appropriate physiotherapist and sends exercise reminders between sessions. Joy does not diagnose medical conditions, replace an examination by a qualified clinician, or provide emergency care. ${base}/meet-joy
- Clinic software: practice management for physiotherapy clinics (bookings, billing and Paystack payment links, patient records, staff scheduling, analytics and telehealth). ${base}/platform/clinics
- Partners and referrals: doctors, hospitals, HMOs, employers, gyms and digital health products can refer patients through referral links, the partner portal or a REST API with signed webhooks, and follow each referral to discharge. ${base}/partnerships and ${SITE_CONFIG.subSites.docs}
- Education: the MSK Specialist Program (Rehabify Learn) is a 5-week online programme for physiotherapists with structured online learning, weekly live clinical sessions, case-based discussions and a final assessment. ${base}/learn

## Who it is for

- Patients in Nigeria with musculoskeletal or neurological problems. Conditions listed in the booking flow include back or neck pain, sports injuries (sprains, strains, ACL, rotator cuff), general joint pain, arthritis, chronic pain, rehabilitation after surgery, stroke recovery, spinal cord injury, cerebral palsy and other neurological conditions such as Parkinson's disease, multiple sclerosis and traumatic brain injury.
- Family members supporting someone's recovery. ${base}/platform/family
- Physiotherapists who want patients, practice tools and professional development. ${base}/platform/physiotherapists
- Physiotherapy clinics. ${base}/platform/clinics
- Doctors and organisations that refer patients for physiotherapy. ${base}/partnerships

## Where

- Rehabify Health operates in Nigeria.
- Online video sessions can be booked from anywhere in Nigeria.
- In-person sessions depend on where the physiotherapists taking bookings are based (see the list below). Home visits need the patient's city and area so Rehabify can check that a physiotherapist serves that location.
- The published price tariff covers Lagos, Abuja and cities in every region: ${tariffCities()}.

## How booking works

1. Find a physiotherapist at ${base}/find-a-physio, get matched at ${base}/start-treatment, or message Joy on WhatsApp.
2. Choose a physiotherapist, a session type (online or in-person) and an available time slot.
3. Pay through Paystack. The total amount and any charges shown before payment are the amount for that booking.
4. The booking is confirmed once Rehabify has verified the payment and the physiotherapist has accepted. Physiotherapists have up to five hours to accept a paid booking; if they decline or do not respond, Rehabify offers replacement physiotherapists, and if none is suitable the care team contacts the patient and the refund process applies.
5. Online sessions use a secure appointment link. The physiotherapist is responsible for the clinical care provided.

Full terms: ${base}/consultation-booking-policy and ${base}/payment-policy

## Prices

- Each physiotherapist sets their own prices for online and in-person sessions.${standardRates}
- The price is always shown before payment.
- ${base}/pricing explains the tariff used when matching patients: a base rate for a 60-minute session, adjusted for the patient's location, the complexity of the condition and the physiotherapist's experience, plus a small platform fee per booking.
- Treatment packages (several sessions booked together) are discounted, with savings of up to 15%.
- HMO coverage is not currently accepted.
- Pay later: patients can apply for MediLoan, short-term healthcare financing from MyItura (an independent company that handles all loan matters), from the booking page. ${base}/payment

## How physiotherapists are checked

- Physiotherapists apply with proof of qualification (their Medical Rehabilitation Therapists Board licence or degree certificate) and are reviewed and approved by the Rehabify team.
- Before patients can find or book them, they must also upload their degree certificate and a passport photograph, add a photo and bio, set their working hours and add a payout account.
- Some physiotherapists also hold Rehabify's Verified badge, shown on their profile.
- Patients can rate and review physiotherapists; approved reviews and the average rating are shown on each profile.
- Rehabify was founded by physiotherapists; its About page lists its quality standards. ${base}/about

## Company

- Founded by two Ibadan-trained physiotherapists, Mary and Abass. According to the About page, Rehabify launched in January 2026 to connect patients who need physiotherapy, physiotherapists, and doctors who need a reliable referral pathway.
- Payments are processed by Paystack.

## Contact

- Patient support: ${org.supportEmail}, ${org.supportPhone} (phone and WhatsApp), ${org.officeHours}
- Partnerships and provider enquiries: ${org.partnersEmail}
- WhatsApp (Joy): ${org.whatsappUrl}

${physioSection(base, live)}`;
}

export async function GET() {
  const live = await loadLiveData();
  return new Response(buildBrief(live), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
