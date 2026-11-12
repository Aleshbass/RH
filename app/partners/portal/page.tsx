"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { RehabifyPageLoader } from "@/components/brand/RehabifyLoader";

/**
 * Partner Portal entry, for partner organisations and referring doctors (partners of type
 * "doctor"). Identity and access come from the signed-in Clerk user
 * (convex/partners.getCurrentUserPartner); every data call is authorised server-side.
 */
export default function PartnerPortalPage() {
  const router = useRouter();
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
  // A doctor without a partner record yet finishes the short doctor profile instead of the organisation application
  const account = useQuery(api.users.getMyUser, isSignedIn && me?.status === "no_partner" ? {} : "skip") as
    | { role?: string }
    | null
    | undefined;
  const claimPartnerAccount = useMutation(api.partners.claimPartnerAccount);
  const claimAttempted = useRef(false);
  const doctorNeedsProfile = me?.status === "no_partner" && !me.isAdmin && account?.role === "doctor";

  // Organisations created by Rehabify are linked to their owner on first sign-in.
  useEffect(() => {
    if (me?.claimable && !claimAttempted.current) {
      claimAttempted.current = true;
      claimPartnerAccount({}).catch(() => {
        /* the portal still works through the verified owner email */
      });
    }
  }, [me?.claimable, claimPartnerAccount]);

  useEffect(() => {
    if (doctorNeedsProfile) router.replace("/doctor");
  }, [doctorNeedsProfile, router]);

  const waitingForAccount = me?.status === "no_partner" && !me.isAdmin && account === undefined;
  if (!isLoaded || (isSignedIn && me === undefined) || waitingForAccount || doctorNeedsProfile) {
    return (
      <RehabifyPageLoader message="Loading your portal…" className="min-h-[80vh]" />
    );
  }

  if (!isSignedIn || !me || me.status === "unauthenticated") return <PartnerGateway />;

  if (me.isAdmin) return <PartnerDashboard ownCode={me.partner?.code ?? null} ownType={me.partner?.type ?? null} isAdmin />;

  if (me.status === "no_partner" || !me.partner) return <PartnerApplicationForm />;
  // Doctors get their own pending / declined screens (components/partners/doctor/DoctorStatusScreens.tsx)
  if (me.status === "pending") return <PartnerPendingScreen partner={me.partner} />;
  if (me.status === "rejected") return <PartnerRejectedScreen rejectionReason={me.partner.rejectionReason} partnerType={me.partner.type} />;

  return <PartnerDashboard ownCode={me.partner.code} ownType={me.partner.type} isAdmin={false} />;
}
