"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import crypto from "crypto";

// Upload signatures let the holder write to our ImageKit account, so only admins (the
// exercise library uploader) may get one.
export const getUploadAuth = action({
    args: {},
    handler: async (ctx) => {
        await ctx.runQuery(internal.monthlySettlements.assertAdminForAction, {});
        const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
        if (!privateKey) {
            throw new Error("IMAGEKIT_PRIVATE_KEY is not set");
        }

        const token = crypto.randomUUID();
        const expire = Math.floor(Date.now() / 1000) + 2400; // 40 minutes from now
        const privateKeyBuffer = Buffer.from(privateKey, "utf-8");
        const signature = crypto
            .createHmac("sha1", privateKeyBuffer)
            .update(token + expire)
            .digest("hex");

        return {
            token,
            expire,
            signature,
        };
    },
});
