const authConfig = {
  providers: [
    {
      // For development, we'll use a hardcoded domain
      // In production, this should be configured via environment variables
      domain: "https://rehabify-health.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};

export default authConfig;
