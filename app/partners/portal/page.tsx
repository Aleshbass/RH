"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  PartnerApplicationForm,
  PartnerGateway,
  PartnerPendingScreen,
  PartnerRejectedScreen,
} from "@/components/partners/portal/PartnerOnboarding";
import { PartnerDashboard } from "@/components/partners/portal/PartnerDashboard";

/**
 * Partner Portal entry. Identity and access come from the signed-in Clerk user
 * (convex/partners.getCurrentUserPartner); every data call is authorised server-side.
 */
export default function PartnerPortalPage() {
  const { isSignedIn, isLoaded } = useUser();
  const me = useQuery(api.partners.getCurrentUserPartner) as
    | {
        isAuthenticated: boolean;
        isAdmin: boolean;
        status: "unauthenticated" | "no_partner" | "pending" | "approved" | "rejected";
        claimable: boolean;
        partner: { code: string; name: string; type: string; contactEmail: string; logoUrl?: string | null; rejectionReason?: string | null } | null;
      }
    | undefined;
  const claimPartnerAccount = useMutation(api.partners.claimPartnerAccount);
  const claimAttempted = useRef(false);

  // Organisations created by Rehabify are linked to their owner on first sign-in.
  useEffect(() => {
    if (me?.claimable && !claimAttempted.current) {
      claimAttempted.current = true;
      claimPartnerAccount({}).catch(() => {
        /* the portal still works through the verified owner email */
      });
    }
  }, [me?.claimable, claimPartnerAccount]);

  if (!isLoaded || (isSignedIn && me === undefined)) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 rounded-full border-3 border-[#002e2c]/20 border-t-[#002e2c] animate-spin" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[#52706e]">Loading Partner Portal…</p>
      </div>
    );
  }

  if (!isSignedIn || !me || me.status === "unauthenticated") return <PartnerGateway />;

  if (me.isAdmin) return <PartnerDashboard ownCode={me.partner?.code ?? null} isAdmin />;

  if (me.status === "no_partner" || !me.partner) return <PartnerApplicationForm />;
  if (me.status === "pending") return <PartnerPendingScreen partner={me.partner} />;
  if (me.status === "rejected") return <PartnerRejectedScreen rejectionReason={me.partner.rejectionReason} />;

  return <PartnerDashboard ownCode={me.partner.code} isAdmin={false} />;
}
