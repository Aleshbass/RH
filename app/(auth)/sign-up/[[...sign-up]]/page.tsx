import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import CustomSignUp from "@/components/auth/CustomSignUp";
import { AuthLoading } from "@/components/auth/AuthShell";

/** On partners.* this page is the partner portal's sign-up (the middleware lets /sign-up through there). */
async function onPartnersHost() {
  return (await headers()).get("x-subdomain-type") === "partners";
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await onPartnersHost()) ? "Apply for partner access" : "Create your account" };
}

export default async function SignUpPage() {
  const partnersHost = await onPartnersHost();
  const audience = partnersHost ? "partner" : "default";
  return (
    <Suspense fallback={<AuthLoading audience={audience} partnersHost={partnersHost} />}>
      <CustomSignUp audience={audience} partnersHost={partnersHost} />
    </Suspense>
  );
}
