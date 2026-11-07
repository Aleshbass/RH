import type { Metadata } from "next";
import { MedicalWebPageSchema } from "@/components/seo/StructuredData";
import { PolicyPage } from "@/components/legal/PolicyPage";
import {
  consultationBookingPolicy,
  consultationBookingPolicyIntro,
  consultationBookingPolicySections,
} from "@/lib/joy-integration/consultation-booking-policy";
import { p, table, ul, type LegalDocument } from "@/lib/legal/types";
import { pageMetadata } from "@/lib/seo/utils";

export const metadata: Metadata = pageMetadata({
  title: "Consultation & Booking Policy",
  description:
    "How a Rehabify Care appointment is requested, matched, confirmed and delivered, and what you and your physiotherapist can expect of each other.",
  path: "/consultation-booking-policy",
});

// Joy's canonical policy (the text and version Joy asks patients to accept), shown as a page
const doc: LegalDocument = {
  title: "Consultation and Booking Policy",
  effectiveDate: "6 November 2026",
  version: consultationBookingPolicy.version,
  intro: [p(consultationBookingPolicyIntro)],
  sections: consultationBookingPolicySections.map((section) => ({
    title: section.title,
    blocks: [
      ...section.paragraphs.map((text) => p(text)),
      ...(section.bullets?.length ? [ul(...section.bullets)] : []),
      ...(section.table ? [table([...section.table.head], section.table.rows.map((row) => [...row]))] : []),
      ...(section.after ?? []).map((text) => p(text)),
    ],
  })),
};

export default function ConsultationBookingPolicyPage() {
  return (
    <>
      <MedicalWebPageSchema
        title="Consultation & Booking Policy - Rehabify Health"
        description="How Rehabify Care appointments are requested, matched, confirmed and delivered."
        url={consultationBookingPolicy.url}
      />
      <PolicyPage doc={doc} related={["payment_policy", "privacy", "terms"]} />
    </>
  );
}
