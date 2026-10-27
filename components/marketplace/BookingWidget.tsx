"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight } from "@/components/icons";
import { bookableServices, type Catalogue } from "@/components/booking/booking-shared";
import { formatKobo } from "@/lib/rehabify-services";

interface BookingWidgetProps {
  profile: {
    id: string;
    fullName: string;
    /** Rehabify service ids this physio delivers (getPhysiotherapistProfile). */
    servicesOffered?: string[];
  };
}

/**
 * Book this physio. The website shows only the first consultation's price, not a price list:
 * every other session's exact amount appears once the patient picks it, before they pay.
 */
export default function BookingWidget({ profile }: BookingWidgetProps) {
  const router = useRouter();
  const catalogue = useQuery(api.serviceTariffs.getCatalogue) as Catalogue | undefined;
  const services = bookableServices(catalogue?.services, profile.servicesOffered ?? []);
  const consultation = services.find((service) => service.id === "recovery_consultation");

  return (
    <div className="rounded-2xl bg-rh-ink p-5 text-white sm:p-6">
      <h2 className="text-xl font-semibold">Book a session</h2>
      <p className="mt-1 text-sm text-white/60">
        {consultation
          ? `Start with a ${consultation.durationLabel} consultation for ${formatKobo(consultation.priceKobo)}, or book an assessment directly.`
          : "Choose a session, date and time."}
      </p>

      {services.length > 0 && (
        <ul className="mt-5 divide-y divide-white/10 border-y border-white/10" aria-label="Sessions">
          {services.map((service) => (
            <li key={service.id} className="flex items-baseline justify-between gap-3 py-3 text-sm">
              <span className="min-w-0 text-white/85">{service.shortName}</span>
              <span className="shrink-0 text-white/45">{service.durationLabel}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => router.push(`/book/${profile.id}`)}
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-base font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep"
      >
        Choose a session and book
        <ArrowRight className="h-4 w-4" />
      </button>

      <p className="mt-3 text-center text-xs text-white/50">You&apos;ll see the exact price before you pay.</p>
    </div>
  );
}
