/**
 * The time zone a physio's appointments are described in: Lagos in Nigeria, their own outside it
 * (e.g. Africa/Accra for a Ghana physio; lib/practiceCountries.ts). Server messages pass it to the
 * lagosTime.ts formatters so "your visit at 10:30 AM" means 10:30 where the visit happens.
 */
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { practiceSettings } from "../../lib/practiceCountries";
import { LAGOS_TIME_ZONE } from "./lagosTime";

export async function practiceZoneForPhysio(
  ctx: { db: QueryCtx["db"] },
  physioId: Id<"users"> | null | undefined
): Promise<string> {
  if (!physioId) return LAGOS_TIME_ZONE;
  const physio = await ctx.db.get(physioId);
  const profile = physio?.physiotherapistProfileId ? await ctx.db.get(physio.physiotherapistProfileId) : null;
  return practiceSettings(profile?.country, profile?.timeZone).timeZone;
}

/** "(Lagos time)", "(Accra time)"... for messages that name the zone. */
export function zoneLabel(timeZone: string): string {
  return `(${(timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ")} time)`;
}
