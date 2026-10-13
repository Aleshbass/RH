/**
 * Deprecated location. Partner API authentication lives in lib/partner-api/auth.ts
 * (hashed keys verified through the signed Convex partner gateway).
 */
export { authenticatePartner, logPartnerRequest } from "./partner-api/auth";
export type { AuthenticatedPartner, PartnerAuthResult } from "./partner-api/auth";
