/**
 * Learn group rules shared by groups, the group home and the community (Mary 2026-11-17):
 * people pick their own group when they join Learn, each group holds up to its capacity (30–40
 * people, 40 unless an admin sets another number), and each group has one lead, its champion.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export const DEFAULT_GROUP_CAPACITY = 40;
/** Admins can set 2–200; self-joining stops at the capacity, admins can still add past it. */
export const MAX_GROUP_CAPACITY = 200;

export function groupCapacity(group: Pick<Doc<"learnGroups">, "capacity">): number {
  const c = group.capacity;
  return typeof c === "number" && c >= 2 ? Math.min(MAX_GROUP_CAPACITY, Math.round(c)) : DEFAULT_GROUP_CAPACITY;
}

export function groupIsFull(group: Pick<Doc<"learnGroups">, "capacity" | "memberCount">): boolean {
  return group.memberCount >= groupCapacity(group);
}

/** Shown in the group picker unless an admin closed it (or it's archived). */
export function groupIsOpen(group: Pick<Doc<"learnGroups">, "openToJoin" | "archived">): boolean {
  return !group.archived && group.openToJoin !== false;
}

/** The person's group for badges in the general community: the one they lead, else the first they joined. */
export async function groupBadgeFor(ctx: Ctx, userId: Id<"users">) {
  const rows = await ctx.db
    .query("learnGroupMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(10);
  rows.sort((a, b) => (a.role === b.role ? a.addedAt - b.addedAt : a.role === "lead" ? -1 : 1));
  for (const row of rows) {
    const group = await ctx.db.get(row.groupId);
    if (group && !group.archived) return { id: group._id, name: group.name, color: group.color, lead: row.role === "lead" };
  }
  return null;
}

/** Makes this person the group's only lead: anyone else who led it becomes a member. */
export async function makeOnlyLead(ctx: MutationCtx, groupId: Id<"learnGroups">, userId: Id<"users">) {
  const rows = await ctx.db
    .query("learnGroupMembers")
    .withIndex("by_group", (q) => q.eq("groupId", groupId))
    .take(MAX_GROUP_CAPACITY + 50);
  for (const row of rows) {
    if (row.userId === userId && row.role !== "lead") await ctx.db.patch(row._id, { role: "lead" });
    else if (row.userId !== userId && row.role === "lead") await ctx.db.patch(row._id, { role: "member" });
  }
}
