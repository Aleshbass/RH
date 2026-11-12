/**
 * Marketing emails from Admin › Email campaigns. One renderer for the real send (Convex,
 * convex/actions/marketingSend.ts) and the live preview in the composer, so what admins see is
 * what people get. Everything typed by the admin is escaped.
 */
import { actions, button, escapeEmailText, greeting, renderEmail } from "./layout";
import { renderEmailBody } from "./richText";

export type MarketingContent = {
  subject: string;
  previewText?: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
};

/** Resend fills these in per contact when it sends a Broadcast. */
export const RESEND_UNSUBSCRIBE_URL = "{{{RESEND_UNSUBSCRIBE_URL}}}";
export const RESEND_FIRST_NAME = "{{{FIRST_NAME|there}}}";

const isHttps = (url?: string) => !!url && /^https:\/\/[^\s"'<>]+$/i.test(url.trim());

export function renderMarketingEmail(
  content: MarketingContent,
  opts: {
    /** Plain name, or RESEND_FIRST_NAME for Broadcasts */
    greetingName?: string;
    /** Broadcasts pass RESEND_UNSUBSCRIBE_URL; one-to-one emails have no list to leave */
    unsubscribeUrl?: string;
  } = {}
): string {
  const image = isHttps(content.imageUrl)
    ? `<img src="${escapeEmailText(content.imageUrl!.trim())}" alt="" width="520" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:16px;margin:0 0 24px;" />`
    : "";
  // Rich text from the editor, or plain text from older campaigns (lib/email/richText.ts)
  const paragraphs = renderEmailBody(content.body);
  const cta =
    content.ctaLabel?.trim() && isHttps(content.ctaUrl)
      ? actions(button(escapeEmailText(content.ctaLabel.trim()), escapeEmailText(content.ctaUrl!.trim())))
      : "";
  // The Resend placeholder must stay unescaped so Resend can replace it
  const hello = opts.greetingName
    ? greeting(opts.greetingName === RESEND_FIRST_NAME ? RESEND_FIRST_NAME : escapeEmailText(opts.greetingName))
    : "";

  return renderEmail({
    title: escapeEmailText(content.heading),
    preheader: content.previewText?.trim() || content.heading,
    body: image + hello + paragraphs + cta,
    safetyNote: false,
    footerNote: opts.unsubscribeUrl
      ? `You're receiving this because you're part of the Rehabify community. <a href="${opts.unsubscribeUrl}" style="color:#ffffff;text-decoration:underline;">Unsubscribe</a>`
      : "You're receiving this email from Rehabify Health.",
  });
}

export type MarketingAudience = "everyone" | "patients" | "physiotherapists" | "clinics" | "partners" | "contacts" | "individual";
export type MarketingSegment = Exclude<MarketingAudience, "everyone" | "individual">;

/** "Everyone" is sent as one Broadcast per segment, in this order, each person in only one. */
export const MARKETING_SEGMENTS: MarketingSegment[] = ["patients", "physiotherapists", "clinics", "partners", "contacts"];

export const AUDIENCE_LABEL: Record<MarketingAudience, string> = {
  everyone: "Everyone",
  patients: "Patients",
  physiotherapists: "Physiotherapists",
  clinics: "Clinics",
  partners: "Partners",
  contacts: "Added contacts",
  individual: "One person or a few",
};
