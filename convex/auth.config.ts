const authConfig = {
  providers: [
    {
      // For development, we'll use a hardcoded domain
      // In production, this should be configured via environment variables
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
