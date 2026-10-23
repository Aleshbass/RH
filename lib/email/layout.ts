/**
 * The one look for every Rehabify email: a deep green frame with a big logo on top and a white
 * card for the message (inspired by Kuda's transaction emails). Templates build their body from
 * the blocks below and wrap it with renderEmail().
 *
 * Blocks take HTML strings and do not escape: callers escape anything a person typed (names,
 * notes) before passing it in, as the senders in convex/actions/emails already do. escapeEmailText
 * is here for callers that have raw text.
 *
 * Everything is table-based with inline styles so it holds up in Gmail, Outlook and Apple Mail;
 * the <style> block only tightens spacing on phones.
 */

export const EMAIL_COLORS = {
  ink: "#002e2c",
  brand: "#005b57",
  lime: "#00cd0f",
  text: "#33504d",
  muted: "#5f7f7b",
  line: "#e1ecea",
  panel: "#f2f7f6",
  page: "#e7eeed",
  footerText: "#9dbdb9",
} as const;

const C = EMAIL_COLORS;

/** The hosted logo, recoloured by Cloudinary so "reha" is white on the green frame. */
export const EMAIL_LOGO_ON_DARK =
  "https://res.cloudinary.com/dubeogufg/image/upload/e_replace_color:ffffff:40:005b57,w_1200/v1764254773/MainRehabify_xfzfil.png";

const SITE_URL = "https://physioaroundme.com";
export const SUPPORT_EMAIL = "support@physioaroundme.com";

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

export type EmailTone = "brand" | "success" | "warning" | "danger";

const TONES: Record<EmailTone, { pillBg: string; pillText: string; bg: string; accent: string; title: string; body: string }> = {
  brand: { pillBg: "#e3f1ef", pillText: C.brand, bg: "#eef6f5", accent: C.brand, title: C.ink, body: "#2f4b48" },
  success: { pillBg: "#e2f8e4", pillText: "#0a7a16", bg: "#edfbee", accent: C.lime, title: "#0b5c14", body: "#24452a" },
  warning: { pillBg: "#fff0d4", pillText: "#8a5300", bg: "#fff7e8", accent: "#d98a00", title: "#7a4a00", body: "#5c4210" },
  danger: { pillBg: "#fde7e5", pillText: "#b42318", bg: "#fdf0ef", accent: "#d92d20", title: "#8f1d14", body: "#5f2a25" },
};

/** "21 October 2026" in Lagos time (the sending servers run in UTC). */
export function emailDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString("en-NG", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function escapeEmailText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Blocks ────────────────────────────────────────────────────────────────────

export function paragraph(html: string, opts: { muted?: boolean; size?: number; center?: boolean } = {}): string {
  const size = opts.size ?? 17;
  return `<p style="margin:0 0 18px;font-family:${FONT};font-size:${size}px;line-height:1.65;color:${opts.muted ? C.muted : C.text};${opts.center ? "text-align:center;" : ""}">${html}</p>`;
}

export function greeting(name?: string): string {
  return paragraph(`Hello ${name ? `<strong style="color:${C.ink};">${name}</strong>` : "there"},`);
}

export function heading(html: string): string {
  return `<h2 style="margin:30px 0 14px;font-family:${FONT};font-size:19px;line-height:1.3;font-weight:700;color:${C.ink};">${html}</h2>`;
}

/** Bulletproof pill button. Primary is lime on ink; secondary is an outline. */
export function button(label: string, href: string, variant: "primary" | "secondary" | "dark" = "primary"): string {
  const styles = {
    primary: { bg: C.lime, text: C.ink, border: C.lime },
    secondary: { bg: "#ffffff", text: C.brand, border: C.brand },
    dark: { bg: C.ink, text: "#ffffff", border: C.ink },
  }[variant];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td align="center" bgcolor="${styles.bg}" style="border-radius:999px;background:${styles.bg};border:2px solid ${styles.border};"><a href="${href}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:${styles.text};text-decoration:none;border-radius:999px;">${label}</a></td></tr></table>`;
}

/** One or more buttons, stacked and centred (stacking keeps them full-size on phones). */
export function actions(...buttons: string[]): string {
  const rows = buttons.filter(Boolean).map((b) => `<tr><td align="center" class="rh-btn" style="padding:6px 0;">${b}</td></tr>`).join("");
  return rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 26px;">${rows}</table>` : "";
}

/** Label/value rows in a soft panel. Values are HTML; rows with an empty value are skipped. */
export function details(rows: Array<[label: string, value: string | undefined | null | false]>): string {
  const shown = rows.filter(([, value]) => value !== undefined && value !== null && value !== false && value !== "");
  const cells = shown
    .map(([label, value], i) => {
      const border = i < shown.length - 1 ? `border-bottom:1px solid ${C.line};` : "";
      return `<tr><td style="padding:15px 22px;${border}"><div style="font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${label}</div><div style="margin-top:5px;font-family:${FONT};font-size:16px;line-height:1.45;font-weight:600;color:${C.ink};word-break:break-word;">${value}</div></td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="margin:6px 0 26px;background:${C.panel};border-radius:18px;">${cells}</table>`;
}

/** The big number of the email (an amount, a date, a code), on an ink card like the header. */
export function highlight(opts: { label: string; value: string; sub?: string; mono?: boolean }): string {
  const valueFont = opts.mono ? `${MONO};letter-spacing:0.12em` : `${FONT};letter-spacing:-0.02em`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ink}" style="margin:6px 0 28px;background:${C.ink};border-radius:20px;"><tr><td align="center" style="padding:28px 22px;">
<div style="font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${C.lime};">${opts.label}</div>
<div class="rh-highlight" style="margin-top:10px;font-family:${valueFont};font-size:${opts.mono ? 30 : 34}px;line-height:1.15;font-weight:800;color:#ffffff;word-break:break-word;">${opts.value}</div>
${opts.sub ? `<div style="margin-top:8px;font-family:${FONT};font-size:15px;line-height:1.5;color:${C.footerText};">${opts.sub}</div>` : ""}
</td></tr></table>`;
}

export function callout(tone: EmailTone, title: string | undefined, html: string): string {
  const t = TONES[tone];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.bg}" style="margin:6px 0 26px;background:${t.bg};border-radius:16px;"><tr><td width="5" bgcolor="${t.accent}" style="width:5px;background:${t.accent};border-radius:16px 0 0 16px;font-size:0;line-height:0;">&nbsp;</td><td style="padding:18px 22px;">
${title ? `<div style="margin:0 0 6px;font-family:${FONT};font-size:15px;font-weight:700;color:${t.title};">${title}</div>` : ""}
<div style="font-family:${FONT};font-size:15px;line-height:1.6;color:${t.body};">${html}</div>
</td></tr></table>`;
}

/** A quoted personal note (from a clinic owner, physio, etc.). */
export function quote(html: string, from?: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;"><tr><td style="padding:4px 0 4px 20px;border-left:3px solid ${C.lime};">
<div style="font-family:${FONT};font-size:17px;line-height:1.6;font-style:italic;color:${C.ink};">&ldquo;${html}&rdquo;</div>
${from ? `<div style="margin-top:8px;font-family:${FONT};font-size:14px;color:${C.muted};">&mdash; ${from}</div>` : ""}
</td></tr></table>`;
}

/** Ticked list. */
export function checklist(items: string[]): string {
  const rows = items
    .map(
      (item) =>
        `<tr><td width="30" valign="top" style="padding:0 0 12px;"><div style="width:22px;height:22px;border-radius:11px;background:${C.lime};color:${C.ink};font-family:${FONT};font-size:13px;font-weight:800;line-height:22px;text-align:center;">&#10003;</div></td><td valign="top" style="padding:1px 0 12px;font-family:${FONT};font-size:16px;line-height:1.5;color:${C.text};">${item}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;">${rows}</table>`;
}

/** Numbered steps. */
export function steps(items: string[]): string {
  const rows = items
    .map(
      (item, i) =>
        `<tr><td width="38" valign="top" style="padding:0 0 14px;"><div style="width:28px;height:28px;border-radius:14px;background:${C.ink};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:700;line-height:28px;text-align:center;">${i + 1}</div></td><td valign="top" style="padding:4px 0 14px;font-family:${FONT};font-size:16px;line-height:1.5;color:${C.text};">${item}</td></tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;">${rows}</table>`;
}

export function bulletList(items: string[]): string {
  return `<ul style="margin:0 0 20px;padding-left:22px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.text};">${items.map((i) => `<li style="margin:0 0 6px;">${i}</li>`).join("")}</ul>`;
}

/** "Button not working?" with the raw link. `url` must already be escaped. */
export function linkFallback(url: string, label = "Button not working? Copy this link into your browser:"): string {
  return `<p style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted};">${label}</p>
<p style="margin:0 0 22px;font-family:${MONO};font-size:13px;line-height:1.5;word-break:break-all;"><a href="${url}" target="_blank" style="color:${C.brand};text-decoration:underline;">${url}</a></p>`;
}

export function qrCode(imageUrl: string, caption: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background:${C.panel};border-radius:20px;"><tr><td align="center" style="padding:20px;">
<img src="${imageUrl}" alt="QR code" width="180" height="180" style="display:block;width:180px;height:180px;border:0;border-radius:10px;background:#ffffff;" />
<div style="margin-top:12px;font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted};">${caption}</div>
</td></tr></table>
</td></tr></table>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0;"><tr><td style="border-top:1px solid ${C.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

export function statusPill(text: string, tone: EmailTone = "brand"): string {
  const t = TONES[tone];
  return `<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${t.pillBg};color:${t.pillText};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${text}</span>`;
}

export function link(label: string, href: string): string {
  return `<a href="${href}" target="_blank" style="color:${C.brand};font-weight:700;text-decoration:underline;">${label}</a>`;
}

// ── Layout ────────────────────────────────────────────────────────────────────

export interface EmailLayoutOptions {
  /** Big title in the card. HTML. */
  title: string;
  /** Inbox preview line. Plain text. */
  preheader?: string;
  /** Small label above the title. */
  eyebrow?: string;
  tone?: EmailTone;
  /** Card content, built from the blocks above. */
  body: string;
  /** Sign-off under the body. Defaults to "Warmly, The Rehabify Team"; false hides it. */
  signOff?: string | false;
  /** The "is this really from Rehabify?" note. On for anything that reaches patients or physios. */
  safetyNote?: boolean;
  /** Why the reader got this email, shown in the footer. */
  footerNote?: string;
}

export function renderEmail(opts: EmailLayoutOptions): string {
  const tone = TONES[opts.tone ?? "brand"];
  const signOff =
    opts.signOff === false
      ? ""
      : `<p style="margin:30px 0 0;font-family:${FONT};font-size:17px;line-height:1.6;color:${C.text};">${opts.signOff ?? `Warmly,<br><strong style="color:${C.ink};">The Rehabify Team</strong>`}</p>`;
  const safety =
    opts.safetyNote === false
      ? ""
      : `${divider()}<p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.65;color:${C.muted};">Not sure an email is really from Rehabify? We will never ask for your password, card PIN or OTP. If anything looks off, write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${C.brand};text-decoration:underline;">${SUPPORT_EMAIL}</a>.</p>`;
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.page};">${escapeEmailText(opts.preheader)}${"&nbsp;&zwnj;".repeat(60)}</div>`
    : "";
  const eyebrow = opts.eyebrow
    ? `<div style="margin:0 0 16px;text-align:center;"><span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${tone.pillBg};color:${tone.pillText};font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">${opts.eyebrow}</span></div>`
    : "";
  const plainTitle = opts.title.replace(/<[^>]+>/g, "");
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${plainTitle}</title>
<style>
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; }
  a { text-decoration-skip-ink:auto; }
  @media only screen and (max-width:620px) {
    .rh-outer { padding:0 !important; }
    .rh-frame { border-radius:0 !important; }
    .rh-logo-cell { padding:44px 24px 34px !important; }
    .rh-logo { width:250px !important; }
    .rh-card-wrap { padding:0 12px !important; }
    .rh-card { padding:34px 22px 30px !important; }
    .rh-title { font-size:27px !important; }
    .rh-highlight { font-size:28px !important; }
    .rh-footer { padding:30px 24px 40px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" class="rh-outer" style="padding:36px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ink}" class="rh-frame" style="width:100%;max-width:600px;background:${C.ink};border-radius:28px;">
    <tr><td align="center" class="rh-logo-cell" style="padding:60px 40px 46px;">
      <a href="${SITE_URL}" target="_blank" style="text-decoration:none;"><img src="${EMAIL_LOGO_ON_DARK}" alt="Rehabify" width="380" class="rh-logo" style="display:block;width:380px;max-width:100%;height:auto;border:0;outline:none;color:#ffffff;font-family:${FONT};font-size:44px;font-weight:800;" /></a>
    </td></tr>
    <tr><td class="rh-card-wrap" style="padding:0 26px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background:#ffffff;border-radius:22px;">
        <tr><td class="rh-card" style="padding:46px 42px 38px;">
          ${eyebrow}
          <h1 class="rh-title" style="margin:0 0 28px;font-family:${FONT};font-size:32px;line-height:1.18;font-weight:800;letter-spacing:-0.02em;color:${C.ink};text-align:center;">${opts.title}</h1>
          ${opts.body}
          ${signOff}
          ${safety}
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" class="rh-footer" style="padding:34px 40px 44px;">
      <p style="margin:0 0 14px;font-family:${FONT};font-size:14px;font-weight:700;">
        <a href="${SITE_URL}" target="_blank" style="color:#ffffff;text-decoration:none;">Website</a>
        <span style="color:${C.brand};">&nbsp;&nbsp;&bull;&nbsp;&nbsp;</span>
        <a href="${SITE_URL}/support" target="_blank" style="color:#ffffff;text-decoration:none;">Help</a>
        <span style="color:${C.brand};">&nbsp;&nbsp;&bull;&nbsp;&nbsp;</span>
        <a href="${SITE_URL}/privacy-policy" target="_blank" style="color:#ffffff;text-decoration:none;">Privacy</a>
      </p>
      ${opts.footerNote ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.footerText};">${opts.footerNote}</p>` : ""}
      <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.footerText};">&copy; ${year} Rehabify Health. Physiotherapy care, wherever you are.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
