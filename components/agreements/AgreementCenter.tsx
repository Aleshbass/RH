'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';
import { toast } from 'sonner';
import { CheckCircle2, Download, Hourglass, Loader2, ShieldCheck, ChevronDown } from '@/components/icons';
import { Block, anchor } from '@/components/legal/PolicyPage';
import {
  AGREEMENTS,
  REHABIFY_SIGNATORIES,
  SELF_SERVE_CLINIC_PLANS,
  agreementFieldErrors,
  filledAgreement,
  type AgreementId,
} from '@/lib/agreements';
import type { LegalDocument } from '@/lib/legal/types';
import { downloadAgreementPdf, formatSigned, verifyFingerprint, type SignedAgreement } from './agreementPdf';
import { DrawPad, DrawnSignature, TypedSignature, signatureFont } from './SignaturePad';

export type AgreementState = 'not_signed' | 'outdated' | 'awaiting_countersign' | 'active';

export type MyAgreementItem = {
  id: AgreementId;
  title: string;
  shortTitle: string;
  version: string;
  state: AgreementState;
  signature: SignedAgreement | null;
};

export type MyAgreements = {
  kind: 'physio' | 'clinic' | 'none';
  reason: string | null;
  items: MyAgreementItem[];
  prefill: Record<string, string>;
  canSign: boolean;
  signerEmail?: string;
  enforcedAt: number | null;
};

export const getMyAgreementsRef = makeFunctionReference<'query', Record<string, never>, MyAgreements | null>(
  'agreements:getMyAgreements'
);
const signAgreementRef = makeFunctionReference<
  'mutation',
  {
    agreementId: string;
    values: Record<string, string>;
    signatureName: string;
    signatureDrawing?: string;
    agreed: true;
    userAgent?: string;
  },
  { signatureId: string; status: string }
>('agreements:signAgreement');

const errorText = (error: unknown) =>
  error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Something went wrong. Please try again.';

export const STATE_LABEL: Record<AgreementState, string> = {
  not_signed: 'Not signed',
  outdated: 'New version to sign',
  awaiting_countersign: 'Waiting for Rehabify',
  active: 'Signed',
};

export function StateChip({ state }: { state: AgreementState | 'void' }) {
  const styles: Record<AgreementState | 'void', string> = {
    not_signed: 'bg-rh-ink/[0.06] text-rh-ink/70 dark:bg-white/10 dark:text-white/70',
    outdated: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200',
    awaiting_countersign: 'bg-rh-ink text-white dark:bg-white dark:text-rh-ink',
    active: 'bg-rh-lime text-rh-ink',
    void: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200',
  };
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${styles[state]}`}>
      {state === 'void' ? 'Void' : STATE_LABEL[state]}
    </span>
  );
}

/** The agreement on "paper": light in both themes, with a contents menu. */
export function AgreementPaper({ doc, children }: { doc: LegalDocument; children?: ReactNode }) {
  return (
    <article className="min-w-0 rounded-[1.75rem] bg-white p-5 text-rh-ink ring-1 ring-rh-ink/10 sm:p-8">
      <h2 className="text-2xl font-bold leading-tight tracking-tight sm:text-[28px]">{doc.title}</h2>
      <p className="mt-2 text-sm text-rh-ink/55">
        Effective {doc.effectiveDate} · Version {doc.version}
      </p>
      <details className="group mt-5 rounded-2xl bg-rh-canvas px-4 py-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          Contents
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <ol className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {doc.sections.map((section) => (
            <li key={section.title}>
              <a href={`#${anchor(section.title)}`} className="block rounded-lg px-2 py-1 text-rh-ink/70 hover:bg-white hover:text-rh-ink">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </details>
      <div className="mt-6 space-y-4">
        {doc.intro.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>
      <div className="mt-10 space-y-10">
        {doc.sections.map((section) => (
          <section key={section.title} id={anchor(section.title)} className="scroll-mt-28">
            <h3 className="text-lg font-bold leading-tight tracking-tight sm:text-xl">{section.title}</h3>
            <div className="mt-3 space-y-4">
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>
          </section>
        ))}
      </div>
      {children}
    </article>
  );
}

/** Both parties' signatures, as on the signed copy. */
export function ExecutionBlock({ signature }: { signature: SignedAgreement }) {
  const spec = AGREEMENTS[signature.agreementId];
  const party =
    spec.party === 'clinic'
      ? `For and on behalf of ${signature.values.clinicLegalName ?? 'the Clinic'}`
      : spec.countersign
        ? 'Signed by the Contractor'
        : 'The Practitioner';
  return (
    <div className="mt-12 border-t border-rh-ink/10 pt-8">
      <p className="text-[15px] leading-7 text-rh-ink/75">{spec.witness}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl p-5 ring-1 ring-inset ring-rh-ink/10">
          <p className="text-sm font-semibold">For and on behalf of Rehabify Limited</p>
          <div className="mt-3 flex h-16 items-end border-b border-rh-ink/70 pb-1">
            {signature.countersignName ? (
              <TypedSignature name={signature.countersignName} className="text-4xl" />
            ) : (
              <span className="text-sm text-rh-ink/50">
                {spec.countersign ? 'Awaiting Rehabify’s signature' : 'Accepted electronically on the platform'}
              </span>
            )}
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Name" value={signature.countersignName ?? (spec.countersign ? '—' : REHABIFY_SIGNATORIES[0].name)} />
            <Row label="Designation" value={signature.countersignTitle ?? (spec.countersign ? '—' : REHABIFY_SIGNATORIES[0].title)} />
            <Row
              label="Date"
              value={signature.countersignedAt ? formatSigned(signature.countersignedAt) : spec.countersign ? '—' : formatSigned(signature.signedAt)}
            />
          </dl>
        </div>
        <div className="rounded-2xl p-5 ring-1 ring-inset ring-rh-ink/10">
          <p className="text-sm font-semibold">{party}</p>
          <div className="mt-3 flex h-16 items-end border-b border-rh-ink/70 pb-1">
            {signature.signatureDrawing ? (
              <DrawnSignature path={signature.signatureDrawing} className="h-16 w-auto text-rh-ink" />
            ) : (
              <TypedSignature name={signature.signatureName} className="text-4xl" />
            )}
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Name" value={signature.signatureName} />
            {spec.party === 'clinic' ? (
              <Row label="Designation" value={signature.signatureTitle ?? '—'} />
            ) : (
              <Row label="MRTB Reg. No." value={signature.values.mrtbNumber ?? '—'} />
            )}
            <Row label="Date" value={formatSigned(signature.signedAt)} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-rh-ink/50">{label}</dt>
      <dd className="min-w-0 break-words text-rh-ink">{value}</dd>
    </div>
  );
}

export function useFingerprintCheck(signature: SignedAgreement | null) {
  const [verified, setVerified] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    setVerified(null);
    if (signature) void verifyFingerprint(signature).then((ok) => live && setVerified(ok));
    return () => {
      live = false;
    };
  }, [signature]);
  return verified;
}

export function DownloadCopyButton({ signature, className = '' }: { signature: SignedAgreement; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadAgreementPdf(signature, signatureFont.style.fontFamily);
        } catch {
          toast.error('Couldn’t create the PDF. Please try again.');
        } finally {
          setBusy(false);
        }
      }}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-full bg-rh-lime px-5 text-sm font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep disabled:opacity-60 ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Download signed copy
    </button>
  );
}

function SignedView({ item }: { item: MyAgreementItem & { signature: SignedAgreement } }) {
  const [open, setOpen] = useState(false);
  const signature = item.signature;
  const verified = useFingerprintCheck(signature);
  const waiting = item.state === 'awaiting_countersign';
  const doc = useMemo(() => filledAgreement(item.id, signature.values, signature.signedAt), [item.id, signature]);

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] bg-white p-5 ring-1 ring-rh-ink/10 sm:p-7 dark:bg-neutral-900 dark:ring-white/10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${waiting ? 'bg-rh-ink text-white dark:bg-white dark:text-rh-ink' : 'bg-rh-lime text-rh-ink'}`}
          >
            {waiting ? <Hourglass className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight text-rh-ink dark:text-white">{waiting ? 'Signed by you' : 'Fully signed'}</h2>
            <p className="mt-1 text-sm text-rh-ink/65 dark:text-white/65">
              {waiting
                ? 'Rehabify will countersign shortly. We’ll email you when it’s done. Your copy is ready to download now.'
                : 'This agreement is in effect. Keep a copy for your records.'}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <DownloadCopyButton signature={signature} />
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className="inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/15 hover:bg-rh-ink/[0.04] dark:text-white dark:ring-white/20 dark:hover:bg-white/5"
            >
              {open ? 'Hide agreement' : 'Read agreement'}
            </button>
          </div>
        </div>
        <dl className="mt-6 grid gap-4 border-t border-rh-ink/10 pt-5 text-sm sm:grid-cols-3 dark:border-white/10">
          <div>
            <dt className="text-rh-ink/50 dark:text-white/50">You signed</dt>
            <dd className="mt-1 font-medium text-rh-ink dark:text-white">{formatSigned(signature.signedAt)}</dd>
            <dd className="text-rh-ink/60 dark:text-white/60">as {signature.signatureName}</dd>
          </div>
          <div>
            <dt className="text-rh-ink/50 dark:text-white/50">Rehabify</dt>
            <dd className="mt-1 font-medium text-rh-ink dark:text-white">
              {signature.countersignedAt
                ? formatSigned(signature.countersignedAt)
                : AGREEMENTS[item.id].countersign
                  ? 'Waiting to countersign'
                  : 'Accepted online, no countersignature needed'}
            </dd>
            {signature.countersignName && (
              <dd className="text-rh-ink/60 dark:text-white/60">
                {signature.countersignName}, {signature.countersignTitle}
              </dd>
            )}
          </div>
          <div className="min-w-0">
            <dt className="text-rh-ink/50 dark:text-white/50">Document fingerprint</dt>
            <dd className="mt-1 truncate font-mono text-xs text-rh-ink dark:text-white" title={signature.documentHash}>
              {signature.documentHash}
            </dd>
            <dd className="mt-1 inline-flex items-center gap-1.5 text-rh-ink/60 dark:text-white/60">
              {verified === null ? (
                'Checking…'
              ) : verified ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-rh-lime-deep" /> Matches the signed text
                </>
              ) : (
                'Couldn’t check in this browser'
              )}
            </dd>
          </div>
        </dl>
      </section>
      {open && (
        <AgreementPaper doc={doc}>
          <ExecutionBlock signature={signature} />
        </AgreementPaper>
      )}
    </div>
  );
}

const inputClass =
  'mt-1.5 block h-11 w-full rounded-xl bg-white px-3.5 text-[15px] text-rh-ink ring-1 ring-inset ring-rh-ink/15 placeholder:text-rh-ink/35 focus:outline-none focus:ring-2 focus:ring-rh-ink dark:bg-neutral-950 dark:text-white dark:ring-white/15 dark:focus:ring-white';

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-rh-ink/10 pt-5 first:border-t-0 first:pt-0 dark:border-white/10">
      <legend className="flex items-center gap-2.5 text-sm font-semibold text-rh-ink dark:text-white">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rh-ink text-xs text-white dark:bg-white dark:text-rh-ink">{n}</span>
        {title}
      </legend>
      <div className="mt-4 space-y-4">{children}</div>
    </fieldset>
  );
}

function SignFlow({ item, data }: { item: MyAgreementItem; data: MyAgreements }) {
  const spec = AGREEMENTS[item.id];
  const sign = useMutation(signAgreementRef);
  const previous = item.signature;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const field of spec.fields) start[field.key] = previous?.values[field.key] ?? data.prefill[field.key] ?? '';
    if (spec.id === 'clinic_master_saas' && !start.plan) start.plan = SELF_SERVE_CLINIC_PLANS[0]?.id ?? '';
    return start;
  });
  const [mode, setMode] = useState<'type' | 'draw'>('type');
  const [typed, setTyped] = useState('');
  const [drawing, setDrawing] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const errors = agreementFieldErrors(item.id, values);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const nameMatches = typed.trim() !== '' && norm(typed) === norm(values.signerName ?? '');
  const ready = Object.keys(errors).length === 0 && nameMatches && (mode === 'type' || drawing !== '') && agreed;
  const preview = useMemo(() => filledAgreement(item.id, values, now, { mark: true }), [item.id, values, now]);

  const detailFields = spec.fields.filter((field) => !field.orderForm);
  const orderFields = spec.fields.filter((field) => field.orderForm && field.key !== 'plan');
  const hasOrderForm = spec.fields.some((field) => field.orderForm);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!ready || busy) return;
    setBusy(true);
    try {
      await sign({
        agreementId: item.id,
        values,
        signatureName: typed,
        signatureDrawing: mode === 'draw' ? drawing : undefined,
        agreed: true,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });
      toast.success(spec.countersign ? 'Signed. Rehabify will countersign shortly.' : 'Signed. Your agreement is in effect.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  const field = (f: (typeof spec.fields)[number]) => {
    const error = tried ? errors[f.key] : undefined;
    const id = `agreement-${f.key}`;
    return (
      <div key={f.key}>
        <label htmlFor={id} className="text-sm font-medium text-rh-ink dark:text-white">
          {f.label}
        </label>
        {f.options ? (
          <select
            id={id}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className={inputClass}
            aria-invalid={Boolean(error)}
          >
            <option value="">Choose…</option>
            {f.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={f.type === 'email' ? 'email' : 'text'}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            className={inputClass}
            aria-invalid={Boolean(error)}
            autoComplete="off"
          />
        )}
        {error ? (
          <p className="mt-1.5 text-sm text-red-600 dark:text-red-300">{error}</p>
        ) : (
          f.hint && <p className="mt-1.5 text-sm text-rh-ink/55 dark:text-white/55">{f.hint}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {item.state === 'outdated' && (
        <div className="rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-950 ring-1 ring-inset ring-amber-200 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-300/20">
          We’ve updated this agreement (version {spec.version}). Please read it and sign the new version. Your earlier signature stays on
          record.
        </div>
      )}
      {/* Side by side when the page is wide enough (clinic); stacked in the physio settings column */}
      <div className="@container">
      <div className="grid gap-6 @5xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section className="rounded-[1.75rem] bg-rh-ink p-6 text-white sm:p-7">
            <h2 className="text-lg font-bold">In short</h2>
            <ul className="mt-4 space-y-3">
              {spec.keyPoints.map((point) => (
                <li key={point} className="flex gap-3 text-[15px] leading-6 text-white/85">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-rh-lime" />
                  {point}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-white/55">A summary only. The agreement below is what you sign.</p>
            <a
              href="#sign-agreement"
              className="mt-5 inline-flex h-10 items-center rounded-full bg-rh-lime px-4 text-sm font-semibold text-rh-ink hover:bg-rh-lime-deep @5xl:hidden"
            >
              Go to signing
            </a>
          </section>
          <div className="max-h-[72vh] overflow-y-auto overscroll-contain rounded-[1.75rem]" tabIndex={0} aria-label="Agreement text">
            <AgreementPaper doc={preview} />
          </div>
        </div>

        <aside id="sign-agreement" className="scroll-mt-24 self-start @5xl:sticky @5xl:top-24">
          {!data.canSign ? (
            <div className="rounded-[1.75rem] bg-white p-6 text-sm text-rh-ink/70 ring-1 ring-rh-ink/10 dark:bg-neutral-900 dark:text-white/70 dark:ring-white/10">
              Only the clinic owner can sign for the clinic. You can read the agreement here.
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-5 rounded-[1.75rem] bg-white p-5 ring-1 ring-rh-ink/10 sm:p-6 @5xl:max-h-[calc(100vh-7rem)] @5xl:overflow-y-auto dark:bg-neutral-900 dark:ring-white/10"
              noValidate
            >
              <Step n={1} title="Your details">
                <p className="-mt-1 text-sm text-rh-ink/55 dark:text-white/55">They appear in the agreement as you type.</p>
                {detailFields.map(field)}
              </Step>

              {hasOrderForm && (
                <Step n={2} title="Order form">
                  <div role="radiogroup" aria-label="Plan" className="grid gap-2">
                    {SELF_SERVE_CLINIC_PLANS.map((plan) => {
                      const selected = values.plan === plan.id;
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setValues((v) => ({ ...v, plan: plan.id }))}
                          className={`rounded-2xl p-4 text-left ring-1 ring-inset transition-colors ${
                            selected
                              ? 'bg-rh-ink text-white ring-rh-ink dark:bg-white dark:text-rh-ink dark:ring-white'
                              : 'text-rh-ink ring-rh-ink/15 hover:bg-rh-ink/[0.03] dark:text-white dark:ring-white/15'
                          }`}
                        >
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="font-semibold">{plan.name}</span>
                            <span className="text-sm font-semibold">{plan.price}/mo</span>
                          </span>
                          <span className={`mt-1 block text-sm ${selected ? 'opacity-75' : 'text-rh-ink/60 dark:text-white/60'}`}>
                            {plan.seats} · {plan.programmes}
                          </span>
                        </button>
                      );
                    })}
                    <p className="px-1 text-sm text-rh-ink/55 dark:text-white/55">
                      Need more clinicians or branches?{' '}
                      <Link href="/platform/clinics" className="font-medium text-rh-ink underline underline-offset-4 dark:text-white">
                        Talk to us about Enterprise
                      </Link>
                      .
                    </p>
                  </div>
                  {orderFields.map(field)}
                </Step>
              )}

              <Step n={hasOrderForm ? 3 : 2} title="Sign">
                <div className="inline-flex rounded-full bg-rh-ink/[0.06] p-1 dark:bg-white/10" role="tablist" aria-label="How to sign">
                  {(['type', 'draw'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      role="tab"
                      aria-selected={mode === option}
                      onClick={() => setMode(option)}
                      className={`h-8 rounded-full px-4 text-sm font-semibold transition-colors ${
                        mode === option ? 'bg-white text-rh-ink shadow-sm dark:bg-neutral-800 dark:text-white' : 'text-rh-ink/60 dark:text-white/60'
                      }`}
                    >
                      {option === 'type' ? 'Type' : 'Draw'}
                    </button>
                  ))}
                </div>
                <div>
                  <label htmlFor="agreement-typed" className="text-sm font-medium text-rh-ink dark:text-white">
                    Type your full name to sign
                  </label>
                  <input
                    id="agreement-typed"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={values.signerName || 'Your full name'}
                    className={inputClass}
                    autoComplete="off"
                    aria-invalid={tried && !nameMatches}
                  />
                  {tried && !nameMatches && (
                    <p className="mt-1.5 text-sm text-red-600 dark:text-red-300">Type your name exactly as in your details above.</p>
                  )}
                </div>
                {mode === 'type' ? (
                  <div className="rounded-2xl bg-white px-4 pb-2 pt-4 ring-1 ring-inset ring-rh-ink/10">
                    <div className="flex h-14 items-end border-b border-rh-ink/60 pb-1">
                      {typed.trim() ? (
                        <TypedSignature name={typed.trim()} className="text-[40px]" />
                      ) : (
                        <span className="text-sm text-rh-ink/40">Your signature appears here</span>
                      )}
                    </div>
                    <p className="pt-1.5 text-xs text-rh-ink/50">Signature</p>
                  </div>
                ) : (
                  <DrawPad value={drawing} onChange={setDrawing} />
                )}
                {tried && mode === 'draw' && !drawing && <p className="text-sm text-red-600 dark:text-red-300">Draw your signature, or switch to Type.</p>}
              </Step>

              <label className="flex cursor-pointer gap-3 rounded-2xl bg-rh-canvas p-4 text-sm leading-6 text-rh-ink dark:bg-white/5 dark:text-white">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-rh-ink"
                />
                <span>
                  I’ve read the {spec.title} and agree to it{spec.party === 'clinic' ? ' for the clinic, and I’m authorised to sign for it' : ''}. I’m signing
                  electronically, and this has the same effect as my handwritten signature.
                </span>
              </label>
              {tried && !agreed && <p className="-mt-3 text-sm text-red-600 dark:text-red-300">Tick the box to agree.</p>}

              <button
                type="submit"
                disabled={busy || !agreed}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rh-lime text-[15px] font-semibold text-rh-ink transition-colors hover:bg-rh-lime-deep disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign agreement
              </button>
              <p className="text-center text-xs leading-5 text-rh-ink/50 dark:text-white/50">
                Signing as {data.signerEmail || 'your account'}. We record the date, time and a fingerprint of the exact text, and email you a
                confirmation.
              </p>
            </form>
          )}
        </aside>
      </div>
      </div>
    </div>
  );
}

/**
 * Everything a physio or clinic needs to read, sign and download their Rehabify agreement(s).
 * Several agreements (a physio who sees both kinds of patient) get a switcher.
 */
export function AgreementCenter({ data }: { data: MyAgreements }) {
  const firstOpen = data.items.find((item) => item.state === 'not_signed' || item.state === 'outdated')?.id ?? data.items[0]?.id;
  const [selected, setSelected] = useState<AgreementId | undefined>(firstOpen);
  const item = data.items.find((entry) => entry.id === selected) ?? data.items[0];

  if (data.kind === 'none' || !item) {
    return (
      <div className="rounded-[1.75rem] bg-white p-6 text-sm text-rh-ink/70 ring-1 ring-rh-ink/10 dark:bg-neutral-900 dark:text-white/70 dark:ring-white/10">
        {data.reason ?? 'There’s nothing to sign right now.'}
      </div>
    );
  }

  const signed = item.signature && (item.state === 'active' || item.state === 'awaiting_countersign');

  return (
    <div className="space-y-5">
      {data.items.length > 1 && (
        <div className="grid gap-2 sm:grid-cols-2" role="tablist" aria-label="Your agreements">
          {data.items.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === item.id}
              onClick={() => setSelected(entry.id)}
              className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left ring-1 ring-inset transition-colors ${
                entry.id === item.id
                  ? 'bg-white ring-rh-ink dark:bg-neutral-900 dark:ring-white'
                  : 'ring-rh-ink/10 hover:bg-white/60 dark:ring-white/10 dark:hover:bg-white/5'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-rh-ink dark:text-white">{entry.shortTitle}</span>
                <span className="block text-xs text-rh-ink/55 dark:text-white/55">Version {entry.version}</span>
              </span>
              <StateChip state={entry.state} />
            </button>
          ))}
        </div>
      )}
      {data.enforcedAt && !signed && (
        <p className="rounded-2xl bg-rh-ink px-5 py-4 text-sm text-white">
          {data.enforcedAt <= Date.now()
            ? 'Rehabify patients can’t book you until you sign.'
            : `Please sign by ${new Date(data.enforcedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. After that, Rehabify patients can’t book you until you do.`}
        </p>
      )}
      {signed && item.signature ? (
        <SignedView key={item.signature.id} item={{ ...item, signature: item.signature }} />
      ) : (
        <SignFlow key={`${item.id}:${item.version}`} item={item} data={data} />
      )}
    </div>
  );
}
