/**
 * Links in campaign emails. Campaigns moved from Resend to Amazon SES on 26 Nov 2026 (owner), so
 * we count opens and clicks and handle unsubscribes ourselves. Each link carries the campaign
 * queue row's id and a short signature, never the email address:
 *
 *   /e/u?r=<row>&t=<sig>          unsubscribe (GET asks to confirm; POST unsubscribes, as does a
 *                                 mail app's one-click POST from the List-Unsubscribe header)
 *   /e/o?r=<row>&t=<sig>          open pixel
 *   /e/c?r=<row>&u=<url>&t=<sig>  click, then on to the link (only links we signed, so it can't
 *                                 be used to send people anywhere else)
 *
 * People see physioaroundme.com links (next.config.mjs passes /e/* on to Convex, convex/http.ts),
 * so they match the sending domain. The one-click header goes straight to Convex.
 * Signed with EMAIL_LINK_SECRET (Convex env). Web Crypto only: runs in any Convex runtime.
 */
import { publicAppUrl } from "./appUrl";

const encoder = new TextEncoder();

function linkSecret() {
  const secret = process.env.EMAIL_LINK_SECRET?.trim();
  if (!secret) throw new Error("EMAIL_LINK_SECRET is not set in Convex.");
  return secret;
}

/** 128-bit HMAC-SHA256, base64url. */
async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(linkSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data))).slice(0, 16);
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const signedData = {
  unsubscribe: (rowId: string) => `u:${rowId}`,
  open: (rowId: string) => `o:${rowId}`,
  click: (rowId: string, url: string) => `c:${rowId}:${url}`,
};

/** Whether `token` is our signature of `data` (constant time). */
export async function signatureOk(data: string, token: string | null): Promise<boolean> {
  if (!token || !process.env.EMAIL_LINK_SECRET?.trim()) return false;
  const expected = await sign(data);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** This person's unsubscribe links and open pixel. */
export async function campaignLinks(rowId: string) {
  const site = publicAppUrl();
  const convexSite = process.env.CONVEX_SITE_URL?.replace(/\/$/, "") || site;
  const query = `r=${encodeURIComponent(rowId)}&t=${await sign(signedData.unsubscribe(rowId))}`;
  return {
    unsubscribeUrl: `${site}/e/u?${query}`,
    oneClickUrl: `${convexSite}/e/u?${query}`,
    openPixelUrl: `${site}/e/o?r=${encodeURIComponent(rowId)}&t=${await sign(signedData.open(rowId))}`,
  };
}

const decodeAttr = (value: string) =>
  value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const encodeAttr = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Every http(s) link in the email goes through /e/c first, except our own /e/ links. */
export async function trackClicks(html: string, rowId: string): Promise<string> {
  const site = publicAppUrl();
  const HREF = /href="(https?:\/\/[^"]+)"/g;
  const swaps = new Map<string, string>();
  for (const [, raw] of html.matchAll(HREF)) {
    if (swaps.has(raw) || raw.startsWith(`${site}/e/`)) continue;
    const url = decodeAttr(raw);
    const tracked = `${site}/e/c?r=${encodeURIComponent(rowId)}&u=${encodeURIComponent(url)}&t=${await sign(signedData.click(rowId, url))}`;
    swaps.set(raw, encodeAttr(tracked));
  }
  return html.replace(HREF, (whole, raw: string) => (swaps.has(raw) ? `href="${swaps.get(raw)}"` : whole));
}

/** The open pixel, just before </body>. */
export function addOpenPixel(html: string, pixelUrl: string): string {
  const img = `<img src="${encodeAttr(pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`;
  return html.includes("</body>") ? html.replace("</body>", () => `${img}</body>`) : html + img;
}
