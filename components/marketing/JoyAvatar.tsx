import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Joy's profile picture in the WhatsApp chat mock-ups: the Rehabify isotype (Isotype II).
 * Decorative, because "Joy · Rehabify" is written next to it.
 */
export function JoyAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logos/rehabify-isotype-ii.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full", className)}
    />
  );
}
