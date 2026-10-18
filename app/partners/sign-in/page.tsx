import type { Metadata } from "next";
import { Suspense } from "react";
import CustomSignIn from "@/components/auth/CustomSignIn";
import { AuthLoading } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Partner sign in" };

/** Partner portal sign-in on the main site; returns to /partners/portal unless ?redirect= says otherwise. */
export default function PartnerSignInPage() {
  return (
    <Suspense fallback={<AuthLoading audience="partner" />}>
      <CustomSignIn audience="partner" />
    </Suspense>
  );
}
