import type { Metadata } from "next";
import { Suspense } from "react";
import CustomSignUp from "@/components/auth/CustomSignUp";
import { AuthLoading } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Apply for partner access" };

/** Partner self-registration: create the account here, then the portal shows the application form. */
export default function PartnerSignUpPage() {
  return (
    <Suspense fallback={<AuthLoading audience="partner" />}>
      <CustomSignUp audience="partner" />
    </Suspense>
  );
}
