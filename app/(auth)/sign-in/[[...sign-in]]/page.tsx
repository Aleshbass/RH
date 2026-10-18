import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import CustomSignIn from "@/components/auth/CustomSignIn";
import { AuthLoading } from "@/components/auth/AuthShell";

/** On partners.* this page is the partner portal's sign-in (the middleware lets /sign-in through there). */
async function onPartnersHost() {
  return (await headers()).get("x-subdomain-type") === "partners";
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await onPartnersHost()) ? "Partner sign in" : "Sign in" };
}

export default async function SignInPage() {
  const partnersHost = await onPartnersHost();
  const audience = partnersHost ? "partner" : "default";
  return (
    <Suspense fallback={<AuthLoading audience={audience} partnersHost={partnersHost} />}>
      <CustomSignIn audience={audience} partnersHost={partnersHost} />
    </Suspense>
  );
}
