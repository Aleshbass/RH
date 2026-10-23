"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, ExternalLink } from "@/components/icons";
import {
  bookableServices,
  lowestPriceLabel,
  servicePriceLabel,
  type Catalogue,
} from "@/components/booking/booking-shared";

interface BookingWidgetProps {
  profile: {
    id: string;
    fullName: string;
    /** Rehabify service ids this physio delivers (getPhysiotherapistProfile). */
    servicesOffered?: string[];
  };
}

export default function BookingWidget({ profile }: BookingWidgetProps) {
  const router = useRouter();
  const catalogue = useQuery(api.serviceTariffs.getCatalogue) as Catalogue | undefined;
  const services = bookableServices(catalogue?.services, profile.servicesOffered ?? []);
  const from = lowestPriceLabel(services);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Book a Session</CardTitle>
        <CardDescription>{from ? `${from}. The price you see is the price you pay.` : "Schedule your appointment online"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {services.length > 0 && (
          <ul className="space-y-2" aria-label="Services">
            {services.map((service) => (
              <li key={service.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 text-gray-700">
                  {service.shortName}
                  <span className="text-gray-400"> · {service.durationLabel}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-gray-900">{servicePriceLabel(service)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Service picker - primary CTA */}
        <Button
          onClick={() => router.push(`/book/${profile.id}`)}
          className="w-full h-12 text-base bg-[#005b57] hover:bg-[#00443e]"
        >
          <Calendar className="w-4 h-4 mr-2" />
          Choose a service and book
          <ExternalLink className="w-3 h-3 ml-2" />
        </Button>

        <p className="text-xs text-center text-gray-500">
          Choose your service, date and time. Your booking is confirmed once paid.
        </p>
      </CardContent>
    </Card>
  );
}
