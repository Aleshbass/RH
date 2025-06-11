"use client";

import { api } from "@/convex/_generated/api";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useEffect } from "react";

export default function SyncUserWithConvex() {
  const { user } = useUser();
  const storeUserInConvex = useMutation(api.users.storeUserFromClerk);

  useEffect(() => {
    if (!user) return;

    const syncUserData = async () => {
      try {
        await storeUserInConvex({
          clerkId: user.id,
          email: user.emailAddresses[0]?.emailAddress ?? "",
          firstName: user.firstName ?? undefined,
          lastName: user.lastName ?? undefined,
          imageUrl: user.imageUrl ?? undefined,
        });
      } catch (error) {
        console.error("Error syncing user with Convex:", error);
      }
    };

    syncUserData();
  }, [user, storeUserInConvex]);

  return null;
}
