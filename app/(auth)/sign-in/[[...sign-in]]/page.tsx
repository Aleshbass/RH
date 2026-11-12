import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import CustomSignIn from "@/components/auth/CustomSignIn";
import { AuthLoading } from "@/components/auth/AuthShell";
import type { AuthAudience } from "@/components/auth/authConfig";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * partners.* shows the partner portal's sign-in and learn.* Rehabify Learn's (the middleware lets
 * /sign-in through on both). On the main site, a sign-in heading back to /learn is Learn's too.
 */
async function audienceFor(searchParams?: SearchParams): Promise<{ audience: AuthAudience; ownHost: boolean }> {
  const subdomain = (await headers()).get("x-subdomain-type");
  if (subdomain === "partners") return { audience: "partner", ownHost: true };
  if (subdomain === "learn") return { audience: "learn", ownHost: true };
  const params = searchParams ? await searchParams : {};
  const redirect = params.redirect ?? params.redirect_url;
  if (typeof redirect === "string" && /^\/learn(?:[/?#]|$)/.test(redirect)) return { audience: "learn", ownHost: false };
  return { audience: "default", ownHost: false };
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const { audience } = await audienceFor(searchParams);
  return { title: audience === "partner" ? "Partner sign in" : audience === "learn" ? "Sign in to Rehabify Learn" : "Sign in" };
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const { audience, ownHost } = await audienceFor(searchParams);
  return (
    <Suspense fallback={<AuthLoading audience={audience} partnersHost={ownHost} />}>
      <CustomSignIn audience={audience} partnersHost={ownHost} />
    </Suspense>
  );
}
