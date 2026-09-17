"use node";

import { action } from "../../_generated/server";
import { v } from "convex/values";
import { api } from "../../_generated/api";
import crypto from "crypto";

/**
 * Dispatches a real, cryptographically signed webhook event to a partner's URL.
 * Measures real network latency in milliseconds and logs the complete audit trail
 * to `partnerActivityLogs`.
 */
export const dispatchWebhookEvent = action({
  args: {
    partnerId: v.string(),
    environment: v.union(v.literal("sandbox"), v.literal("live")),
    eventType: v.string(),
    targetUrl: v.string(),
    secret: v.string(),
    payload: v.any(),
    trackingCode: v.optional(v.string()),
    patientName: v.optional(v.string()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const serializedPayload = JSON.stringify(args.payload);

    // Compute canonical HMAC SHA-256 signature
    const signatureHash = crypto
      .createHmac("sha256", args.secret || "whsec_default")
      .update(`${timestamp}.${serializedPayload}`)
      .digest("hex");
    const signatureHeader = `t=${timestamp},v1=${signatureHash}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Rehabify-Webhook/2.0",
      "X-Rehabify-Event-Id": eventId,
      "X-Rehabify-Timestamp": String(timestamp),
      "X-Rehabify-Signature": signatureHeader,
      "X-Rehabify-Environment": args.environment,
    };

    if (args.requestId) {
      headers["X-Rehabify-Request-Id"] = args.requestId;
    }

    const startTime = Date.now();
    let statusCode = 0;
    let responsePayload: any = null;
    let errorMessage: string | undefined = undefined;
    let isSuccess = false;

    try {
      // Real HTTP POST with 10-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(args.targetUrl, {
        method: "POST",
        headers,
        body: serializedPayload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      statusCode = res.status;
      isSuccess = res.ok;

      const rawText = await res.text();
      try {
        responsePayload = JSON.parse(rawText);
      } catch {
        responsePayload = { body: rawText.slice(0, 1000) };
      }

      if (!res.ok) {
        errorMessage = `Webhook endpoint returned HTTP ${res.status}: ${res.statusText}`;
      }
    } catch (err: any) {
      statusCode = err.name === "AbortError" ? 504 : 502;
      errorMessage = err.name === "AbortError"
        ? "Webhook delivery timed out after 10,000ms"
        : `Network delivery failure: ${err.message || String(err)}`;
      responsePayload = { error: errorMessage };
    }

    const latencyMs = Math.max(1, Date.now() - startTime);

    // Record immutable audit entry in partnerActivityLogs
    try {
      await ctx.runMutation(api.partners.logPartnerActivity, {
        partnerId: args.partnerId,
        environment: args.environment,
        eventId,
        eventType: args.eventType,
        direction: "outbound",
        url: args.targetUrl,
        method: "POST",
        statusCode,
        latencyMs,
        status: isSuccess ? "success" : "error",
        trackingCode: args.trackingCode,
        patientName: args.patientName,
        requestId: args.requestId,
        requestHeaders: {
          "Content-Type": "application/json",
          "X-Rehabify-Event-Id": eventId,
          "X-Rehabify-Signature": `t=${timestamp},v1=...`,
          "X-Rehabify-Environment": args.environment,
        },
        requestPayload: args.payload,
        responsePayload,
        errorMessage,
        occurredAt: Date.now(),
      });
    } catch (logErr) {
      console.error("Failed to log partner webhook activity:", logErr);
    }

    return {
      success: isSuccess,
      statusCode,
      latencyMs,
      eventId,
      deliveredTo: args.targetUrl,
      timestamp,
      payload: args.payload,
      responsePayload,
      errorMessage,
    };
  },
});
