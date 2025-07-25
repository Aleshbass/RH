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
  const retryCountRef = useRef(0);
  const maxRetries = 3;

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
        console.log('Syncing user with Convex:', {
          email: user.emailAddresses[0]?.emailAddress,
          clerkId: user.id,
          attempt: retryCountRef.current + 1
        });
        
        await storeUserInConvex({
          clerkId: user.id,
          email: user.emailAddresses[0]?.emailAddress ?? "",
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          imageUrl: user.imageUrl ?? undefined,
        });
        
        console.log('User sync completed successfully');
        retryCountRef.current = 0; // Reset retry count on success
      } catch (error) {
        console.error("Error syncing user with Convex:", {
          error: error instanceof Error ? error.message : String(error),
          attempt: retryCountRef.current + 1,
          maxRetries,
          clerkId: user.id
        });
        
        syncedRef.current = false;
        retryCountRef.current += 1;
        
        // If we haven't exceeded max retries, try again after a delay
        if (retryCountRef.current < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 5000); // Exponential backoff, max 5s
          console.log(`Retrying user sync in ${delay}ms...`);
          setTimeout(() => {
            if (currentUser === null && !syncedRef.current) {
              syncUserData();
            }
          }, delay);
        } else {
          console.error('Max retry attempts reached for user sync. Please refresh the page.');
        }
      }
    };

    // Only sync if currentUser is null (user doesn't exist in Convex)
    if (currentUser === null) {
      syncUserData();
    }
  }, [user, isLoaded, currentUser, storeUserInConvex]);

  return null;
}
