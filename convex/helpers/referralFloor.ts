/**
 * The least a clinic can bill a Rehabify-referred patient per visit: Rehabify's cheapest paid
 * session (the recovery consultation by default), from the live tariffs, so it follows the
 * admin's prices. Stops a token invoice on the platform with the rest taken in cash.
 */
import type { QueryCtx } from "../_generated/server";
import { BOOKABLE_SERVICE_IDS, getService } from "../../lib/rehabify-services";
import { loadTariffs } from "./rehabifyPricing";

export async function cheapestSessionPriceKobo(ctx: QueryCtx): Promise<number> {
  const { tariffs } = await loadTariffs(ctx);
  let cheapest = Infinity;
  for (const id of BOOKABLE_SERVICE_IDS) {
    const tariff = tariffs[id];
    const service = getService(id);
    if (!tariff?.active || !service || service.kind === "screening" || !(tariff.priceKobo > 0)) continue;
    cheapest = Math.min(cheapest, tariff.priceKobo);
  }
  return Number.isFinite(cheapest) ? cheapest : 0;
}
