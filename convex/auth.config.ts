const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "https://rehabify-health.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};

export default authConfig;
