"use client";

import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { clearPartnerReferralCookie, getReferralPublicCode } from "@/lib/referralCookie";

export default function SyncUserWithConvex() {
  const { user, isLoaded } = useUser();
  const storeUserInConvex = useMutation(api.users.storeUserFromClerk);
  const claimReferralAttribution = useMutation(api.partnerLinks.claimReferralAttribution);
  const currentUser = useQuery(api.users.getMyUser);
  const syncedRef = useRef(false);
  const claimAttemptedRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;

  // Existing users who arrive through a partner referral link: claim attribution once.
  // The server validates the code (active, live, approved partner; first partner wins).
  useEffect(() => {
    if (!currentUser || currentUser.referredByPartnerCode) return;
    const code = getReferralPublicCode();
    if (!code || claimAttemptedRef.current === code) return;
    claimAttemptedRef.current = code;
    claimReferralAttribution({ publicCode: code })
      .then((result) => {
        if (result?.attributed) clearPartnerReferralCookie();
      })
      .catch(() => {
        /* best effort — attribution is retried at booking */
      });
  }, [currentUser, claimReferralAttribution]);

  useEffect(() => {
    // Only proceed if Clerk is loaded and user exists
    if (!isLoaded || !user) {
      syncedRef.current = false;
      return;
    }

    // If user already exists in Convex, no need to sync
    if (currentUser !== undefined && currentUser !== null) {
      syncedRef.current = true;
      return;
    }

    // If currentUser query is still loading, wait
    if (currentUser === undefined) {
      return;
    }

    // Prevent multiple sync attempts
    if (syncedRef.current) return;

    const syncUserData = async () => {
      try {
        syncedRef.current = true;
        await storeUserInConvex({
          clerkId: user.id,
          email: user.emailAddresses[0]?.emailAddress ?? "",
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          imageUrl: user.imageUrl ?? undefined,
          // Only the referral-link code is sent; the partner is resolved server-side.
          referralPublicCode: getReferralPublicCode(),
        });
        retryCountRef.current = 0;
      } catch (error) {
        console.error("Error syncing user with Convex:", {
          error: error instanceof Error ? error.message : String(error),
          attempt: retryCountRef.current + 1,
          maxRetries,
        });

        syncedRef.current = false;
        retryCountRef.current += 1;

        if (retryCountRef.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 5000);
          setTimeout(() => {
            if (currentUser === null && !syncedRef.current) {
              syncUserData();
            }
          }, delay);
        } else {
          console.error("Max retry attempts reached for user sync. Please refresh the page.");
        }
      }
    };

    if (currentUser === null) {
      syncUserData();
    }
  }, [user, isLoaded, currentUser, storeUserInConvex]);

  return null;
}
