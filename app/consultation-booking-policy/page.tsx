import type { Metadata } from "next";
import Link from "next/link";
import { MedicalWebPageSchema } from "@/components/seo/StructuredData";
import {
  consultationBookingPolicy,
  consultationBookingPolicySections,
} from "@/lib/joy-integration/consultation-booking-policy";

export const metadata: Metadata = {
  title: "Consultation & Booking Policy | Rehabify Health",
  description: "How Rehabify and Joy arrange physiotherapy consultations, booking, payments, provider responses, and online appointments.",
};

export default function ConsultationBookingPolicyPage() {
  return (
    <>
      <MedicalWebPageSchema
        title="Consultation & Booking Policy - Rehabify Health"
        description="The current terms for physiotherapy consultation matching and bookings arranged through Joy and Rehabify."
        url={consultationBookingPolicy.url}
      />

      <main className="min-h-screen bg-gray-50 py-12">
        <article className="mx-auto max-w-4xl px-6">
          <header className="mb-8 rounded-lg bg-white p-8 shadow-sm">
            <h1 className="mb-4 text-4xl font-bold text-[#005b57]">Consultation &amp; Booking Policy</h1>
            <div className="flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:items-center sm:gap-4">
              <p><strong>Version:</strong> {consultationBookingPolicy.version}</p>
              <span className="hidden sm:block">•</span>
              <p><strong>Effective date:</strong> September 22, 2026</p>
            </div>
            <p className="mt-5 text-gray-700">
              This is the policy presented by Joy before you request a physiotherapy booking.
            </p>
          </header>

          <div className="rounded-lg bg-white p-8 shadow-sm">
            {consultationBookingPolicySections.map((section) => (
              <section key={section.title} className="mb-8 last:mb-0">
                <h2 className="mb-4 text-2xl font-bold text-[#005b57]">{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mb-4 leading-relaxed text-gray-700">{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul className="list-disc space-y-2 pl-6 text-gray-700">
                    {section.bullets.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </section>
            ))}

            <div className="mt-8 border-t border-gray-200 pt-6 text-sm text-gray-600">
              <p>
                Also see our <Link className="text-[#005b57] underline" href="/payment-policy">Payment Policy</Link>{" "}
                and <Link className="text-[#005b57] underline" href="/privacy-policy">Privacy Policy</Link>.
              </p>
            </div>
          </div>
        </article>
      </main>
    </>
  );
}
