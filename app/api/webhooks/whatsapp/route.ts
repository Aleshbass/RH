import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const runtime = "nodejs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;

/**
 * Extract tracking code from incoming WhatsApp text.
 * Matches:
 *  - START RHB-95942
 *  - START RHB-95942 - Hello Joy...
 *  - REHAB_REF_RHB-95942
 *  - RHB-95942
 */
function extractTrackingCode(text?: string): string | null {
  if (!text) return null;
  const cleanPunctuation = (val: string) => val.replace(/[.,!?;:()]+$/, "").trim().toUpperCase();

  const startMatch = text.match(/START\s+([A-Za-z0-9_-]+)/i);
  if (startMatch) return cleanPunctuation(startMatch[1]);

  const refMatch = text.match(/REHAB_REF_([A-Za-z0-9_-]+)/i);
  if (refMatch) return cleanPunctuation(refMatch[1]);

  const sentenceMatch = text.match(/(?:tracking|referral)\s+code\s+(?:is\s+)?[:#]?\s*([A-Za-z0-9_-]+)/i);
  if (sentenceMatch) return cleanPunctuation(sentenceMatch[1]);

  const rhbMatch = text.match(/\b(RHB-[A-Za-z0-9_-]+)\b/i);
  if (rhbMatch) return cleanPunctuation(rhbMatch[1]);

  return null;
}

/**
 * Normalizes phone number into E.164 format.
 */
function normalizePhone(rawPhone?: string): string {
  if (!rawPhone) return "";
  const cleaned = rawPhone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("234")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+234${cleaned.slice(1)}`;
  return `+${cleaned}`;
}

/**
 * GET - Meta WhatsApp Webhook verification
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "rehabify_whatsapp_verify_token";

  if (mode === "subscribe" && token === expectedToken) {
    console.log("[WhatsApp Webhook] Verification successful");
    return new Response(challenge || "", { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/**
 * POST - Inbound WhatsApp message processor
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    let senderPhone = "";
    let senderName = "";
    let messageText = "";
    let explicitTrackingCode = "";

    // 1. Check for Meta Cloud API format
    if (body.object === "whatsapp_business_account" && Array.isArray(body.entry)) {
      const entry = body.entry[0];
      const change = entry?.changes?.[0]?.value;
      const contact = change?.contacts?.[0];
      const message = change?.messages?.[0];

      if (message) {
        senderPhone = message.from || "";
        senderName = contact?.profile?.name || "";
        if (message.type === "text") {
          messageText = message.text?.body || "";
        } else if (message.type === "button") {
          messageText = message.button?.text || message.button?.payload || "";
        } else if (message.type === "interactive") {
          messageText = message.interactive?.button_reply?.title || message.interactive?.button_reply?.id || "";
        }
      }
    } else {
      // 2. Direct / simulated webhook format
      senderPhone = body.from || body.phone || body.sender || "";
      senderName = body.name || body.sender_name || "";
      messageText = body.text || body.message || body.body || "";
      explicitTrackingCode = body.tracking_code || body.trackingCode || "";
    }

    const normalizedSender = normalizePhone(senderPhone);
    const trackingCode = explicitTrackingCode || extractTrackingCode(messageText);

    console.log("[WhatsApp Webhook] Incoming message:", {
      from: normalizedSender,
      trackingCode,
      messagePreview: messageText.slice(0, 100),
    });

    if (!convex) {
      console.error("[WhatsApp Webhook] Convex client not initialized - missing NEXT_PUBLIC_CONVEX_URL");
      return NextResponse.json({ status: "error", message: "Convex client not initialized" }, { status: 500 });
    }

    if (!normalizedSender) {
      return NextResponse.json({ status: "ignored", message: "No sender phone found in payload" }, { status: 200 });
    }

    // If tracking code is found, link directly to referral
    if (trackingCode) {
      const linkResult = await convex.mutation(api.joyIntegration.linkTrackingCodeToWhatsApp, {
        trackingCode,
        phone: normalizedSender,
        joyPersonId: normalizedSender.replace(/\D/g, ""),
        name: senderName || undefined,
        message: messageText || undefined,
      });

      console.log("[WhatsApp Webhook] Link result:", linkResult);

      return NextResponse.json({
        status: "ok",
        linked: linkResult.success,
        trackingCode,
        referralStatus: linkResult.status,
        patientId: linkResult.patientId,
      });
    }

    // Even if no tracking code was in the message, check if this phone number
    // resolves to an existing patient or pending referral
    const resolveResult = await convex.mutation(api.joyIntegration.linkTrackingCodeToWhatsApp, {
      trackingCode: "", // empty will fall through or fail gracefully
      phone: normalizedSender,
      joyPersonId: normalizedSender.replace(/\D/g, ""),
      name: senderName || undefined,
      message: messageText || undefined,
    }).catch(() => null);

    return NextResponse.json({
      status: "ok",
      processed: true,
      phone: normalizedSender,
      trackingCodeFound: false,
      result: resolveResult,
    });
  } catch (error: any) {
    console.error("[WhatsApp Webhook] Error processing message:", error);
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }
}
