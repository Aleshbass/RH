/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */

// @ts-ignore
import { api } from "@/convex/_generated/api";
import { useActionUntyped, useMutationUntyped } from "./convexUntyped";

// Wrapper hooks that handle the complex API types internally
export function usePatientOnboardingAction() {
  // @ts-ignore
  return useActionUntyped((api as any).actions.patients.completeOnboarding.completePatientOnboardingWithNotification);
}

export function useUserProfileMutation() {
  // @ts-ignore
  return useMutationUntyped((api as any).users.completeUserProfile);
}
