"use node";

import { action } from "../../_generated/server";
import { v } from "convex/values";
import { api } from "../../_generated/api";
import crypto from "crypto";

/**
 * Dispatches a real, cryptographically signed webhook event to a partner's URL.
 * Measures real network latency in milliseconds and logs the complete audit trail
 * to `partnerActivityLogs`.
 * 
 * Features:
 * - Strict secret verification (rejects missing or default 'whsec_default' secrets)
 * - Automatic retry with exponential backoff (attempt 1: immediate, attempt 2: +5s, attempt 3: +30s)
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
    traceId: v.optional(v.string()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currentAttempt = args.attempt || 1;
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const requestId = args.requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const traceId = args.traceId || `trc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Fix #3: Reject unconfigured or weak default secrets
    if (!args.secret || args.secret === "whsec_default" || args.secret.trim() === "") {
      const errorMsg = "Webhook delivery rejected: Webhook secret is not configured or uses insecure default. Please configure a valid signing secret.";
      console.error(`[WEBHOOK DISPATCH] ${errorMsg} for partner ${args.partnerId}`);

      try {
        await ctx.runMutation(api.partners.logPartnerActivity, {
          partnerId: args.partnerId,
          environment: args.environment,
          eventId,
          eventType: args.eventType,
          direction: "outbound",
          url: args.targetUrl,
          method: "POST",
          statusCode: 400,
          latencyMs: 0,
          status: "error",
          trackingCode: args.trackingCode,
          patientName: args.patientName,
          requestId,
          traceId,
          requestHeaders: {},
          requestPayload: args.payload,
          responsePayload: { error: errorMsg },
          errorMessage: errorMsg,
          occurredAt: Date.now(),
        });
      } catch (logErr) {
        console.error("Failed to log partner webhook activity for rejected secret:", logErr);
      }

      return {
        success: false,
        statusCode: 400,
        latencyMs: 0,
        eventId,
        requestId,
        traceId,
        deliveredTo: args.targetUrl,
        timestamp,
        attempt: currentAttempt,
        retryScheduled: false,
        payload: args.payload,
        responsePayload: { error: errorMsg },
        errorMessage: errorMsg,
      };
    }

    const serializedPayload = JSON.stringify(args.payload);

    // Compute canonical HMAC SHA-256 signature
    const signatureHash = crypto
      .createHmac("sha256", args.secret)
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
      "X-Rehabify-Delivery-Attempt": String(currentAttempt),
      "X-Rehabify-Request-Id": requestId,
      "X-Rehabify-Trace-Id": traceId,
    };

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

    // Fix #4: Retry logic with backoff (attempt 1 -> wait 5s -> attempt 2 -> wait 30s -> attempt 3)
    let retryScheduled = false;
    if (!isSuccess && currentAttempt < 3) {
      const nextAttempt = currentAttempt + 1;
      const delayMs = currentAttempt === 1 ? 5000 : 30000;
      retryScheduled = true;
      errorMessage = `${errorMessage || "Delivery failed"} (Attempt ${currentAttempt}/3. Retrying in ${delayMs / 1000}s...)`;

      try {
        await ctx.scheduler.runAfter(
          delayMs,
          api["actions/partners/dispatchWebhook"].dispatchWebhookEvent,
          {
            partnerId: args.partnerId,
            environment: args.environment,
            eventType: args.eventType,
            targetUrl: args.targetUrl,
            secret: args.secret,
            payload: args.payload,
            trackingCode: args.trackingCode,
            patientName: args.patientName,
            requestId,
            traceId,
            attempt: nextAttempt,
          }
        );
      } catch (schedErr) {
        console.error("[WEBHOOK DISPATCH] Failed to schedule retry attempt:", schedErr);
      }
    } else if (!isSuccess && currentAttempt >= 3) {
      errorMessage = `${errorMessage || "Delivery failed"} (All 3 delivery attempts exhausted)`;
    }

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
        requestId,
        traceId,
        requestHeaders: headers,
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
      requestId,
      traceId,
      deliveredTo: args.targetUrl,
      timestamp,
      attempt: currentAttempt,
      retryScheduled,
      payload: args.payload,
      responsePayload,
      errorMessage,
    };
  },
});
