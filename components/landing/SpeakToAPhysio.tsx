"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "@/components/icons";
import { joyWhatsAppUrl } from "@/lib/joyWhatsApp";

const conditions = [
    "Back Pain & Neck Stiffness",
    "Sports Injuries & Recovery",
    "Post-Surgery Rehabilitation",
    "Stroke Recovery & Neuro Cases",
    "Arthritis & Joint Pain",
    "Pregnancy-Related Pain",
    "Work-Related Injuries",
    "Posture Correction",
    "Chronic Pain Management",
    "Mobility After Accidents",
];

const getWhatsAppUrl = (condition?: string) =>
    joyWhatsAppUrl(
        condition
            ? `Hi Joy! 👋🏾 I need help with my recovery for: ${condition}.`
            : "Hi Joy! 👋🏾 I need help with my recovery."
    );

/** Each concern opens Joy on WhatsApp with it already typed. */
export function SpeakToAPhysio() {
    const reduce = useReducedMotion();
    return (
        <section className="bg-rh-canvas px-4 pb-4 pt-20 sm:px-6 lg:pt-28">
            <div className="mx-auto max-w-6xl">
                <motion.h2
                    initial={reduce ? false : { opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="text-[36px] font-bold leading-tight tracking-tight text-rh-ink sm:text-5xl"
                >
                    Speak to a physio for:
                </motion.h2>

                <div className="mt-8 flex flex-wrap gap-2.5">
                    {conditions.map((condition, i) => (
                        <motion.a
                            key={condition}
                            href={getWhatsAppUrl(condition)}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={reduce ? false : { opacity: 0, y: 8 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.3, delay: i * 0.03 }}
                            className="rounded-full bg-white px-5 py-3 text-[15px] font-medium text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition-colors duration-200 hover:bg-rh-lime hover:ring-rh-lime focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink"
                        >
                            {condition}
                        </motion.a>
                    ))}
                </div>

                <a
                    href={getWhatsAppUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-rh-ink underline-offset-4 hover:underline"
                >
                    Not sure where you fit? Talk to Joy
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </a>
            </div>
        </section>
    );
}
