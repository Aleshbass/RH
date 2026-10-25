'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { ArrowRight, WhatsApp } from '@/components/icons';
import { joyWhatsAppUrl } from '@/lib/joyWhatsApp';
import { cn } from '@/lib/utils';

const EASE = [0.22, 1, 0.36, 1] as const;

const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.35, delayChildren: 0.2 } } };
const rise: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } } };

/** Plays its children in once it scrolls into view, and again whenever it remounts. */
function Sequence({ children, className }: { children: ReactNode; className?: string }) {
    const reduce = useReducedMotion();
    return (
        <motion.span
            className={className}
            variants={stagger}
            initial={reduce ? false : 'hidden'}
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
        >
            {children}
        </motion.span>
    );
}

// The mock panels are a fixed 150px tall, so every card is the same size whatever it shows
function ConcernMock() {
    const chips = ['Lower back', 'Knee', 'Neck & shoulder', 'Sports injury'];
    return (
        <Sequence className="flex h-full flex-col justify-between">
            <motion.span variants={rise} className="flex flex-wrap gap-1.5">
                {chips.map((chip, i) => (
                    <motion.span
                        key={chip}
                        variants={i === 0 ? { hidden: {}, show: { backgroundColor: '#0b1312', color: '#ffffff', transition: { delay: 0.5 } } } : undefined}
                        className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-rh-ink ring-1 ring-inset ring-rh-ink/10"
                    >
                        {chip}
                    </motion.span>
                ))}
            </motion.span>
            <motion.span variants={rise} className="block max-w-[90%] truncate rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] text-rh-ink">
                How long has your back been hurting?
            </motion.span>
        </Sequence>
    );
}

function MatchMock() {
    return (
        <Sequence className="flex h-full flex-col justify-center gap-2.5">
            <motion.span
                variants={{ hidden: { opacity: 0, x: 40 }, show: { opacity: 1, x: 0, transition: { duration: 0.55, ease: EASE } } }}
                className="flex items-center gap-3 rounded-2xl bg-white p-3"
            >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rh-ink text-sm font-bold text-white">CN</span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-rh-ink">Chidera N.</span>
                    <span className="block truncate text-xs text-rh-ink/60">Spine &amp; joint physiotherapist</span>
                </span>
                <motion.span
                    variants={{ hidden: { scale: 0, opacity: 0 }, show: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 500, damping: 22 } } }}
                    className="rounded-full bg-rh-lime px-2.5 py-1 text-[11px] font-semibold text-rh-ink"
                >
                    Matched
                </motion.span>
            </motion.span>
            <motion.span variants={rise} className="grid grid-cols-2 gap-2 text-xs font-medium">
                <span className="truncate rounded-xl bg-white px-3 py-2 text-rh-ink/75">MRTBN licensed</span>
                <span className="truncate rounded-xl bg-white px-3 py-2 text-rh-ink/75">Clinic, home or online</span>
            </motion.span>
        </Sequence>
    );
}

function RecoveryMock() {
    return (
        <Sequence className="flex h-full flex-col justify-end gap-2">
            <motion.span variants={rise} className="block max-w-[90%] truncate rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13px] text-rh-ink">
                Time for your 12-minute back routine
            </motion.span>
            <motion.span variants={rise} className="ml-auto block max-w-[75%] truncate rounded-2xl rounded-tr-sm bg-rh-lime px-3.5 py-2.5 text-[13px] text-rh-ink">
                Done! Less pain today
            </motion.span>
        </Sequence>
    );
}

const STEPS = [
    {
        title: 'Tell us what hurts',
        body: 'Answer a few simple questions in plain words. No confusing medical terms needed.',
        Mock: ConcernMock,
    },
    {
        title: 'Get matched',
        body: 'We pair you with an MRTBN-licensed physiotherapist based on your condition and location.',
        Mock: MatchMock,
    },
    {
        title: 'Book & recover with Joy',
        body: 'Attend sessions and stay on track between appointments with Joy, your daily WhatsApp recovery companion.',
        Mock: RecoveryMock,
    },
];

export function HowItWorks() {
    const reduce = useReducedMotion();
    const [active, setActive] = useState<number | null>(null);
    // Bumped on every tap so the chosen card's animation plays again
    const [plays, setPlays] = useState([0, 0, 0]);

    const toggle = (i: number) => {
        setActive((current) => (current === i ? null : i));
        setPlays((p) => p.map((n, j) => (j === i ? n + 1 : n)));
    };

    return (
        <section id="how-it-works" className="overflow-x-clip bg-rh-canvas px-4 py-20 sm:px-6 lg:py-28">
            <div className="mx-auto max-w-6xl">
                <motion.h2
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="max-w-2xl text-[36px] font-bold leading-[1.05] tracking-tight text-rh-ink sm:text-5xl"
                >
                    From pain to full recovery in 3 simple steps
                </motion.h2>

                <div className="mt-12 grid gap-5 lg:grid-cols-3">
                    {STEPS.map(({ title, body, Mock }, i) => {
                        const isActive = active === i;
                        const dimmed = active !== null && !isActive;
                        return (
                            <motion.div
                                key={title}
                                initial={reduce ? false : { opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.5, ease: EASE, delay: i * 0.1 }}
                                className={cn('flex', isActive && 'relative z-10')}
                            >
                                <motion.button
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => toggle(i)}
                                    animate={{ scale: !reduce && isActive ? 1.05 : 1, opacity: dimmed ? 0.6 : 1 }}
                                    whileHover={reduce ? undefined : { y: -6, scale: isActive ? 1.05 : 1.03, opacity: 1 }}
                                    whileTap={reduce ? undefined : { scale: 0.98 }}
                                    transition={{ duration: 0.4, ease: EASE }}
                                    className={cn(
                                        'group relative flex w-full flex-col rounded-[1.75rem] bg-white p-5 text-left ring-inset transition-shadow sm:p-6',
                                        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rh-lime',
                                        isActive ? 'shadow-lift ring-2 ring-rh-ink' : 'ring-1 ring-rh-ink/[0.06]',
                                    )}
                                >
                                    <span className="flex items-start gap-3">
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rh-ink text-sm font-bold text-white">
                                            {String(i + 1).padStart(2, '0')}
                                        </span>
                                        <span className="pt-1.5 text-lg font-bold leading-snug text-rh-ink sm:text-xl">{title}</span>
                                    </span>
                                    <span className="mb-5 mt-3 block text-[15px] font-medium leading-relaxed text-rh-ink/80">{body}</span>
                                    <span className="mt-auto block h-[150px] overflow-hidden rounded-[1.25rem] bg-rh-canvas">
                                        <span
                                            className={cn(
                                                'block h-full origin-center p-3.5 transition-transform duration-500 ease-out motion-reduce:transition-none',
                                                isActive ? 'scale-[1.06]' : 'group-hover:scale-[1.06]',
                                            )}
                                        >
                                            <Mock key={plays[i]} />
                                        </span>
                                    </span>
                                </motion.button>
                            </motion.div>
                        );
                    })}
                </div>

                <div className="mt-12 flex justify-center">
                    <a
                        href={joyWhatsAppUrl('Hi Joy! 👋🏾 I need help with my recovery.')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex h-14 items-center gap-3 rounded-full bg-rh-lime px-8 text-base font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rh-ink focus-visible:ring-offset-2"
                    >
                        <WhatsApp className="h-5 w-5" />
                        Get matched on WhatsApp
                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </a>
                </div>
            </div>
        </section>
    );
}
