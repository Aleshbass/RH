/**
 * Home-visit travel zones: named areas per city, each with a fixed surcharge that is added to
 * home services whose tariff has travel enabled. Patients pick their area; an area not in an
 * active zone isn't covered for home visits yet. Managed in Admin › Travel zones.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ensureUserRole } from "./auth";
import { servesRehabifyNetwork } from "./physioSetup";
import { STARTING_ZONES } from "./helpers/startingZones";
import { insertNotification } from "./helpers/pushNotify";
import { publicAppUrl } from "./helpers/appUrl";

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
        physiosCovering: profiles.filter((profile) => servesRehabifyNetwork(profile) && profile.coveredZoneIds?.includes(zone._id)).length,
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


/**
 * One-time setup of the owner-approved starting zones (helpers/startingZones.ts). Creates only the
 * zones whose city + name don't exist yet, so it is safe to run again; edit them in Admin.
 *   npx convex run travelZones:seedStartingZones --prod
 */
export const seedStartingZones = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("travelZones").collect();
    const key = (city: string, name: string) => `${city.toLowerCase()}|${name.toLowerCase()}`;
    const have = new Set(existing.map((zone) => key(zone.city, zone.name)));
    const now = Date.now();
    let created = 0;
    for (const [index, zone] of STARTING_ZONES.entries()) {
      if (have.has(key(zone.city, zone.name))) continue;
      const clean = cleanZone({ ...zone, surchargeKobo: zone.surchargeNaira * 100, physioTravelSharePercent: 100 });
      await assertAreasUnique(ctx, clean.city, clean.areas);
      await ctx.db.insert("travelZones", { ...clean, active: true, sortOrder: index, createdAt: now, updatedAt: now, updatedBy: "starting-zones" });
      created++;
    }
    return { created, skipped: STARTING_ZONES.length - created };
  },
});

/**
 * Physios who offer home visits but have no zones yet: tick every active zone in their city so
 * they are bookable straight away, then ask them to untick the areas they won't travel to.
 * Their city comes from their profile location or their old Joy area list (Lagos / Abuja).
 *   npx convex run travelZones:assignStartingZonesToPhysios --prod
 */
export const assignStartingZonesToPhysios = internalMutation({
  args: {},
  handler: async (ctx) => {
    const zones = (await ctx.db.query("travelZones").collect()).filter((zone) => zone.active);
    const byCity = new Map<string, Id<"travelZones">[]>();
    for (const zone of zones) byCity.set(zone.city.toLowerCase(), [...(byCity.get(zone.city.toLowerCase()) ?? []), zone._id]);
    const profiles = await ctx.db.query("physiotherapistProfiles").collect();
    const settingsUrl = `${publicAppUrl()}/dashboard/physiotherapist/settings/marketplace`;
    let assigned = 0;
    let skipped = 0;
    for (const profile of profiles) {
      const offersHome = profile.offersInPersonSessions === true || (profile.joyServiceModes ?? []).includes("home_visit");
      if (!offersHome || !servesRehabifyNetwork(profile) || (profile.coveredZoneIds ?? []).length) continue;
      const hints = [profile.location ?? "", ...(profile.joyServiceAreas ?? [])].map((text) => text.toLowerCase());
      const cities = [...byCity.keys()].filter((city) => hints.some((hint) => hint.includes(city)));
      const zoneIds = cities.flatMap((city) => byCity.get(city) ?? []);
      if (!zoneIds.length) { skipped++; continue; }
      await ctx.db.patch(profile._id, { coveredZoneIds: zoneIds });
      assigned++;
      const title = "Choose the areas you'll travel to";
      const body = "Home visits are now booked by area. We've started you with every area in your city. Untick any you won't travel to, so you only get visits that work for you.";
      await insertNotification(ctx, {
        userId: profile.userId, type: "marketplace_zones_review", priority: "high", status: "pending",
        payload: { title, body, link: settingsUrl, data: { actionUrl: settingsUrl } }, createdAt: Date.now(),
      });
      const user = await ctx.db.get(profile.userId);
      if (user?.email) {
        await ctx.scheduler.runAfter(0, internal.actions.emails.sendPatientCareEmail.sendPatientCareEmail, {
          to: user.email, subject: title, greetingName: user.firstName, heading: title,
          paragraphs: [
            "Rehabify home visits are now booked by area, each with a fixed travel charge that you keep in full.",
            "To get you started, we've ticked every area in your city. Please review them and untick any area you won't travel to, so you only receive home visits that work for you.",
          ],
          buttonLabel: "Review my areas", buttonUrl: settingsUrl,
          footnote: "You're receiving this because you offer home visits on Rehabify. Questions? Write to support@physioaroundme.com.",
        });
      }
    }
    return { assigned, skipped };
  },
});
