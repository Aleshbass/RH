import { makeFunctionReference } from 'convex/server';
import { getConvexClient } from '@/lib/convex-client';
import { REHABIFY_SERVICES, defaultTariffs, formatKobo, isBookableServiceId } from '@/lib/rehabify-services';
import { SITE_CONFIG } from '@/lib/seo/config';
import type { Catalogue, TravelZone } from '@/lib/rehabify-api-types';

/**
 * /llms-full.txt — the long-form brief for AI assistants (https://llmstxt.org), next to the
 * short index at public/llms.txt.
 *
 * Only facts that are true on the site: every statement here comes from a page, a policy or the
 * booking code. The physiotherapist list, the service prices and the travel zones are read live
 * from Convex (refreshed hourly); if Convex is unreachable the prices fall back to the standard
 * defaults and the other parts are left out.
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

type Zone = TravelZone;

// Typed references: going through `api` here hits TypeScript's instantiation depth limit
const getCatalogueRef = makeFunctionReference<'query', Record<string, never>, Catalogue>('serviceTariffs:getCatalogue');
const listZonesRef = makeFunctionReference<'query', Record<string, never>, Zone[]>('travelZones:listZones');
const searchRef = makeFunctionReference<'query', { limit: number; offset: number }, { results: ListedPhysio[] }>(
  'marketplace/search:searchPhysiotherapists'
);

type LiveData = {
  physios: ListedPhysio[] | null;
  catalogue: Catalogue | null;
  zones: Zone[] | null;
};

function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CONVEX_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function attempt<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await withTimeout(load());
  } catch {
    return null;
  }
}

async function loadLiveData(): Promise<LiveData> {
  let client: ReturnType<typeof getConvexClient> | null = null;
  try {
    client = getConvexClient();
  } catch {
    // NEXT_PUBLIC_CONVEX_URL not set
  }
  if (!client) return { physios: null, catalogue: null, zones: null };
  const convex = client;

  const [search, catalogue, zones] = await Promise.all([
    attempt(() => convex.query(searchRef, { limit: 5000, offset: 0 })),
    attempt(() => convex.query(getCatalogueRef, {})),
    attempt(() => convex.query(listZonesRef, {})),
  ]);

  return {
    physios: search
      ? search.results.map((p: ListedPhysio) => ({
          id: p.id,
          fullName: p.fullName,
          location: p.location,
          specializations: p.specializations,
          yearsOfExperience: p.yearsOfExperience,
          offersOnlineSessions: p.offersOnlineSessions,
          offersInPersonSessions: p.offersInPersonSessions,
          isVerified: p.isVerified,
        }))
      : null,
    catalogue,
    zones,
  };
}

type ServiceLine = Pick<
  Catalogue['services'][number],
  'id' | 'name' | 'kind' | 'mode' | 'durationLabel' | 'bookable' | 'priceKobo' | 'travelApplies' | 'summary'
>;

/** The live catalogue, or the standard defaults from lib/rehabify-services.ts. */
function serviceLines(catalogue: Catalogue | null): ServiceLine[] {
  if (catalogue) return catalogue.services;
  const tariffs = defaultTariffs();
  return REHABIFY_SERVICES.map((service) => {
    const tariff = isBookableServiceId(service.id) ? tariffs[service.id] : null;
    return {
      id: service.id,
      name: service.name,
      kind: service.kind,
      mode: service.mode,
      durationLabel: service.durationLabel,
      bookable: service.bookable,
      priceKobo: tariff?.priceKobo ?? 0,
      travelApplies: tariff?.travelApplies ?? false,
      summary: service.summary,
    };
  });
}

function servicesList(catalogue: Catalogue | null): string {
  return serviceLines(catalogue)
    .map((service) => {
      const where = service.mode === 'home' ? 'at home' : 'by video';
      if (service.kind === 'screening' && !service.bookable) {
        return `- ${service.name} (${service.durationLabel}, ${where}): free, coming soon. ${service.summary}`;
      }
      const price = service.travelApplies
        ? `from ${formatKobo(service.priceKobo)}, plus a travel charge for the patient's area (shown before payment)`
        : formatKobo(service.priceKobo);
      return `- ${service.name} (${service.durationLabel}, ${where}): ${price}${service.bookable ? '' : ' (not bookable right now)'}. ${service.summary}`;
    })
    .join('\n');
}

function zonesLine(zones: Zone[] | null): string {
  if (!zones || zones.length === 0) {
    return "- Home visits need the patient's city and area so Rehabify can check that a physiotherapist covers that location.";
  }
  const byCity = new Map<string, string[]>();
  for (const zone of zones) {
    const areas = zone.areas.map(clean).filter(Boolean);
    byCity.set(clean(zone.city), [...(byCity.get(clean(zone.city)) ?? []), ...areas]);
  }
  const cities = [...byCity.entries()].map(([city, areas]) => (areas.length ? `${city} (${areas.join(', ')})` : city));
  return `- Home visits can currently be booked online in: ${cities.join('; ')}. Each area belongs to a travel zone, which sets any travel charge.`;
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

function physioSection(base: string, physios: ListedPhysio[] | null): string {
  if (!physios) {
    return `## Physiotherapists you can book\n\nSee the live list at ${base}/find-a-physio (search by condition, specialty, name or location).\n`;
  }
  if (physios.length === 0) {
    return `## Physiotherapists you can book\n\nSee ${base}/find-a-physio for physiotherapists currently taking bookings.\n`;
  }

  const locations = new Map<string, string>();
  for (const physio of physios) {
    if (!physio.location) continue;
    const label = titleCase(clean(physio.location));
    if (label) locations.set(label.toLowerCase(), label);
  }

  const lines = physios.slice(0, MAX_LISTED_PHYSIOS).map((physio) => {
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
    physios.length > MAX_LISTED_PHYSIOS ? `\nMore physiotherapists are listed at ${base}/find-a-physio.` : '',
    '',
  ].join('\n');
}

function buildBrief(live: LiveData): string {
  const base = SITE_CONFIG.url;
  const org = SITE_CONFIG.organization;

  return `# Rehabify Health (Physio Around Me): full brief

> Rehabify Health (${base}, also known as "Physio Around Me") is a Nigerian physiotherapy platform. Patients book standard Rehabify services (consultations, assessments and treatment, by video or at home) with physiotherapists who have been reviewed and approved by the Rehabify team, at the same all-inclusive price whichever physiotherapist they see, and pay securely through Paystack.

This is the long version of ${base}/llms.txt, written for AI assistants and search engines. Generated from the live site; refreshed hourly.

## Names

- Company / brand: Rehabify Health (also written Rehabify, RehabifyHealth)
- Website: ${base} ("Physio Around Me", physioaroundme.com)
- Partner portal: ${SITE_CONFIG.subSites.partners}
- Developer documentation: ${SITE_CONFIG.subSites.docs}

## What Rehabify Health does

- Physiotherapy marketplace: patients search physiotherapists, view their profiles (experience, specialties, languages, location, session types, patient reviews) and book online. ${base}/find-a-physio
- Finding the right care: at ${base}/pricing patients answer a few questions (whether they have been assessed by Rehabify, video or home, and their area) to see the right service and its full price, then book it at ${base}/get-care. They can also message Joy on WhatsApp.
- Session types: online video sessions through a secure video link, and home visits.
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
- Home visits depend on where the physiotherapists taking bookings are based (see the list below).
${zonesLine(live.zones)}

## How booking works

1. Choose a service at ${base}/get-care (or find the right one at ${base}/pricing), or message Joy on WhatsApp.
2. Choose a physiotherapist and a time from their availability. For a home visit, give your city and area.
3. Pay through Paystack. The total shown before payment, including any travel charge, is what the patient pays.
4. The time is held while the patient pays, and the booking is confirmed once Rehabify has verified the payment.
5. Online sessions use a secure appointment link. The physiotherapist is responsible for the clinical care provided.

Full terms: ${base}/consultation-booking-policy and ${base}/payment-policy

## Services and prices

Rehabify sets one standard price for each service, the same whichever Rehabify physiotherapist the patient sees (prices can change; ${base}/pricing shows the current ones):

${servicesList(live.catalogue)}

- Not sure where to start: the Initial Recovery Consultation is a brief clinician-led video consultation that recommends the right next step. It is not a full assessment.
- Patients can book a comprehensive assessment directly. The virtual assessment includes an initial recovery plan; if a physical examination is needed, the clinician recommends an in-person assessment. Treatment sessions follow a Rehabify assessment.
- All-inclusive: the price shown is the price the patient pays. There is no booking or platform fee at checkout.
- No subscriptions: patients pay per session.
- Home visits: a travel charge may be added, set by the travel zone for the patient's city and area. It is shown, with the total, before payment.
- HMO coverage is not currently accepted.

## Help with the cost

- Rehabify Access (assisted care): for people who need rehabilitation but are worried about the cost. Eligible patients may get reduced-fee physiotherapy or a flexible arrangement, with the same clinical standards. Patients apply from their Rehabify account; each application is reviewed individually against the same criteria, places depend on programme capacity and assisted rates are not guaranteed for everyone. Income is asked in ranges and no documents are needed to apply. ${base}/rehabify-access
- MediLoan: short-term healthcare financing from MyItura (an independent company that handles all loan matters), so patients can be treated now and pay later. ${base}/payment

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

${physioSection(base, live.physios)}`;
}

export async function GET() {
  const live = await loadLiveData();
  return new Response(buildBrief(live), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
