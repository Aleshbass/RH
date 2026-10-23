/**
 * Which Clerk instance may sign users in to this Convex deployment: only its own issuer
 * (CLERK_JWT_ISSUER_DOMAIN, set on each deployment). Never list a development Clerk instance
 * here for production, or users from that instance (with whatever "verified" email they claim
 * there) could sign in to production.
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "https://clerk.physioaroundme.com",
      applicationID: "convex",
    },
  ],
};

export default authConfig;
