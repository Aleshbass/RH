import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Rehabify night-green page frame for the public /book pages. */
export function BookingShell({
    children,
    wide = false,
    topRight,
    className,
}: {
    children: ReactNode;
    /** Wide frame for the three-column calendar. */
    wide?: boolean;
    /** Shown opposite the logo (e.g. a "change session" link). */
    topRight?: ReactNode;
    className?: string;
}) {
    return (
        <div className="relative min-h-dvh overflow-x-hidden bg-rh-night text-white">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_80%_0%,rgba(0,205,15,0.16),transparent_70%),radial-gradient(50%_50%_at_0%_10%,rgba(0,91,87,0.55),transparent_70%)]"
            />
            <div
                className={cn(
                    "relative mx-auto w-full px-4 pb-14 pt-6 sm:px-6 sm:pt-10",
                    wide ? "max-w-[1120px]" : "max-w-2xl",
                    className
                )}
            >
                <div className="mb-8 flex items-center justify-between gap-3 sm:mb-10">
                    <Image
                        src="/logos/WhiteGreen MainRehabify.svg"
                        alt="Rehabify Health"
                        width={103}
                        height={28}
                        priority
                        className="h-7 w-auto"
                    />
                    {topRight && <div className="flex min-w-0 items-center gap-3">{topRight}</div>}
                </div>
                {children}
            </div>
        </div>
    );
}

export function PoweredBy() {
    return (
        <footer className="mt-10 text-center text-xs text-white/45">
            Powered by{" "}
            <Link href="/" className="font-semibold text-white/70 transition-colors hover:text-rh-lime">
                Rehabify Health
            </Link>
        </footer>
    );
}
