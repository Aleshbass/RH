/**
 * Rehabify's signed agreements: who signs which, the details they fill in, and the exact text
 * they sign. The wording lives in lib/legal/agreements/*.ts with {{tokens}} for the other
 * party's details; `filledAgreement` swaps them in. Convex hashes `agreementPlainText` when
 * someone signs, so the stored record proves which words were agreed. Bump `version` (the
 * effective date) when the wording changes: people are asked to sign the new version.
 */
import { legalPlainText, p, table, type LegalDocument, type LegalSection } from './legal/types';
import { CLINIC_MASTER_SAAS_AGREEMENT } from './legal/agreements/clinicMasterSaas';
import { INDEPENDENT_PLATFORM_AGREEMENT } from './legal/agreements/independentPlatform';
import { NETWORK_CONTRACTOR_AGREEMENT } from './legal/agreements/networkContractor';
import { CLINIC_PLANS, CLINIC_PROGRAMME_OVERAGE_KOBO } from './clinicPlans';

export type AgreementId = 'network_contractor' | 'independent_platform' | 'clinic_master_saas';
export type AgreementParty = 'physiotherapist' | 'clinic';

export type AgreementField = {
  key: string;
  label: string;
  hint?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  type?: 'email';
  /** Shown in the Order Form step rather than "Your details" */
  orderForm?: boolean;
};

export type AgreementSpec = {
  id: AgreementId;
  title: string;
  /** For lists and buttons */
  shortTitle: string;
  party: AgreementParty;
  version: string;
  effectiveDate: string;
  /** Public read-only copy */
  href: string;
  document: LegalDocument;
  /** Plain-English points shown above the document. The agreement itself is what counts. */
  keyPoints: string[];
  fields: AgreementField[];
  /** Rehabify signs after the other party (network and clinic). Independent is accepted online. */
  countersign: boolean;
  /** The agreement's own closing line before the signatures, verbatim */
  witness: string;
};

/** Signs for Rehabify (clause headings of each agreement name them). */
export const REHABIFY_SIGNATORIES = [
  { name: 'Mary Akinwola', title: 'Chief Executive Officer' },
  { name: 'Ademola Abass', title: 'Chief Technical Officer' },
] as const;

const NAME_FIELD: AgreementField = { key: 'signerName', label: 'Full legal name', hint: 'As it appears on your MRTB licence.', required: true };
const MRTB_FIELD: AgreementField = { key: 'mrtbNumber', label: 'MRTB registration number', required: true };

const ENTITY_TYPES = [
  { value: 'company', label: 'Company limited by shares (RC)' },
  { value: 'business_name', label: 'Business name (BN)' },
  { value: 'partnership', label: 'Partnership (BN)' },
];

/** Plans a clinic can sign for online. Enterprise is agreed with the Rehabify team. */
export const SELF_SERVE_CLINIC_PLANS = CLINIC_PLANS.filter((plan) => plan.monthlyFeeKobo !== null);

export const AGREEMENTS: Record<AgreementId, AgreementSpec> = {
  network_contractor: {
    id: 'network_contractor',
    title: NETWORK_CONTRACTOR_AGREEMENT.title,
    shortTitle: 'Network contractor agreement',
    party: 'physiotherapist',
    version: NETWORK_CONTRACTOR_AGREEMENT.version,
    effectiveDate: NETWORK_CONTRACTOR_AGREEMENT.effectiveDate,
    href: '/agreements/network-physiotherapist',
    document: NETWORK_CONTRACTOR_AGREEMENT,
    keyPoints: [
      'You work as an independent contractor, not an employee. You set your availability and can decline any booking.',
      'Rehabify sets what patients pay. You earn the fixed payout shown when you accept a booking, plus the travel share on home visits. Discounts never reduce it, and no platform fee is deducted.',
      'Payouts are paid in weekly runs with a statement. You handle your own tax and give us a tax ID before your first payout.',
      'Write each session note within 24 hours, and keep patient information on the platform.',
      'Don’t take payment from Rehabify Care patients directly or move them off the platform.',
      'Either of us can end the agreement with 30 days’ written notice.',
    ],
    fields: [
      NAME_FIELD,
      MRTB_FIELD,
      {
        key: 'practiceName',
        label: 'Practice company (optional)',
        hint: 'Only if you contract through your own registered practice.',
        required: false,
      },
    ],
    countersign: true,
    witness: 'IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first written above.',
  },
  independent_platform: {
    id: 'independent_platform',
    title: INDEPENDENT_PLATFORM_AGREEMENT.title,
    shortTitle: 'Independent platform agreement',
    party: 'physiotherapist',
    version: INDEPENDENT_PLATFORM_AGREEMENT.version,
    effectiveDate: INDEPENDENT_PLATFORM_AGREEMENT.effectiveDate,
    href: '/agreements/independent-physiotherapist',
    document: INDEPENDENT_PLATFORM_AGREEMENT,
    keyPoints: [
      'The core workspace is free. There is no compulsory subscription.',
      'What you charge your own patients is yours. Rehabify takes no share and doesn’t collect your fees.',
      'You stay in charge of your patients’ records. Rehabify only processes them for you.',
      'Your patients can choose to buy Rehabify’s digital recovery plans directly from Rehabify.',
      'Fair-use limits apply to patients, videos and storage.',
    ],
    fields: [
      NAME_FIELD,
      MRTB_FIELD,
      { key: 'practiceName', label: 'Practice name', required: true },
      { key: 'practiceAddress', label: 'Practice address', required: true },
    ],
    countersign: false,
    witness:
      'IN WITNESS WHEREOF, the Parties have executed this Agreement on the date first written above, or the Practitioner has accepted it electronically.',
  },
  clinic_master_saas: {
    id: 'clinic_master_saas',
    title: CLINIC_MASTER_SAAS_AGREEMENT.title,
    shortTitle: 'Clinic agreement',
    party: 'clinic',
    version: CLINIC_MASTER_SAAS_AGREEMENT.version,
    effectiveDate: CLINIC_MASTER_SAAS_AGREEMENT.effectiveDate,
    href: '/agreements/clinic',
    document: CLINIC_MASTER_SAAS_AGREEMENT,
    keyPoints: [
      'A monthly subscription on your plan, billed in advance. Each active patient programme over your allowance is ₦500 a month.',
      'Payments from your patients go to your clinic. Rehabify charges no transaction fee on them.',
      'Your clinic controls its patients’ data. Rehabify processes it only to run the service for you.',
      'If you leave, you can export your data.',
      'Joy, Flex Max and Rehabify Care referrals aren’t included.',
    ],
    fields: [
      { key: 'clinicLegalName', label: 'Registered name of the clinic', hint: 'Exactly as registered with the CAC.', required: true },
      { key: 'entityType', label: 'Registered as', required: true, options: ENTITY_TYPES },
      { key: 'registrationNumber', label: 'RC or BN number', required: true },
      { key: 'clinicAddress', label: 'Registered address', required: true },
      { key: 'signerName', label: 'Your full name', hint: 'You confirm you are authorised to sign for the clinic.', required: true },
      { key: 'signerTitle', label: 'Your role', hint: 'For example Director or Managing Partner.', required: true },
      {
        key: 'plan',
        label: 'Plan',
        required: true,
        orderForm: true,
        options: SELF_SERVE_CLINIC_PLANS.map((plan) => ({ value: plan.id, label: `${plan.name} · ${plan.price} a month` })),
      },
      { key: 'billingEmail', label: 'Billing and notices email', required: true, type: 'email', orderForm: true },
    ],
    countersign: true,
    witness:
      'IN WITNESS WHEREOF, the duly authorised signatories of the Parties have executed this Agreement on the date first written above.',
  },
};

export const AGREEMENT_IDS = Object.keys(AGREEMENTS) as AgreementId[];

export function isAgreementId(value: string): value is AgreementId {
  return value in AGREEMENTS;
}

/** Which agreements a physiotherapist outside a clinic signs, by the patients they see. */
export function physioAgreementIds(mode: 'network' | 'independent' | 'both' | null | undefined): AgreementId[] {
  if (mode === 'independent') return ['independent_platform'];
  if (mode === 'both') return ['network_contractor', 'independent_platform'];
  return ['network_contractor'];
}

export type AgreementValues = Record<string, string>;

/** Day the agreement is made, e.g. "26 October 2026" (Lagos time). */
// No Intl here: this text is hashed in Convex and re-hashed in the browser, so it must format
// identically in both runtimes. Lagos is UTC+1 all year.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function agreementDateLabel(timestamp: number): string {
  const lagos = new Date(timestamp + 60 * 60 * 1000);
  return `${lagos.getUTCDate()} ${MONTHS[lagos.getUTCMonth()]} ${lagos.getUTCFullYear()}`;
}

const naira = (kobo: number) => `₦${String(Math.round(kobo / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

/** Typed details can't add formatting or tokens to the document. */
export function cleanAgreementValue(value: string | undefined): string {
  return (value ?? '').replace(/[*⟦⟧{}]/g, '').replace(/\s+/g, ' ').trim();
}

/** Token values for the document, derived from what the signer typed. Missing ones stay blank. */
function tokenValues(id: AgreementId, values: AgreementValues, dateLabel: string): Record<string, string> {
  const v = (key: string) => cleanAgreementValue(values[key]);
  const tokens: Record<string, string> = { agreementDate: dateLabel };
  for (const field of AGREEMENTS[id].fields) tokens[field.key] = v(field.key);
  if (id === 'network_contractor') {
    tokens.practiceClause = v('practiceName') ? `, contracting through **${v('practiceName')}**, of which they are a member and director` : '';
  }
  if (id === 'clinic_master_saas') {
    const entity = v('entityType');
    tokens.entityType = entity === 'company' ? 'company limited by shares' : entity === 'partnership' ? 'partnership' : entity ? 'business name' : '';
    tokens.registrationLabel = entity === 'company' ? 'RC' : entity ? 'BN' : '';
    tokens.addressLabel = entity === 'company' ? 'registered office' : entity ? 'principal place of business' : '';
  }
  return tokens;
}

/**
 * Schedule 2 of the clinic agreement, completed from the plan the clinic picks. Every term here
 * restates Schedule 1 or a clause of the agreement; nothing new is agreed in it.
 */
function clinicOrderForm(values: AgreementValues, blank: (label: string) => string): LegalSection {
  const plan = SELF_SERVE_CLINIC_PLANS.find((item) => item.id === values.plan);
  const fee = plan?.monthlyFeeKobo ? `${naira(plan.monthlyFeeKobo)} per month, excluding VAT, payable monthly in advance` : blank('Monthly fee');
  return {
    title: 'Schedule 2 – Order Form',
    blocks: [
      p('This Order Form is made under, and incorporates, the Clinic Master SaaS Agreement between Rehabify and the Clinic.'),
      table(
        ['Item', 'Detail'],
        [
          ['Plan', plan?.name ?? blank('Plan')],
          ['Clinician Seats', plan?.seatLimit ? `Up to ${plan.seatLimit} named seats` : blank('Seats')],
          ['Patient Programme Allowance', plan?.programmeAllowance ? `${plan.programmeAllowance} Active Patient Programmes` : blank('Allowance')],
          ['Subscription Fees', fee],
          ['Overage', `${naira(CLINIC_PROGRAMME_OVERAGE_KOBO)} per additional Active Patient Programme above the allowance, per month, excluding VAT, payable monthly in arrears`],
          ['Subscription Term', 'One month from the date both Parties have signed this Order Form, renewing as set out in clause 15.1'],
          ['Onboarding', 'As set out in clause 8.1'],
          ['Transaction charges', 'The payment provider’s processing charges apply. Rehabify charges no transaction fee on the Clinic’s patient payments.'],
          ['Notices and billing (Clinic)', cleanAgreementValue(values.billingEmail) || blank('Billing and notices email')],
          ['Notices (Rehabify)', 'hello@myrehabifyhealth.com'],
        ]
      ),
    ],
  };
}

const DERIVED_LABELS: Record<string, string> = {
  registrationLabel: 'RC or BN',
  addressLabel: 'registered office',
  agreementDate: 'date of signing',
};

/** Placeholder shown in the live preview where a detail hasn't been filled in yet. */
export const BLANK_MARK = { open: '⟦', close: '⟧' } as const;

/**
 * The agreement with the signer's details in place. `mark` wraps each filled value (and each
 * blank) in ⟦…⟧ so the preview can highlight them; signed copies and the hash use plain text.
 */
export function filledAgreement(
  id: AgreementId,
  values: AgreementValues,
  signedAt: number,
  options: { mark?: boolean; template?: boolean } = {}
): LegalDocument {
  const spec = AGREEMENTS[id];
  // A template (the public copy) leaves the date blank too
  const tokens = tokenValues(id, values, options.template ? '' : agreementDateLabel(signedAt));
  const labels = Object.fromEntries(spec.fields.map((field) => [field.key, field.label]));
  const wrap = (text: string) => (options.mark ? `${BLANK_MARK.open}${text}${BLANK_MARK.close}` : text);
  const blank = (label: string) => wrap(options.mark ? label : '________');
  const fill = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const value = tokens[key];
      // The optional "contracting through a company" clause disappears when empty
      if (key === 'practiceClause') return value ?? '';
      return value ? wrap(value) : blank(labels[key] ?? DERIVED_LABELS[key] ?? key);
    });
  const mapBlocks = (blocks: LegalDocument['intro']) =>
    blocks.map((block) =>
      block.type === 'p'
        ? { ...block, text: fill(block.text) }
        : block.type === 'table'
          ? { ...block, rows: block.rows.map((row) => row.map(fill)) }
          : { ...block, items: block.items.map(fill) }
    );
  const sections = spec.document.sections.map((section) => ({ ...section, blocks: mapBlocks(section.blocks) }));
  if (id === 'clinic_master_saas') {
    // The Order Form sits with the other schedules, after Schedule 1
    const orderForm = clinicOrderForm(values, blank);
    const after = sections.findIndex((section) => section.title.startsWith('Schedule 1'));
    sections.splice(after === -1 ? sections.length : after + 1, 0, orderForm);
  }
  return { ...spec.document, intro: mapBlocks(spec.document.intro), sections };
}

/** The exact words signed: hashed by Convex and printed on the signed copy. */
export function agreementPlainText(id: AgreementId, values: AgreementValues, signedAt: number): string {
  const doc = filledAgreement(id, values, signedAt);
  return [doc.title, `Version ${AGREEMENTS[id].version}`, legalPlainText(doc)].join('\n\n');
}

/** Required details missing or invalid, as messages for the signer. */
export function agreementFieldErrors(id: AgreementId, values: AgreementValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of AGREEMENTS[id].fields) {
    const value = values[field.key]?.trim() ?? '';
    if (field.required && !value) errors[field.key] = `Add ${field.label.toLowerCase()}.`;
    else if (value.length > 300) errors[field.key] = 'That’s too long.';
    else if (value && field.options && !field.options.some((option) => option.value === value)) errors[field.key] = 'Choose an option.';
    else if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field.key] = 'Enter a valid email.';
  }
  return errors;
}
