import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { callJoyConvexGateway } from "@/lib/joy-integration/convex-gateway";

export const runtime = "nodejs";

/**
 * Meta WhatsApp Cloud API webhook (optional direct channel; Joy normally links
 * referrals through the authenticated /api/v1/joy/referrals/link route).
 *
 * Security: every POST must carry Meta's X-Hub-Signature-256 (HMAC-SHA256 of the raw
 * body with WHATSAPP_APP_SECRET). Without the secret configured the endpoint refuses
 * all messages. Linking goes through the HMAC-signed Joy gateway and the response
 * never contains patient identifiers.
 */

function extractTrackingCode(text?: string): string | null {
  if (!text) return null;
  const match = text.match(/\bRHB\s*[-–—]?\s*(\d{4,16})\b/i);
  return match ? `RHB-${match[1]}` : null;
}

function normalizePhone(rawPhone?: string): string {
  if (!rawPhone) return "";
  const cleaned = rawPhone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("234")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+234${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

function validSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"));
  const actual = Buffer.from(header.slice("sha256=".length));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Meta webhook verification handshake. */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expectedToken && searchParams.get("hub.mode") === "subscribe" && searchParams.get("hub.verify_token") === expectedToken) {
    return new Response(searchParams.get("hub.challenge") || "", { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  if (!process.env.WHATSAPP_APP_SECRET) {
    return NextResponse.json({ error: "WhatsApp webhook is not configured" }, { status: 503 });
  }
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const change = body?.object === "whatsapp_business_account" ? body.entry?.[0]?.changes?.[0]?.value : null;
  const message = change?.messages?.[0];
  if (!message) return NextResponse.json({ status: "ignored" }, { status: 200 });

  const senderPhone = normalizePhone(message.from);
  const senderName: string = change?.contacts?.[0]?.profile?.name || "";
  const text: string =
    message.type === "text"
      ? message.text?.body || ""
      : message.type === "button"
        ? message.button?.text || message.button?.payload || ""
        : message.interactive?.button_reply?.title || "";
  const trackingCode = extractTrackingCode(text);
  if (!senderPhone || !trackingCode) return NextResponse.json({ status: "ok", linked: false }, { status: 200 });

  try {
    const result = (await callJoyConvexGateway("link_referral", {
      tracking_code: trackingCode,
      phone: senderPhone,
      joy_person_id: senderPhone.replace(/\D/g, ""),
      name: senderName || undefined,
      message: text.slice(0, 2000) || undefined,
    })) as { success?: boolean };
    return NextResponse.json({ status: "ok", linked: Boolean(result?.success) }, { status: 200 });
  } catch (error) {
    console.error("[WhatsApp Webhook] link failed", error instanceof Error ? error.message : error);
    // 500 so Meta retries delivery.
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
