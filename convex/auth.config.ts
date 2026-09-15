const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN || "https://clerk.physioaroundme.com",
      applicationID: "convex",
    },
    {
      domain: "https://clerk.physioaroundme.com",
      applicationID: "convex",
    },
    {
      domain: "https://refined-troll-90.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};

export default authConfig;
