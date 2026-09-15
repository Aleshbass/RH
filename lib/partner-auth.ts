import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";

export interface AuthenticatedPartner {
  name: string;
  code: string;
  type: string;
  tier: string;
  isSandbox: boolean;
}

/**
 * Authenticates partner requests via Authorization: Bearer <key> or X-API-Key: <key>.
 * Supports live keys and sandbox test keys (sk_test_...).
 */
export async function authenticatePartner(
  req: NextRequest
): Promise<{ partner: AuthenticatedPartner | null; response?: NextResponse }> {
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
      response: NextResponse.json(
        {
          error: {
            code: "unauthorized",
            message:
              "Missing API key. Please provide your API key via 'Authorization: Bearer sk_live_...' or 'X-API-Key' header.",
          },
        },
        { status: 401 }
      ),
    };
  }

  try {
    const convex = getConvexClient();
    const partner = await convex.query(api.partners.validatePartnerApiKey, {
      apiKey,
    });

    if (!partner) {
      return {
        partner: null,
        response: NextResponse.json(
          {
            error: {
              code: "invalid_api_key",
              message:
                "The API key provided is invalid or inactive. For testing, you can use 'sk_test_rehabify_sandbox'.",
            },
          },
          { status: 401 }
        ),
      };
    }

    return {
      partner: {
        name: partner.name,
        code: partner.code,
        type: partner.type,
        tier: partner.tier,
        isSandbox: Boolean(partner.isSandbox),
      },
    };
  } catch (error) {
    console.error("Partner authentication error:", error);
    return {
      partner: null,
      response: NextResponse.json(
        {
          error: {
            code: "internal_auth_error",
            message: "Unable to verify API credentials at this time.",
          },
        },
        { status: 500 }
      ),
    };
  }
}
