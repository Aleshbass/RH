"use client";

import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

export default function SyncUserWithConvex() {
  const { user, isLoaded } = useUser();
  const storeUserInConvex = useMutation(api.users.storeUserFromClerk);
  const currentUser = useQuery(api.users.getMyUser);
  const syncedRef = useRef(false);

  useEffect(() => {
    // Only proceed if Clerk is loaded and user exists
    if (!isLoaded || !user) return;
    
    // If user already exists in Convex, no need to sync
    if (currentUser !== undefined && currentUser !== null) return;
    
    // Prevent multiple sync attempts
    if (syncedRef.current) return;

    const syncUserData = async () => {
      try {
        syncedRef.current = true;
        console.log('Syncing user with Convex:', user.emailAddresses[0]?.emailAddress);
        
        await storeUserInConvex({
          clerkId: user.id,
          email: user.emailAddresses[0]?.emailAddress ?? "",
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          imageUrl: user.imageUrl ?? undefined,
        });
        
        console.log('User sync completed successfully');
      } catch (error) {
        console.error("Error syncing user with Convex:", error);
        // Reset the flag on error so we can retry
        syncedRef.current = false;
      }
    };

    syncUserData();
  }, [user, isLoaded, currentUser, storeUserInConvex]);

  return null;
}
