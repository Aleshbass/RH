export interface DocNavItem {
  title: string;
  href: string;
  badge?: string;
}

export interface DocNavGroup {
  title: string;
  items: DocNavItem[];
}

export const DOCS_NAV_GROUPS: DocNavGroup[] = [
  {
    title: "Overview",
    items: [
      { title: "Introduction", href: "/docs" },
    ],
  },
  {
    title: "Getting Started",
    items: [
      { title: "Quickstart (5 Mins)", href: "/docs/getting-started/quickstart" },
      { title: "Authentication", href: "/docs/getting-started/authentication" },
      { title: "Error Handling", href: "/docs/getting-started/errors" },
    ],
  },
  {
    title: "API Reference v1.0",
    items: [
      {
        title: "Partner Integration v1.0",
        href: "/docs/api-reference/partner-integration-v1",
        badge: "Contract v1",
      },
      { title: "API Reference Overview", href: "/docs/api-reference" },
      { title: "Referrals API", href: "/docs/api-reference/referrals" },
      { title: "HMO Eligibility API", href: "/docs/api-reference/eligibility" },
      { title: "Verified Providers API", href: "/docs/api-reference/providers" },
      { title: "Sessions API", href: "/docs/api-reference/sessions" },
      { title: "Clinical Reports API", href: "/docs/api-reference/clinical-reports" },
    ],
  },
  {
    title: "Webhooks & Events",
    items: [
      { title: "Webhooks Overview", href: "/docs/webhooks" },
      { title: "Signature Verification", href: "/docs/webhooks/signature-verification" },
      { title: "Event Catalog", href: "/docs/webhooks/event-catalog" },
      { title: "Retry Policy", href: "/docs/webhooks/retry-policy" },
    ],
  },
  {
    title: "SDKs & Drop-ins",
    items: [
      { title: "SDKs Overview", href: "/docs/sdks-widgets" },
      { title: "Drop-in Embed Widget", href: "/docs/sdks-widgets/embed-widget" },
      { title: "React Component", href: "/docs/sdks-widgets/react-component" },
      { title: "WhatsApp Deep-Links", href: "/docs/sdks-widgets/whatsapp-deep-links" },
    ],
  },
  {
    title: "Partner Solutions",
    items: [
      { title: "HMO Pre-Auth Guide", href: "/docs/guides/hmo-integration" },
      { title: "Hospital & Clinic Referrals", href: "/docs/guides/hospital-clinic-referral" },
      { title: "Corporate Wellness", href: "/docs/guides/corporate-wellness" },
      { title: "Gym & Fitness Recovery", href: "/docs/guides/gym-fitness-recovery" },
    ],
  },
  {
    title: "Testing & Sandbox",
    items: [
      { title: "Interactive Sandbox", href: "/docs/sandbox/testing" },
    ],
  },
];

export const ALL_DOCS_FLAT: DocNavItem[] = DOCS_NAV_GROUPS.flatMap(
  (group) => group.items
);
