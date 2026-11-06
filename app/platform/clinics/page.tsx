"use client";

import { useState } from "react";
import { Check } from "@/components/icons";
import PlatformPageLayout, { type PlatformFeature } from "@/components/platform/PlatformPageLayout";
import { BookDemoDialog } from "@/components/partners/BookDemoDialog";
import { CLINIC_PROGRAMME_OVERAGE } from "@/lib/clinicPlans";
import { useClinicPlans } from "@/lib/useClinicPlans";
import { MARKETING_VIDEOS } from "@/lib/marketingVideos";
import { cn } from "@/lib/utils";

const FEATURES: PlatformFeature[] = [
  { title: "Guided clinic setup", description: "Create your clinic profile in a few guided steps." },
  { title: "Staff roles", description: "Invite your clinicians and choose which pages each role can open." },
  { title: "Assign patients", description: "Give each patient to the right clinician, and reassign when you need to." },
  { title: "Team appointments", description: "See every appointment across your clinic in one place." },
  { title: "Invoices and payment links", description: "Bill your patients. What they pay goes to your clinic’s bank account." },
  { title: "Monthly reports", description: "Revenue, visits, patients and team numbers at a glance." },
];

function Plans({ onBookDemo }: { onBookDemo: () => void }) {
  // Prices and wording an admin can change in Admin › Clinic plans
  const { plans: CLINIC_PLANS, includes: CLINIC_PLAN_INCLUDES, excludes: CLINIC_PLAN_EXCLUDES } = useClinicPlans();
  return (
    <section className="px-4 pb-20 sm:px-6 lg:pb-28">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-xl text-[30px] font-bold leading-[1.1] tracking-tight text-rh-ink sm:text-[40px]">Plans</h2>
        <p className="mt-3 max-w-xl text-base font-medium leading-relaxed text-rh-ink/70">
          A monthly subscription for your whole team. Rehabify takes nothing from what your patients pay you.
        </p>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {CLINIC_PLANS.map((plan) => (
            <article
              key={plan.id}
              className={cn("flex flex-col rounded-[2rem] p-7 sm:p-8", plan.featured ? "bg-rh-ink text-white" : "bg-white text-rh-ink")}
            >
              <h3 className="text-[22px] font-bold tracking-tight">{plan.name}</h3>
              <p className="mt-4 text-[34px] font-bold leading-none tracking-tight">{plan.price}</p>
              <p className={cn("mt-1 text-sm", plan.featured ? "text-white/60" : "text-rh-ink/55")}>{plan.priceNote}</p>
              <ul className="mt-6 space-y-2.5">
                {plan.features.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[15px] font-medium">
                    <Check className={cn("mt-1 h-3.5 w-3.5 shrink-0", plan.featured ? "text-rh-lime" : "text-rh-ink")} />
                    {line}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-5 grid gap-5 rounded-[2rem] bg-white p-7 sm:p-9 lg:grid-cols-[1.4fr_1fr] lg:gap-12">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-rh-ink">Included in every plan</h3>
            <ul className="mt-4 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {CLINIC_PLAN_INCLUDES.map((item) => (
                <li key={item} className="flex gap-2.5 text-[15px] font-medium text-rh-ink/80">
                  <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-rh-ink" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4 text-[15px] font-medium leading-relaxed text-rh-ink/70">
            <p>{CLINIC_PROGRAMME_OVERAGE}</p>
            {CLINIC_PLAN_EXCLUDES.length > 0 && <p>Not included: {CLINIC_PLAN_EXCLUDES.join(", ")}.</p>}
            <p>Prices exclude VAT.</p>
            <button
              type="button"
              onClick={onBookDemo}
              className="font-semibold text-rh-ink underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
            >
              Book a demo to choose the right plan
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ClinicsPage() {
  const [demoOpen, setDemoOpen] = useState(false);
  return (
    <>
      <PlatformPageLayout
        title="Your team, patients and payments in one place."
        description="Set up your clinic, bring in your clinicians and keep every appointment and invoice together."
        features={FEATURES}
        featuresTitle="What your clinic gets"
        primaryAction={{ label: "Book a demo", onClick: () => setDemoOpen(true) }}
        secondaryCta={{ label: "Register your clinic", href: "/sign-up?as=clinic_owner" }}
        videoUrl={MARKETING_VIDEOS.clinic}
        videoTitle="Rehabify for clinics"
        image={{
          src: "https://res.cloudinary.com/dubeogufg/image/upload/f_auto,q_auto/v1741105204/IMG_6328_a4bxtu.png",
          alt: "A physiotherapist treating a patient in a clinic",
          unoptimized: true,
        }}
        closingTitle="Bring your clinic onto Rehabify."
        closingText="Book a demo and we’ll walk you through everything."
      >
        <Plans onBookDemo={() => setDemoOpen(true)} />
      </PlatformPageLayout>
      <BookDemoDialog open={demoOpen} onOpenChange={setDemoOpen} />
    </>
  );
}
