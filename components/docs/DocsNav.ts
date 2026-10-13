export interface DocNavItem {
  title: string;
  href: string;
  badge?: string;
  /** Short summary, also used by the search modal for instant local matching. */
  description?: string;
}

export interface DocNavGroup {
  title: string;
  items: DocNavItem[];
}

export const DOCS_NAV_GROUPS: DocNavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Introduction",
        href: "/docs",
        description: "What the Partner Platform is, the three integration options, environments and key URLs.",
      },
    ],
  },
  {
    title: "Getting Started",
    items: [
      {
        title: "Getting started",
        href: "/docs/getting-started",
        description: "From partner application to sandbox, production access and live referrals.",
      },
      {
        title: "Quickstart",
        href: "/docs/getting-started/quickstart",
        description: "Create a sandbox referral, read it back, receive a webhook, then go live.",
      },
      {
        title: "Authentication",
        href: "/docs/getting-started/authentication",
        description: "Secret API keys, sk_test_ and sk_live_, rotation, revocation and production access.",
      },
      {
        title: "Conventions",
        href: "/docs/getting-started/conventions",
        description: "Pagination, idempotency, rate limits, timestamps, kobo amounts and request IDs.",
      },
      {
        title: "Errors",
        href: "/docs/getting-started/errors",
        description: "The error object and every error code, with retry guidance.",
      },
    ],
  },
  {
    title: "API Reference",
    items: [
      {
        title: "Overview",
        href: "/docs/api-reference",
        description: "Base URL, authentication, endpoint list and the OpenAPI specification.",
      },
      {
        title: "Referrals",
        href: "/docs/api-reference/referrals",
        description: "Create, list and retrieve referrals. Referral object, statuses and validation rules.",
      },
      {
        title: "Sessions",
        href: "/docs/api-reference/sessions",
        description: "Appointments for your referrals: scheduled, completed, cancelled and no-show.",
      },
      {
        title: "Progress reports",
        href: "/docs/api-reference/clinical-reports",
        description: "Non-clinical progress report per referral, as JSON or PDF.",
      },
      {
        title: "Providers",
        href: "/docs/api-reference/providers",
        description: "Directory of verified MRTBN-licensed physiotherapists.",
      },
      {
        title: "Referral links",
        href: "/docs/api-reference/referral-links",
        description: "Create and manage no-code referral links, stats and the public lead endpoint.",
      },
      {
        title: "Commercial & commissions",
        href: "/docs/api-reference/commercial-and-commissions",
        description: "Contract terms, earnings summary and the commission ledger.",
      },
      {
        title: "Eligibility",
        href: "/docs/api-reference/eligibility",
        badge: "Soon",
        description: "HMO eligibility checks. Coming soon; sandbox preview only.",
      },
    ],
  },
  {
    title: "Webhooks",
    items: [
      {
        title: "Overview",
        href: "/docs/webhooks",
        description: "Endpoint setup per environment, event envelope, delivery headers and best practices.",
      },
      {
        title: "Event catalog",
        href: "/docs/webhooks/event-catalog",
        description: "Every referral event type with a full example payload.",
      },
      {
        title: "Signature verification",
        href: "/docs/webhooks/signature-verification",
        description: "Verify X-Rehabify-Signature (HMAC-SHA256) in Node.js, Python, PHP and Go.",
      },
      {
        title: "Retry policy",
        href: "/docs/webhooks/retry-policy",
        description: "Retry schedule, at-least-once delivery, ordering and manual resend.",
      },
    ],
  },
  {
    title: "Sandbox & Go-live",
    items: [
      {
        title: "Sandbox & testing",
        href: "/docs/sandbox/testing",
        description: "Magic phone numbers, the advance and trigger-webhook endpoints.",
      },
      {
        title: "Go-live checklist",
        href: "/docs/api-reference/partner-integration-v1",
        description: "What to verify before requesting production access, and how to switch to live.",
      },
    ],
  },
  {
    title: "Guides",
    items: [
      {
        title: "All guides",
        href: "/docs/guides",
        description: "Integration patterns by partner type.",
      },
      {
        title: "No-code referral links",
        href: "/docs/guides/no-code-referral-links",
        description: "Co-branded landing page, consent, 30-day attribution, stats and sandbox links.",
      },
      {
        title: "HMOs & insurers",
        href: "/docs/guides/hmo-integration",
        description: "Refer covered members with HMO direct billing and track utilisation.",
      },
      {
        title: "Hospitals & clinics",
        href: "/docs/guides/hospital-clinic-referral",
        description: "Refer from your EHR, a QR code or the portal, and report back to the referring doctor.",
      },
      {
        title: "Corporate wellness",
        href: "/docs/guides/corporate-wellness",
        description: "Staff campaign links and sponsored referrals with employee privacy.",
      },
      {
        title: "Gyms & fitness recovery",
        href: "/docs/guides/gym-fitness-recovery",
        description: "Reception QR codes, member-app links and trainer referrals.",
      },
    ],
  },
  {
    title: "Widgets & Deep Links",
    items: [
      {
        title: "Overview",
        href: "/docs/sdks-widgets",
        description: "What is available today and what is coming soon.",
      },
      {
        title: "WhatsApp deep links",
        href: "/docs/sdks-widgets/whatsapp-deep-links",
        description: "One-tap Joy links with the referral's tracking code.",
      },
      {
        title: "Embed widget",
        href: "/docs/sdks-widgets/embed-widget",
        badge: "Soon",
        description: "Embeddable JavaScript widget. Coming soon.",
      },
      {
        title: "React components",
        href: "/docs/sdks-widgets/react-component",
        badge: "Soon",
        description: "@rehabify/react component package. Coming soon.",
      },
    ],
  },
];

export const ALL_DOCS_FLAT: DocNavItem[] = DOCS_NAV_GROUPS.flatMap(
  (group) => group.items
);

/** Returns the navigation group that contains the given docs path, if any. */
export function findNavGroup(href: string): DocNavGroup | undefined {
  return DOCS_NAV_GROUPS.find((group) => group.items.some((item) => item.href === href));
}
