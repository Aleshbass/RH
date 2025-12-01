
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const getAppointment = internalQuery({
    args: { appointmentId: v.id("appointments") },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.appointmentId);
    },
});
