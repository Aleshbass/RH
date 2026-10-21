/**
 * Result types of the pricing-model queries, taken from the Convex modules themselves.
 *
 * The generated `api` object currently types as `any` (a circular reference in
 * convex/_generated/api.d.ts, hidden by skipLibCheck), so `FunctionReturnType<typeof api.x>`
 * gives `any`. The modules' own exports keep their types; pages cast their useQuery results
 * to these. Type-only imports: nothing from convex/ is bundled into the app.
 */
import type { RegisteredQuery } from "convex/server";
import type { getCatalogue, getPayoutSchedule } from "@/convex/serviceTariffs";
import type { listZones } from "@/convex/travelZones";
import type { getMyMarketplaceSettings, getMyNetworkTerms } from "@/convex/marketplace/settings";
import type { getMyAccess, getAccessStatus } from "@/convex/rehabifyAccess";
import type { getServiceQuote } from "@/convex/marketplace/booking";
import type { getCareBillingMode } from "@/convex/rehabifyFollowUps";

/** What a registered query resolves to (same extraction convex/server uses for `api`). */
type QueryResult<F> = F extends RegisteredQuery<infer _Visibility, infer _Args, infer Returns> ? Awaited<Returns> : never;

export type Catalogue = QueryResult<typeof getCatalogue>;
export type CatalogueService = Catalogue["services"][number];
export type TravelZone = QueryResult<typeof listZones>[number];
export type PayoutSchedule = NonNullable<QueryResult<typeof getPayoutSchedule>>;
export type PayoutScheduleRow = PayoutSchedule["services"][number];
export type MarketplaceSettings = NonNullable<QueryResult<typeof getMyMarketplaceSettings>>;
export type NetworkTermsStatus = NonNullable<QueryResult<typeof getMyNetworkTerms>>;
export type MyAccess = NonNullable<QueryResult<typeof getMyAccess>>;
export type AccessStatus = QueryResult<typeof getAccessStatus>;
export type ServiceQuote = QueryResult<typeof getServiceQuote>;
export type CareBillingMode = NonNullable<QueryResult<typeof getCareBillingMode>>;
