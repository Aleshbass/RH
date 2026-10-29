/**
 * Clinic inventory: consumables (tape, gloves, electrodes…) with stock on hand, a minimum and
 * restock alerts; equipment (couches, devices…) with location, condition, maintenance date and
 * the staff member responsible; and purchases (supplier, date, quantities, cost).
 *
 * Part of the Enterprise plan. Clinics on the pilot (billing not switched on) have it too.
 * Access: the owner, or a team member whose clinic role includes Inventory.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getClinicMemberOrNull, requireClinicWrite } from "./clinicTools";
import { billingIsOn, subscriptionForClinic } from "./helpers/clinicSubscriptions";
import { insertNotification } from "./helpers/pushNotify";
import { personName } from "./helpers/displayIdentity";

type Ctx = QueryCtx | MutationCtx;

const DAY_MS = 86_400_000;
/** Equipment is flagged this many days before its maintenance date */
const MAINTENANCE_WARNING_DAYS = 7;

/** Enterprise, or a clinic billing hasn't started for (the pilot). */
async function inventoryIncluded(ctx: Ctx, clinicId: Id<"clinics">) {
  const sub = await subscriptionForClinic(ctx, clinicId);
  return !billingIsOn(sub) || sub.plan === "enterprise";
}

async function requireInventoryWrite(ctx: MutationCtx) {
  const member = await requireClinicWrite(ctx, "inventory");
  if (!(await inventoryIncluded(ctx, member.clinic._id))) {
    throw new ConvexError("Inventory is part of the Enterprise plan. Ask for an upgrade under Billing → Your plan.");
  }
  return member;
}

const isLow = (item: Doc<"clinicInventoryItems">) =>
  item.kind === "consumable" && item.minStock !== undefined && (item.quantity ?? 0) <= item.minStock;
const maintenanceSoon = (item: Doc<"clinicInventoryItems">, now: number) =>
  item.kind === "equipment" && item.maintenanceDueAt !== undefined && item.maintenanceDueAt <= now + MAINTENANCE_WARNING_DAYS * DAY_MS;

const clean = (value: string | undefined, max = 200) => value?.trim().slice(0, max) || undefined;

/** Everything on the Inventory page. `available: false` shows the Enterprise card instead. */
export const getInventory = query({
  args: {},
  handler: async (ctx) => {
    const member = await getClinicMemberOrNull(ctx, "inventory");
    if (!member) return null;
    const clinic = member.clinic;
    if (!(await inventoryIncluded(ctx, clinic._id))) return { available: false as const };
    const now = Date.now();

    const items = (
      await ctx.db
        .query("clinicInventoryItems")
        .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
        .collect()
    ).filter((item) => !item.archived);
    const people = new Map<string, string>();
    const nameOf = async (id: Id<"users"> | undefined) => {
      if (!id) return null;
      if (!people.has(id)) people.set(id, personName(await ctx.db.get(id), "Team member"));
      return people.get(id) ?? null;
    };

    const shown = await Promise.all(
      items
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (item) => ({
          _id: item._id,
          kind: item.kind,
          name: item.name,
          category: item.category ?? null,
          unit: item.unit ?? null,
          quantity: item.quantity ?? 0,
          minStock: item.minStock ?? null,
          location: item.location ?? null,
          condition: item.condition ?? null,
          maintenanceDueAt: item.maintenanceDueAt ?? null,
          responsibleUserId: item.responsibleUserId ?? null,
          responsibleName: await nameOf(item.responsibleUserId),
          notes: item.notes ?? null,
          low: isLow(item),
          maintenanceDue: maintenanceSoon(item, now),
          updatedAt: item.updatedAt,
        }))
    );

    const purchases = await ctx.db
      .query("clinicPurchases")
      .withIndex("by_clinic_and_date", (q) => q.eq("clinicId", clinic._id))
      .order("desc")
      .take(50);

    // Who can be responsible for equipment: the owner and the clinic's clinicians
    const profiles = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_clinic_id", (q) => q.eq("clinicId", clinic._id))
      .collect();
    const team = [{ _id: clinic.ownerId as string, name: `${personName(await ctx.db.get(clinic.ownerId), "Clinic owner")} (owner)` }];
    for (const profile of profiles) {
      const user = await ctx.db.get(profile.userId);
      if (user && user.clinicId === clinic._id && user.role === "physiotherapist") team.push({ _id: user._id, name: personName(user, "Clinician") });
    }

    return {
      available: true as const,
      items: shown,
      purchases: await Promise.all(
        purchases.map(async (p) => ({
          _id: p._id,
          supplier: p.supplier,
          purchasedAt: p.purchasedAt,
          lines: p.lines,
          totalKobo: p.totalKobo ?? null,
          notes: p.notes ?? null,
          createdByName: await nameOf(p.createdBy),
        }))
      ),
      team,
      lowStockCount: shown.filter((i) => i.low).length,
      maintenanceDueCount: shown.filter((i) => i.maintenanceDue).length,
    };
  },
});

/** Low stock and maintenance due, for the clinic's Home. Null when inventory isn't in use. */
export const getInventoryAlerts = query({
  args: {},
  handler: async (ctx) => {
    const member = await getClinicMemberOrNull(ctx, "inventory");
    if (!member || !(await inventoryIncluded(ctx, member.clinic._id))) return null;
    const now = Date.now();
    const items = (
      await ctx.db
        .query("clinicInventoryItems")
        .withIndex("by_clinic", (q) => q.eq("clinicId", member.clinic._id))
        .collect()
    ).filter((item) => !item.archived);
    return { lowStock: items.filter(isLow).length, maintenanceDue: items.filter((i) => maintenanceSoon(i, now)).length };
  },
});

const conditionValidator = v.union(v.literal("good"), v.literal("needs_service"), v.literal("out_of_service"));

/** Add an item, or change one (`itemId`). */
export const saveInventoryItem = mutation({
  args: {
    itemId: v.optional(v.id("clinicInventoryItems")),
    kind: v.union(v.literal("consumable"), v.literal("equipment")),
    name: v.string(),
    category: v.optional(v.string()),
    unit: v.optional(v.string()),
    quantity: v.optional(v.number()),
    minStock: v.optional(v.number()),
    location: v.optional(v.string()),
    condition: v.optional(conditionValidator),
    maintenanceDueAt: v.optional(v.number()),
    responsibleUserId: v.optional(v.id("users")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await requireInventoryWrite(ctx);
    const name = clean(args.name, 120);
    if (!name) throw new ConvexError("Give the item a name.");
    const count = (n: number | undefined) => (n === undefined ? undefined : Math.max(0, Math.round(n * 100) / 100));
    if (args.responsibleUserId) {
      const person = await ctx.db.get(args.responsibleUserId);
      if (!person || (person._id !== clinic.ownerId && person.clinicId !== clinic._id)) throw new ConvexError("Choose someone on your team.");
    }
    const now = Date.now();
    const fields = {
      kind: args.kind,
      name,
      category: clean(args.category, 60),
      unit: args.kind === "consumable" ? clean(args.unit, 30) : undefined,
      minStock: args.kind === "consumable" ? count(args.minStock) : undefined,
      location: clean(args.location, 120),
      condition: args.kind === "equipment" ? (args.condition ?? "good") : undefined,
      maintenanceDueAt: args.kind === "equipment" ? args.maintenanceDueAt : undefined,
      responsibleUserId: args.responsibleUserId,
      notes: clean(args.notes, 1000),
      updatedAt: now,
    };
    if (args.itemId) {
      const item = await ctx.db.get(args.itemId);
      if (!item || item.clinicId !== clinic._id) throw new ConvexError("Item not found");
      // A new maintenance date is a new reminder
      const maintenanceChanged = fields.maintenanceDueAt !== item.maintenanceDueAt;
      await ctx.db.patch(item._id, { ...fields, ...(maintenanceChanged ? { maintenanceAlertedAt: undefined } : {}) });
      return { itemId: item._id };
    }
    const itemId = await ctx.db.insert("clinicInventoryItems", {
      clinicId: clinic._id,
      ...fields,
      quantity: args.kind === "consumable" ? (count(args.quantity) ?? 0) : undefined,
      createdBy: user._id,
      createdAt: now,
    });
    return { itemId };
  },
});

/** Use, restock or correct a consumable's count. */
export const adjustStock = mutation({
  args: {
    itemId: v.id("clinicInventoryItems"),
    change: v.number(),
    reason: v.union(v.literal("used"), v.literal("restocked"), v.literal("adjusted")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await requireInventoryWrite(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.clinicId !== clinic._id || item.kind !== "consumable") throw new ConvexError("Item not found");
    if (!Number.isFinite(args.change) || args.change === 0) throw new ConvexError("Enter how many.");
    const quantity = Math.max(0, Math.round(((item.quantity ?? 0) + args.change) * 100) / 100);
    const now = Date.now();
    await ctx.db.patch(item._id, {
      quantity,
      updatedAt: now,
      // Back above the minimum: the next shortage alerts again
      ...(item.minStock !== undefined && quantity > item.minStock ? { lowStockAlertedAt: undefined } : {}),
    });
    await ctx.db.insert("clinicInventoryMovements", {
      clinicId: clinic._id,
      itemId: item._id,
      change: quantity - (item.quantity ?? 0),
      reason: args.reason,
      note: clean(args.note, 300),
      userId: user._id,
      createdAt: now,
    });
    return { quantity };
  },
});

/** Remove an item from the list (its history stays). */
export const archiveInventoryItem = mutation({
  args: { itemId: v.id("clinicInventoryItems") },
  handler: async (ctx, args) => {
    const { clinic } = await requireInventoryWrite(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.clinicId !== clinic._id) throw new ConvexError("Item not found");
    await ctx.db.patch(item._id, { archived: true, updatedAt: Date.now() });
    return null;
  },
});

/** Record a purchase. Lines linked to a consumable add to its stock. */
export const recordPurchase = mutation({
  args: {
    supplier: v.string(),
    purchasedAt: v.number(),
    lines: v.array(
      v.object({
        itemId: v.optional(v.id("clinicInventoryItems")),
        name: v.string(),
        quantity: v.number(),
        unitCostNaira: v.optional(v.number()),
      })
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, clinic } = await requireInventoryWrite(ctx);
    const supplier = clean(args.supplier, 120);
    if (!supplier) throw new ConvexError("Add the supplier.");
    if (!Number.isFinite(args.purchasedAt)) throw new ConvexError("Pick the purchase date.");
    const lines = [];
    for (const line of args.lines) {
      const name = clean(line.name, 120);
      if (!name || !(line.quantity > 0)) continue;
      if (line.itemId) {
        const item = await ctx.db.get(line.itemId);
        if (!item || item.clinicId !== clinic._id) throw new ConvexError("One of the items isn't in your inventory.");
      }
      lines.push({
        itemId: line.itemId,
        name,
        quantity: Math.round(line.quantity * 100) / 100,
        unitCostKobo: line.unitCostNaira !== undefined && line.unitCostNaira >= 0 ? Math.round(line.unitCostNaira * 100) : undefined,
      });
    }
    if (lines.length === 0) throw new ConvexError("Add at least one item with a quantity.");
    const costed = lines.filter((l) => l.unitCostKobo !== undefined);
    const now = Date.now();
    const purchaseId = await ctx.db.insert("clinicPurchases", {
      clinicId: clinic._id,
      supplier,
      purchasedAt: args.purchasedAt,
      lines,
      totalKobo: costed.length ? costed.reduce((sum, l) => sum + (l.unitCostKobo ?? 0) * l.quantity, 0) : undefined,
      notes: clean(args.notes, 1000),
      createdBy: user._id,
      createdAt: now,
    });
    // Restock consumables bought here
    for (const line of lines) {
      if (!line.itemId) continue;
      const item = await ctx.db.get(line.itemId);
      if (!item || item.kind !== "consumable") continue;
      const quantity = Math.round(((item.quantity ?? 0) + line.quantity) * 100) / 100;
      await ctx.db.patch(item._id, {
        quantity,
        updatedAt: now,
        ...(item.minStock !== undefined && quantity > item.minStock ? { lowStockAlertedAt: undefined } : {}),
      });
      await ctx.db.insert("clinicInventoryMovements", {
        clinicId: clinic._id,
        itemId: item._id,
        change: line.quantity,
        reason: "purchase",
        note: `From ${supplier}`,
        userId: user._id,
        createdAt: now,
      });
    }
    return { purchaseId };
  },
});

/**
 * Daily: tell each clinic (owner, and equipment's responsible person) about stock at or below its
 * minimum and maintenance coming up within a week. Once per item, until restocked or rescheduled.
 */
export const sendInventoryAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let sent = 0;
    for (const clinic of await ctx.db.query("clinics").collect()) {
      if (!(await inventoryIncluded(ctx, clinic._id))) continue;
      const items = (
        await ctx.db
          .query("clinicInventoryItems")
          .withIndex("by_clinic", (q) => q.eq("clinicId", clinic._id))
          .collect()
      ).filter((item) => !item.archived);
      const low = items.filter((i) => isLow(i) && i.lowStockAlertedAt === undefined);
      const due = items.filter((i) => maintenanceSoon(i, now) && i.maintenanceAlertedAt === undefined);
      if (low.length > 0) {
        await insertNotification(ctx, {
          userId: clinic.ownerId,
          type: "clinic_inventory",
          priority: "medium",
          status: "pending",
          createdAt: now,
          payload: {
            title: low.length === 1 ? `Running low: ${low[0].name}` : `${low.length} supplies running low`,
            body: low.slice(0, 4).map((i) => `${i.name} (${i.quantity ?? 0}${i.unit ? ` ${i.unit}` : ""} left)`).join(", "),
            data: { entityId: String(clinic._id), entityType: "clinic_inventory" },
            link: "/dashboard/clinic/inventory",
          },
        });
        for (const item of low) await ctx.db.patch(item._id, { lowStockAlertedAt: now });
        sent++;
      }
      for (const item of due) {
        const recipients = new Set<Id<"users">>([clinic.ownerId, ...(item.responsibleUserId ? [item.responsibleUserId] : [])]);
        for (const userId of recipients) {
          await insertNotification(ctx, {
            userId,
            type: "clinic_inventory",
            priority: "medium",
            status: "pending",
            createdAt: now,
            payload: {
              title: `Maintenance due: ${item.name}`,
              body: item.maintenanceDueAt && item.maintenanceDueAt < now ? "Its service date has passed." : "Its service is due within a week.",
              data: { entityId: String(item._id), entityType: "clinic_inventory" },
              link: "/dashboard/clinic/inventory",
            },
          });
        }
        await ctx.db.patch(item._id, { maintenanceAlertedAt: now });
        sent++;
      }
    }
    return { sent };
  },
});
