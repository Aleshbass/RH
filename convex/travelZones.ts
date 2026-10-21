/**
 * Home-visit travel zones: named areas per city, each with a fixed surcharge that is added to
 * home services whose tariff has travel enabled. Patients pick their area; an area not in an
 * active zone isn't covered for home visits yet. Managed in Admin › Travel zones.
 */
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureUserRole } from "./auth";

/** Public: active zones and their areas, grouped by city, for the area picker. */
export const listZones = query({
  args: {},
  handler: async (ctx) => {
    const zones = await ctx.db.query("travelZones").collect();
    return zones
      .filter((zone) => zone.active)
      .sort((a, b) => a.city.localeCompare(b.city) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      .map((zone) => ({
        id: zone._id,
        city: zone.city,
        name: zone.name,
        areas: [...zone.areas].sort((a, b) => a.localeCompare(b)),
        surchargeKobo: zone.surchargeKobo,
        physioTravelSharePercent: zone.physioTravelSharePercent,
      }));
  },
});

/** Admin: every zone, including inactive ones. */
export const adminListZones = query({
  args: {},
  handler: async (ctx) => {
    await ensureUserRole(ctx, ["admin"]);
    const zones = await ctx.db.query("travelZones").collect();
    const profiles = await ctx.db.query("physiotherapistProfiles").collect();
    return zones
      .sort((a, b) => a.city.localeCompare(b.city) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
      .map((zone) => ({
        ...zone,
        physiosCovering: profiles.filter((profile) => !profile.clinicId && profile.coveredZoneIds?.includes(zone._id)).length,
      }));
  },
});

const zoneFields = {
  city: v.string(),
  name: v.string(),
  areas: v.array(v.string()),
  surchargeKobo: v.number(),
  physioTravelSharePercent: v.number(),
  active: v.boolean(),
  sortOrder: v.optional(v.number()),
};

function cleanZone(args: { city: string; name: string; areas: string[]; surchargeKobo: number; physioTravelSharePercent: number }) {
  const city = args.city.trim();
  const name = args.name.trim();
  if (!city) throw new ConvexError("Enter the city");
  if (!name) throw new ConvexError("Enter a zone name");
  const areas = [...new Set(args.areas.map((area) => area.trim()).filter(Boolean))];
  if (areas.length === 0) throw new ConvexError("Add at least one area to the zone");
  if (!Number.isInteger(args.surchargeKobo) || args.surchargeKobo < 0) throw new ConvexError("The travel charge must be ₦0 or more");
  if (!(args.physioTravelSharePercent >= 0 && args.physioTravelSharePercent <= 100)) {
    throw new ConvexError("The physio's share must be between 0% and 100%");
  }
  return { city, name, areas, surchargeKobo: args.surchargeKobo, physioTravelSharePercent: args.physioTravelSharePercent };
}

/** An area can only belong to one active zone per city, so every patient gets one price. */
async function assertAreasUnique(ctx: any, city: string, areas: string[], exceptId?: string) {
  const zones = await ctx.db.query("travelZones").withIndex("by_city", (q: any) => q.eq("city", city)).collect();
  const taken = new Map<string, string>();
  for (const zone of zones) {
    if (zone._id === exceptId || !zone.active) continue;
    for (const area of zone.areas) taken.set(area.toLowerCase(), zone.name);
  }
  for (const area of areas) {
    const owner = taken.get(area.toLowerCase());
    if (owner) throw new ConvexError(`${area} is already in ${owner}`);
  }
}

export const adminCreateZone = mutation({
  args: zoneFields,
  handler: async (ctx, args) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const zone = cleanZone(args);
    if (args.active) await assertAreasUnique(ctx, zone.city, zone.areas);
    const now = Date.now();
    return await ctx.db.insert("travelZones", {
      ...zone,
      active: args.active,
      sortOrder: args.sortOrder,
      createdAt: now,
      updatedAt: now,
      updatedBy: admin.email ?? undefined,
    });
  },
});

export const adminUpdateZone = mutation({
  args: { zoneId: v.id("travelZones"), ...zoneFields },
  handler: async (ctx, { zoneId, ...args }) => {
    const admin = await ensureUserRole(ctx, ["admin"]);
    const existing = await ctx.db.get(zoneId);
    if (!existing) throw new ConvexError("Zone not found");
    const zone = cleanZone(args);
    if (args.active) await assertAreasUnique(ctx, zone.city, zone.areas, zoneId);
    await ctx.db.patch(zoneId, {
      ...zone,
      active: args.active,
      sortOrder: args.sortOrder,
      updatedAt: Date.now(),
      updatedBy: admin.email ?? undefined,
    });
    return { success: true };
  },
});
