import Link from 'next/link';
import { Building2, Mail, MessageCircle, Send, Users } from '@/components/icons';
import { GENERAL_EMAIL, PARTNER_SUPPORT_EMAIL, SUPPORT_EMAIL } from '@/lib/contact';
import { SITE_CONFIG } from '@/lib/seo/config';
import { pageMetadata } from '@/lib/seo/utils';

export const metadata = pageMetadata({
  title: 'Contact us',
  description:
    'Talk to Rehabify Health: chat with Joy on WhatsApp to book care, email our support team, or reach the partnerships team.',
  path: '/contact',
});

const { whatsappUrl, supportPhone, officeHours } = SITE_CONFIG.organization;

const CHANNELS = [
  {
    icon: MessageCircle,
    title: 'Book care or ask a question',
    body: `Chat with Joy, our care assistant, on WhatsApp (${supportPhone}). Joy can find you a physiotherapist and book your session.`,
    action: { label: 'Chat with Joy', href: `${whatsappUrl}?text=${encodeURIComponent('Hi Joy! I need help with my recovery.')}`, external: true },
  },
  {
    icon: Mail,
    title: 'Support',
    body: `Payments, appointments, your account or anything else. We reply ${officeHours}.`,
    action: { label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}`, external: false },
  },
  {
    icon: Send,
    title: 'General enquiries',
    body: 'Press, careers, agreements and anything for the Rehabify company.',
    action: { label: GENERAL_EMAIL, href: `mailto:${GENERAL_EMAIL}`, external: false },
  },
  {
    icon: Users,
    title: 'Partners and developers',
    body: 'Referral partners, insurers, HMOs and teams integrating with the Rehabify API.',
    action: { label: PARTNER_SUPPORT_EMAIL, href: `mailto:${PARTNER_SUPPORT_EMAIL}`, external: false },
  },
  {
    icon: Building2,
    title: 'Clinics',
    body: 'Run your physiotherapy clinic on Rehabify: scheduling, records, billing and your team.',
    action: { label: 'See Rehabify for clinics', href: '/platform/clinics', external: false },
  },
];

export default function ContactPage() {
  return (
    <main className="bg-rh-canvas px-4 pb-24 pt-[132px] text-rh-ink sm:px-6 sm:pt-40 lg:pt-44">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-[38px] font-bold leading-[1.05] tracking-tight sm:text-6xl">Contact us</h1>
        <p className="mt-4 max-w-xl text-lg text-rh-ink/65">
          The quickest way to book care is Joy on WhatsApp. For anything else, pick the right team below.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHANNELS.map(({ icon: Icon, title, body, action }) => (
            <li key={title} className="flex flex-col rounded-[1.75rem] bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rh-canvas text-rh-ink">
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-rh-ink/65">{body}</p>
              {action.external ? (
                <a
                  href={action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 text-sm font-semibold text-rh-ink underline decoration-rh-lime decoration-2 underline-offset-4 hover:decoration-rh-ink"
                >
                  {action.label}
                </a>
              ) : action.href.startsWith('mailto:') ? (
                <a href={action.href} className="mt-5 break-all text-sm font-semibold text-rh-ink underline decoration-rh-lime decoration-2 underline-offset-4 hover:decoration-rh-ink">
                  {action.label}
                </a>
              ) : (
                <Link href={action.href} className="mt-5 text-sm font-semibold text-rh-ink underline decoration-rh-lime decoration-2 underline-offset-4 hover:decoration-rh-ink">
                  {action.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
