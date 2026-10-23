"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Briefcase, Clock, Home, Loader2, MapPin, Star, Video } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { formatKobo, getService, isBookableServiceId, type BookableServiceId } from "@/lib/rehabify-services";
import { ServiceOption } from "@/components/booking/ServiceOption";
import { ServiceAreaPicker } from "@/components/booking/ServiceAreaPicker";
import {
    initialsOf,
    queryString,
    servicePriceLabel,
    virtualAlternative,
    zoneCities,
    zoneForArea,
    type Catalogue,
    type CatalogueService,
    type ServiceQuote,
    type TravelZone,
} from "@/components/booking/booking-shared";

/** One row of api.marketplace.search.findPhysiosForService. */
type ServicePhysio = {
    id: string;
    fullName: string;
    imageUrl?: string;
    bio: string;
    specializations: string[];
    yearsOfExperience: number;
    location?: string;
    averageRating: number;
    reviewCount: number;
    isVerified: boolean;
    bookingSlug: string | null;
};

const ASSESSMENTS = ["virtual_assessment", "home_assessment"];
const TREATMENTS = ["virtual_treatment", "home_treatment"];

const cardClass = "rounded-[28px] bg-white p-5 text-rh-night shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] sm:p-7";

const primaryButton =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rh-lime px-4 text-sm font-semibold text-rh-night shadow-[0_10px_24px_-12px_rgba(0,205,15,0.9)] transition-[filter,transform] hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-night focus-visible:ring-offset-2";

/** Night-green frame under the site header (the /book pages use BookingShell instead). */
function Frame({ children }: { children: ReactNode }) {
    return (
        <div className="relative min-h-dvh overflow-x-hidden bg-rh-night text-white">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_80%_0%,rgba(0,205,15,0.16),transparent_70%),radial-gradient(50%_50%_at_0%_10%,rgba(0,91,87,0.55),transparent_70%)]"
            />
            <div className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28">{children}</div>
        </div>
    );
}

function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
    return (
        <div
            className={cn(
                "flex items-start gap-2.5 rounded-2xl p-4 text-sm ring-1 ring-inset",
                tone === "info" ? "bg-rh-canvas/80 text-rh-night/80 ring-rh-night/[0.06]" : "bg-amber-50 text-amber-950 ring-amber-200"
            )}
        >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">{children}</div>
        </div>
    );
}

function Loading() {
    return (
        <Frame>
            <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-rh-lime" aria-label="Loading" />
            </div>
        </Frame>
    );
}

export default function GetCarePage() {
    return (
        <Suspense fallback={<Loading />}>
            <GetCare />
        </Suspense>
    );
}

function GetCare() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reduceMotion = useReducedMotion();
    const { isSignedIn } = useUser();

    // ?service=&zone=&area= (the /pricing page links here)
    const serviceParam = searchParams.get("service") ?? "";
    const zoneParam = searchParams.get("zone") ?? "";
    const areaParam = searchParams.get("area") ?? "";

    const [serviceId, setServiceId] = useState<BookableServiceId | null>(
        isBookableServiceId(serviceParam) ? serviceParam : null
    );
    const [city, setCity] = useState("");
    const [area, setArea] = useState("");
    const prefilledRef = useRef(false);

    const catalogue = useQuery(api.serviceTariffs.getCatalogue) as Catalogue | undefined;
    const service = catalogue?.services.find((s) => s.id === serviceId && s.bookable) ?? null;
    const isHome = serviceId ? getService(serviceId)?.mode === "home" : false;
    const zones = useQuery(api.travelZones.listZones, isHome ? {} : "skip") as TravelZone[] | undefined;
    const zone = isHome ? zoneForArea(zones, city, area) : null;
    const ready = Boolean(service && (!isHome || zone));

    const quote = useQuery(
        api.marketplace.booking.getServiceQuote,
        ready && service ? { serviceId: service.id, ...(zone ? { zoneId: zone.id } : {}) } : "skip"
    ) as ServiceQuote | undefined;
    const physios = useQuery(
        api.marketplace.search.findPhysiosForService,
        ready && service ? { serviceId: service.id, ...(zone ? { zoneId: zone.id } : {}), limit: 24 } : "skip"
    ) as ServicePhysio[] | undefined;

    // Prefill the area once the zones load
    useEffect(() => {
        if (prefilledRef.current || !zones) return;
        prefilledRef.current = true;
        const match = (z: TravelZone, wanted: string) => z.areas.find((a) => a.toLowerCase() === wanted.trim().toLowerCase());
        const byParam = zones.find((z) => z.id === zoneParam);
        if (byParam) {
            setCity(byParam.city);
            const found = areaParam ? match(byParam, areaParam) : undefined;
            if (found) setArea(found);
            return;
        }
        if (areaParam) {
            for (const z of zones) {
                const found = match(z, areaParam);
                if (found) {
                    setCity(z.city);
                    setArea(found);
                    return;
                }
            }
        }
        const cities = zoneCities(zones);
        if (cities.length === 1) setCity(cities[0]);
    }, [zones, zoneParam, areaParam]);

    const syncUrl = (next: { service: string | null; zone?: string | null; area?: string | null }) => {
        router.replace(`/get-care${queryString({ service: next.service, zone: next.zone, area: next.area })}`, { scroll: false });
    };

    const chooseService = (id: BookableServiceId) => {
        setServiceId(id);
        const home = getService(id)?.mode === "home";
        syncUrl({ service: id, zone: home ? zone?.id : null, area: home && zone ? area : null });
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    };

    const changeArea = (next: { city: string; area: string }) => {
        setCity(next.city);
        setArea(next.area);
        const nextZone = zoneForArea(zones, next.city, next.area);
        syncUrl({ service: serviceId, zone: nextZone?.id, area: nextZone ? next.area : null });
    };

    if (catalogue === undefined) return <Loading />;

    const byId = (id: string) => catalogue.services.find((s) => s.id === id);
    const pricingCopy = (
        <p className="mt-6 text-center text-sm text-white/60">
            The price you see is the price you pay. Your booking is confirmed once paid.
        </p>
    );

    // ── Step 1: choose a service ──
    if (!service) {
        const consultation = byId("recovery_consultation");
        const assessments = ASSESSMENTS.map(byId).filter((s): s is CatalogueService => Boolean(s?.bookable));
        const treatments = TREATMENTS.map(byId).filter((s): s is CatalogueService => Boolean(s?.bookable));
        const screening = byId("automated_screening");
        const requested = serviceParam ? byId(serviceParam) : undefined;

        return (
            <Frame>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Book physiotherapy</h1>
                <p className="mt-2 max-w-xl text-white/70">
                    Choose a service, then a physiotherapist. Every Rehabify physiotherapist charges the same standard price.
                </p>

                <motion.section
                    initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                    className={cn(cardClass, "mt-8 space-y-6")}
                    aria-label="Services"
                >
                    {requested && !requested.bookable && (
                        <Notice tone="warn">
                            <p>{requested.name} isn&#39;t available to book right now. Choose another service.</p>
                        </Notice>
                    )}

                    {consultation?.bookable && (
                        <ServiceOption
                            service={consultation}
                            highlight="Not sure where to start?"
                            onSelect={() => chooseService(consultation.id as BookableServiceId)}
                        />
                    )}

                    {assessments.length > 0 && (
                        <div>
                            <h2 className="mb-2.5 text-sm font-semibold text-rh-night/70">Assessments</h2>
                            <div className="space-y-2.5">
                                {assessments.map((option) => (
                                    <ServiceOption
                                        key={option.id}
                                        service={option}
                                        onSelect={() => chooseService(option.id as BookableServiceId)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {treatments.length > 0 && (
                        <div>
                            <h2 className="mb-2.5 text-sm font-semibold text-rh-night/70">Already had an assessment?</h2>
                            {isSignedIn ? (
                                <div className="space-y-2.5">
                                    {treatments.map((option) => (
                                        <ServiceOption
                                            key={option.id}
                                            service={option}
                                            onSelect={() => chooseService(option.id as BookableServiceId)}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <p className="rounded-2xl bg-rh-canvas/80 p-4 text-sm text-rh-night/75 ring-1 ring-inset ring-rh-night/[0.06]">
                                    Treatment sessions follow an assessment.{" "}
                                    <Link
                                        href={`/sign-in?redirect=${encodeURIComponent("/get-care")}`}
                                        className="font-semibold text-rh-night underline underline-offset-4 hover:no-underline"
                                    >
                                        Sign in
                                    </Link>{" "}
                                    to book treatment from {formatKobo(Math.min(...treatments.map((s) => s.priceKobo)))}.
                                </p>
                            )}
                        </div>
                    )}

                    {screening && !screening.bookable && <ServiceOption service={screening} />}
                </motion.section>

                {pricingCopy}
            </Frame>
        );
    }

    // ── Steps 2 and 3: price, area (home visits) and a physiotherapist ──
    const ModeIcon = isHome ? Home : Video;
    const quoteOk = quote?.ok ? quote : null;
    const alternative = virtualAlternative(service.id);
    const alternativeService = alternative ? byId(alternative) : undefined;
    const bookHref = (physio: ServicePhysio) =>
        `/book/${physio.bookingSlug || physio.id}/${service.id}${queryString({ zone: zone?.id, area: zone ? area : null })}`;

    const notCovered = (
        <Notice tone="warn">
            <p className="font-semibold">We don&#39;t cover your area for home visits yet — book a video session or contact us.</p>
            <div className="flex flex-wrap gap-2">
                {alternativeService?.bookable && (
                    <button
                        type="button"
                        onClick={() => chooseService(alternativeService.id as BookableServiceId)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rh-night px-3.5 text-sm font-semibold text-white transition-colors hover:bg-rh-night/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
                    >
                        <Video className="h-4 w-4" aria-hidden />
                        Book a video session
                    </button>
                )}
                <Link
                    href="/support"
                    className="inline-flex min-h-10 items-center rounded-xl border border-amber-300 bg-white px-3.5 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100"
                >
                    Contact us
                </Link>
            </div>
        </Notice>
    );

    return (
        <Frame>
            <button
                type="button"
                onClick={() => {
                    setServiceId(null);
                    syncUrl({ service: null });
                }}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-white/75 ring-1 ring-white/15 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                All services
            </button>

            <motion.section
                key={service.id}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
                className={cn(cardClass, "mt-6")}
                aria-labelledby="service-heading"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 id="service-heading" className="text-xl font-semibold tracking-tight sm:text-2xl">
                            {service.name}
                        </h1>
                        <ul className="mt-2 flex flex-wrap gap-1.5 text-xs font-medium text-rh-night/70">
                            <li className="inline-flex items-center gap-1 rounded-full bg-rh-night/[0.05] px-2.5 py-1">
                                <Clock className="h-3.5 w-3.5" aria-hidden /> {service.durationLabel}
                            </li>
                            <li className="inline-flex items-center gap-1 rounded-full bg-rh-night/[0.05] px-2.5 py-1">
                                <ModeIcon className="h-3.5 w-3.5" aria-hidden /> {isHome ? "Home visit" : "Video call"}
                            </li>
                        </ul>
                    </div>
                    <p className="text-right">
                        <span className="block text-2xl font-bold tabular-nums">
                            {quoteOk ? formatKobo(quoteOk.chargeKobo) : servicePriceLabel(service)}
                        </span>
                        <span className="text-xs text-rh-night/55">{quoteOk ? "all-inclusive" : isHome ? "plus travel for your area" : "all-inclusive"}</span>
                    </p>
                </div>

                <p className="mt-4 text-sm text-rh-night/70">{service.summary}</p>

                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div>
                        <h2 className="text-sm font-semibold">What happens</h2>
                        <ul className="mt-2 space-y-1.5 text-sm text-rh-night/70">
                            {service.whatHappens.map((item) => (
                                <li key={item} className="flex gap-2">
                                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rh-lime" aria-hidden />
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="space-y-3 text-sm">
                        <div>
                            <h2 className="font-semibold">You receive</h2>
                            <p className="mt-1 text-rh-night/70">{service.youReceive}</p>
                        </div>
                        {service.notIncluded && (
                            <div>
                                <h2 className="font-semibold">Good to know</h2>
                                <p className="mt-1 text-rh-night/70">{service.notIncluded}</p>
                            </div>
                        )}
                    </div>
                </div>

                {service.requiresPriorAssessment && (
                    <div className="mt-5">
                        <Notice>
                            <p>
                                This follows an assessment.{" "}
                                {isSignedIn
                                    ? "We'll check your records when you book."
                                    : "You'll need to sign in when you book so we can check your records."}
                            </p>
                        </Notice>
                    </div>
                )}
            </motion.section>

            {isHome && (
                <section className={cn(cardClass, "mt-4")} aria-labelledby="area-heading">
                    <h2 id="area-heading" className="mb-1 text-lg font-semibold tracking-tight">
                        Where should we visit?
                    </h2>
                    <p className="mb-4 text-sm text-rh-night/65">Choose your area to see the travel charge and who visits you.</p>
                    <ServiceAreaPicker zones={zones} city={city} area={area} onChange={changeArea} notCovered={notCovered} idPrefix="care" />
                </section>
            )}

            {ready && (
                <section className={cn(cardClass, "mt-4")} aria-label="Price">
                    {quote === undefined ? (
                        <p className="flex items-center gap-2 text-sm text-rh-night/60">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the price…
                        </p>
                    ) : quoteOk ? (
                        <dl className="space-y-2 text-sm">
                            {quoteOk.travelSurchargeKobo > 0 && (
                                <>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-rh-night/70">{service.shortName}</dt>
                                        <dd className="font-semibold tabular-nums">{formatKobo(quoteOk.basePriceKobo)}</dd>
                                    </div>
                                    <div className="flex items-baseline justify-between gap-3">
                                        <dt className="text-rh-night/70">Travel charge ({quoteOk.zoneName ?? zone?.name})</dt>
                                        <dd className="font-semibold tabular-nums">{formatKobo(quoteOk.travelSurchargeKobo)}</dd>
                                    </div>
                                </>
                            )}
                            <div
                                className={cn(
                                    "flex items-baseline justify-between gap-3",
                                    quoteOk.travelSurchargeKobo > 0 && "border-t border-rh-night/10 pt-2"
                                )}
                            >
                                <dt className="font-semibold">You pay</dt>
                                <dd className="text-xl font-bold tabular-nums">
                                    {formatKobo(quoteOk.chargeKobo)} <span className="text-xs font-normal text-rh-night/55">all-inclusive</span>
                                </dd>
                            </div>
                        </dl>
                    ) : (
                        <p className="text-sm text-red-700">{quote.ok ? "" : quote.message}</p>
                    )}
                </section>
            )}

            {ready && (
                <section className="mt-8" aria-labelledby="physios-heading">
                    <h2 id="physios-heading" className="text-lg font-semibold tracking-tight">
                        Choose a physiotherapist
                    </h2>
                    {physios === undefined ? (
                        <div className="mt-4 flex items-center gap-2 text-sm text-white/65">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Finding physiotherapists…
                        </div>
                    ) : physios.length === 0 ? (
                        <div className={cn(cardClass, "mt-4")}>
                            <p className="text-sm text-rh-night/75">
                                No physiotherapists are taking {service.shortName.toLowerCase()} bookings{isHome && area ? ` in ${area}` : ""} right
                                now.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {isHome && alternativeService?.bookable && (
                                    <button
                                        type="button"
                                        onClick={() => chooseService(alternativeService.id as BookableServiceId)}
                                        className={primaryButton}
                                    >
                                        <Video className="h-4 w-4" aria-hidden />
                                        Book a video session
                                    </button>
                                )}
                                <Link
                                    href="/support"
                                    className="inline-flex min-h-11 items-center rounded-xl border border-rh-night/15 bg-white px-4 text-sm font-semibold text-rh-night transition-colors hover:bg-rh-night/[0.04]"
                                >
                                    Contact us
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                            {physios.map((physio) => (
                                <PhysioOption key={physio.id} physio={physio} href={bookHref(physio)} />
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {pricingCopy}
        </Frame>
    );
}

function PhysioOption({ physio, href }: { physio: ServicePhysio; href: string }) {
    const years = Math.round(physio.yearsOfExperience || 0);
    const firstName = physio.fullName.split(" ")[0] || physio.fullName;
    const specialisations = physio.specializations.filter(Boolean).slice(0, 3);

    return (
        <li className="flex flex-col rounded-2xl bg-white p-4 text-rh-night shadow-[0_20px_50px_-30px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
            <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                    {physio.imageUrl ? (
                        <Image
                            src={physio.imageUrl}
                            alt={physio.fullName}
                            width={52}
                            height={52}
                            unoptimized
                            className="h-[52px] w-[52px] rounded-full object-cover ring-1 ring-rh-night/10"
                        />
                    ) : (
                        <div
                            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-rh-night text-base font-semibold text-white"
                            aria-hidden
                        >
                            {initialsOf(physio.fullName)}
                        </div>
                    )}
                    {physio.isVerified && (
                        <span
                            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-rh-lime text-rh-night ring-2 ring-white"
                            title="Verified by Rehabify"
                        >
                            <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                        </span>
                    )}
                </div>
                <div className="min-w-0">
                    <p className="truncate font-semibold">{physio.fullName}</p>
                    <p className="text-xs text-rh-night/60">{physio.isVerified ? "Physiotherapist · Verified" : "Physiotherapist"}</p>
                </div>
            </div>

            {(physio.reviewCount > 0 || years > 0 || physio.location) && (
                <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-rh-night/70">
                    {physio.reviewCount > 0 && (
                        <li className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                            <span className="tabular-nums">{physio.averageRating.toFixed(1)}</span>
                            <span className="text-rh-night/45">({physio.reviewCount})</span>
                        </li>
                    )}
                    {years > 0 && (
                        <li className="flex items-center gap-1">
                            <Briefcase className="h-3.5 w-3.5" aria-hidden />
                            {years} {years === 1 ? "year" : "years"} experience
                        </li>
                    )}
                    {physio.location && (
                        <li className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {physio.location}
                        </li>
                    )}
                </ul>
            )}

            {specialisations.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Specialisations">
                    {specialisations.map((spec) => (
                        <li key={spec} className="rounded-full bg-rh-night/[0.05] px-2.5 py-1 text-xs font-medium text-rh-night/80 ring-1 ring-inset ring-rh-night/10">
                            {spec}
                        </li>
                    ))}
                </ul>
            )}

            {physio.bio && <p className="mt-3 line-clamp-2 text-sm text-rh-night/65">{physio.bio}</p>}

            <div className="mt-auto pt-4">
                <Link href={href} className={cn(primaryButton, "w-full")}>
                    Book with {firstName}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
            </div>
        </li>
    );
}
