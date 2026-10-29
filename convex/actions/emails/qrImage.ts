"use node";

import QRCode from "qrcode";
import type { ActionCtx } from "../../_generated/server";
import { qrCode } from "../../../lib/email/layout";

/**
 * A QR code for an email, made here and kept in Convex file storage. Invite links carry their
 * secret code, so they never go to an outside QR service. Node actions only ("use node").
 */
export async function storedQrImageUrl(ctx: ActionCtx, text: string): Promise<string | null> {
  try {
    const png = await QRCode.toBuffer(text, {
      type: "png",
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#16181c", light: "#ffffff" },
    });
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(png)], { type: "image/png" }));
    return await ctx.storage.getUrl(storageId);
  } catch (error) {
    console.error("[QR] could not make the image:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

/** The email's "Or scan…" block, or nothing when the image couldn't be made (the button still works). */
export async function qrBlock(ctx: ActionCtx, link: string, caption: string, escape: (value: string) => string): Promise<string> {
  const url = await storedQrImageUrl(ctx, link);
  return url ? qrCode(escape(url), caption) : "";
}
