/**
 * Marketing emails from Admin › Email campaigns. One renderer for the real send (Convex,
 * convex/actions/marketingSend.ts) and the live preview in the composer, so what admins see is
 * what people get. Everything typed by the admin is escaped.
 */
import { actions, button, displayName, escapeEmailText, greeting, renderEmail } from "./layout";
import { renderEmailBody } from "./richText";

export type MarketingContent = {
  subject: string;
  previewText?: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
  /** Who "Hello …," names: the person's first name (the default), their clinic's name, or nobody */
  greetBy?: GreetBy;
};

export type GreetBy = "first_name" | "clinic_name" | "none";

/**
 * Tags an admin can type anywhere in the subject, heading or message; each email gets its own
 * (every campaign goes one email per person through Amazon SES). The clinic name is only known
 * for clinic owners, so it works when sending to Clinics or to chosen people (convex/marketing.ts).
 */
export const MERGE_TAGS = { firstName: "{first_name}", clinicName: "{clinic_name}" } as const;
const FIRST_NAME_TAG = /\{\s*first[_ ]name\s*\}/gi;
const CLINIC_NAME_TAG = /\{\s*clinic[_ ]name\s*\}/gi;
export type MergeValues = { firstName?: string; clinicName?: string };

const hasTag = (text: string | undefined, tag: RegExp) => (text ?? "").search(tag) !== -1;

/** The email names the clinic (greeting or a {clinic_name} tag). */
export function usesClinicName(content: MarketingContent) {
  return content.greetBy === "clinic_name" || [content.subject, content.previewText, content.heading, content.body].some((t) => hasTag(t, CLINIC_NAME_TAG));
}

/** The subject has a name tag (only one-by-one sends can fill a subject). */
export function subjectHasMergeTag(content: Pick<MarketingContent, "subject" | "previewText">) {
  return [content.subject, content.previewText].some((t) => hasTag(t, FIRST_NAME_TAG) || hasTag(t, CLINIC_NAME_TAG));
}

/** Plain text (subject, preview text) with the person's own values. */
export function fillMergeTags(text: string, values: MergeValues) {
  return text
    .replace(FIRST_NAME_TAG, () => (values.firstName?.trim() ? displayName(values.firstName) : "there"))
    .replace(CLINIC_NAME_TAG, () => values.clinicName?.trim() || "your clinic");
}

const isHttps = (url?: string) => !!url && /^https:\/\/[^\s"'<>]+$/i.test(url.trim());

export function renderMarketingEmail(
  content: MarketingContent,
  opts: {
    /** The person's first name ("Hello there," when it isn't known) */
    greetingName?: string;
    /** This person's unsubscribe link (convex/helpers/emailLinks.ts); "#" in previews and tests */
    unsubscribeUrl?: string;
    /** Fills {first_name} / {clinic_name} with this person's values */
    merge?: MergeValues;
  } = {}
): string {
  const merge = opts.merge;
  const greetingName =
    content.greetBy === "none"
      ? undefined
      : content.greetBy === "clinic_name"
        ? merge?.clinicName?.trim() || opts.greetingName
        : opts.greetingName;
  const html = renderMarketingHtml(content, { ...opts, greetingName });
  if (!merge) return html;
  // Tags are plain text in the admin's words, so they appear in the HTML as typed
  return html
    .replace(FIRST_NAME_TAG, () => escapeEmailText(merge?.firstName?.trim() ? displayName(merge.firstName) : "there"))
    .replace(CLINIC_NAME_TAG, () => escapeEmailText(merge?.clinicName?.trim() || "your clinic"));
}

function renderMarketingHtml(content: MarketingContent, opts: { greetingName?: string; unsubscribeUrl?: string }): string {
  const image = isHttps(content.imageUrl)
    ? `<img src="${escapeEmailText(content.imageUrl!.trim())}" alt="" width="520" style="display:block;width:100%;max-width:100%;height:auto;border:0;border-radius:16px;margin:0 0 24px;" />`
    : "";
  // Rich text from the editor, or plain text from older campaigns (lib/email/richText.ts)
  const paragraphs = renderEmailBody(content.body);
  const cta =
    content.ctaLabel?.trim() && isHttps(content.ctaUrl)
      ? actions(button(escapeEmailText(content.ctaLabel.trim()), escapeEmailText(content.ctaUrl!.trim())))
      : "";
  const hello = opts.greetingName ? greeting(escapeEmailText(opts.greetingName)) : "";

  return renderEmail({
    title: escapeEmailText(content.heading),
    preheader: content.previewText?.trim() || content.heading,
    body: image + hello + paragraphs + cta,
    safetyNote: false,
    footerNote: opts.unsubscribeUrl
      ? `You're receiving this because you're part of the Rehabify community. <a href="${escapeEmailText(opts.unsubscribeUrl)}" style="color:#ffffff;text-decoration:underline;">Unsubscribe</a>`
      : "You're receiving this email from Rehabify Health.",
  });
}

export type MarketingAudience = "everyone" | "patients" | "physiotherapists" | "clinics" | "partners" | "contacts" | "individual";
export type MarketingSegment = Exclude<MarketingAudience, "everyone" | "individual">;

/** "Everyone" is queued segment by segment, in this order, each person only once. */
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
