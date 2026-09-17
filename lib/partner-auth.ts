import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

export interface AuthenticatedPartner {
  name: string;
  code: string;
  type: string;
  tier: string;
  isSandbox: boolean;
  environment: "sandbox" | "live";
  keyPrefix?: string;
  keyId?: string;
}

export interface PartnerAuthResult {
  partner: AuthenticatedPartner | null;
  requestId: string;
  traceId: string;
  response?: NextResponse;
}

/**
 * Authenticates partner requests via Authorization: Bearer <key> or X-API-Key: <key>.
 * Resolves environment ("sandbox" vs "live"), updates key last used timestamp,
 * and attaches standard enterprise request/trace IDs.
 */
export async function authenticatePartner(
  req: NextRequest
): Promise<PartnerAuthResult> {
  const requestId =
    req.headers.get("x-request-id") ||
    req.headers.get("x-rehabify-request-id") ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const traceId =
    req.headers.get("x-trace-id") ||
    req.headers.get("x-rehabify-trace-id") ||
    `trc_${Math.random().toString(36).substring(2, 10)}`;

  const authHeader = req.headers.get("authorization");
  const xApiKey = req.headers.get("x-api-key");

  let apiKey: string | null = null;

  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    apiKey = authHeader.slice(7).trim();
  } else if (xApiKey) {
    apiKey = xApiKey.trim();
  }

  if (!apiKey) {
    return {
      partner: null,
      requestId,
      traceId,
      response: NextResponse.json(
        {
          error: {
            code: "unauthorized",
            message:
              "Missing API key. Please provide your API key via 'Authorization: Bearer sk_live_...' or 'X-API-Key' header.",
            request_id: requestId,
            trace_id: traceId,
          },
        },
        {
          status: 401,
          headers: {
            "X-Rehabify-Request-Id": requestId,
            "X-Rehabify-Trace-Id": traceId,
          },
        }
      ),
    };
  }

  try {
    const convex = getConvexClient();
    const partnerData: any = await convex.query(api.partners.validatePartnerApiKey, {
      apiKey,
    });

    if (!partnerData) {
      return {
        partner: null,
        requestId,
        traceId,
        response: NextResponse.json(
          {
            error: {
              code: "invalid_api_key",
              message:
                "The API key provided is invalid or inactive. For testing, you can use 'sk_test_rehabify_sandbox'.",
              request_id: requestId,
              trace_id: traceId,
            },
          },
          {
            status: 401,
            headers: {
              "X-Rehabify-Request-Id": requestId,
              "X-Rehabify-Trace-Id": traceId,
            },
          }
        ),
      };
    }

    const env: "sandbox" | "live" =
      partnerData.environment || (partnerData.isSandbox ? "sandbox" : "live");

    // Asynchronously record last used timestamp
    if (partnerData.keyId) {
      convex
        .mutation(api.partners.recordApiKeyUsage, {
          keyId: partnerData.keyId,
          partnerCode: partnerData.code,
        })
        .catch(() => {});
    }

    return {
      partner: {
        name: partnerData.name,
        code: partnerData.code,
        type: partnerData.type,
        tier: partnerData.tier,
        isSandbox: Boolean(partnerData.isSandbox),
        environment: env,
        keyPrefix: partnerData.keyPrefix,
        keyId: partnerData.keyId,
      },
      requestId,
      traceId,
    };
  } catch (error) {
    console.error("Partner authentication error:", error);
    return {
      partner: null,
      requestId,
      traceId,
      response: NextResponse.json(
        {
          error: {
            code: "internal_auth_error",
            message: "Unable to verify API credentials at this time.",
            request_id: requestId,
            trace_id: traceId,
          },
        },
        {
          status: 500,
          headers: {
            "X-Rehabify-Request-Id": requestId,
            "X-Rehabify-Trace-Id": traceId,
          },
        }
      ),
    };
  }
}
