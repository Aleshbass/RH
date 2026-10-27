import { ol, p, table, type LegalDocument } from './types';

/** Rehabify Privacy Policy, effective 26 October 2026 (owner-approved wording). */
export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  effectiveDate: '26 October 2026',
  version: '2026-10-26',
  intro: [
    p(
      'Rehabify processes your personal data, including health data, only to arrange and support your rehabilitation care, run our services safely and meet the law. We never sell your data. This Policy is our privacy notice under section 27 of the Nigeria Data Protection Act 2023 ("**NDPA**") and the General Application and Implementation Directive 2025 ("**GAID**").'
    ),
  ],
  sections: [
    {
      title: '1. Who we are and what this Policy covers',
      blocks: [
        p(
          '**1.1 Controller.** Rehabify Limited (RC 6989173) trading as Rehabify, Rehabify Health and Physio Around Me ("**Rehabify**", "**we**", "**us**"), is responsible for your personal data as described in clause 1.3.'
        ),
        p(
          "**1.2 Scope.** This Policy applies to personal data we process through our website physioaroundme.com and its sub-domains, our apps, Joy on WhatsApp, our APIs, our support channels and our offline dealings with Patients, caregivers, Physiotherapists, Clinic staff, partners and job applicants. Words defined in our Terms of Service have the same meaning here."
        ),
        p(
          '**1.3 Our role depends on the service.** Under the NDPA, a "data controller" decides why and how personal data is processed; a "data processor" acts on a controller\'s instructions.'
        ),
        table(
          ['Who you are', 'Who controls your data', "Rehabify's role"],
          [
            [
              'Patient booking **Rehabify Care**',
              'Rehabify, together with your treating Network Physiotherapist, for the clinical record they create',
              'Controller (joint controller of the clinical record)',
            ],
            [
              'Patient buying **Flex or Flex Max** directly, including through an Independent Physiotherapist',
              'Rehabify for the Digital Recovery Service',
              'Controller',
            ],
            [
              'Patient of an **Independent Physiotherapist** (their clinical notes and care plans)',
              'Your Physiotherapist',
              'Processor, acting on their instructions',
            ],
            ['Patient of a **Clinic** using Rehabify software', 'The Clinic', "Processor, acting on the Clinic's instructions"],
            ['**Physiotherapist** or **Clinic staff** member (account, verification, payouts)', 'Rehabify', 'Controller'],
            ['Visitor, partner contact or job applicant', 'Rehabify', 'Controller'],
          ]
        ),
        p(
          'Where a Physiotherapist or Clinic is the controller, their own privacy notice also applies, and you can exercise your rights through them or through us; we will pass your request on promptly.'
        ),
        p(
          '**1.4 Data Protection Officer.** We have appointed a Data Protection Officer ("**DPO**") under section 32 of the NDPA. Contact: Paul Francis, Data Protection Officer, Rehabify Limited, at **hello@myrehabifyhealth.com** or at our registered office.'
        ),
        p(
          '**1.5 Registration and accountability.** Because we process health data, Rehabify is registered with the Nigeria Data Protection Commission ("**NDPC**") as a data controller of major importance, carries out data protection impact assessments before high-risk processing, keeps a record of processing activities, trains staff who handle personal data, and files Compliance Audit Returns with the NDPC as the GAID requires.'
        ),
      ],
    },
    {
      title: '2. The personal data we collect',
      blocks: [
        p('2.1 We collect only what we need for the purposes in section 3. Data marked **(S)** is sensitive personal data under section 30 of the NDPA.'),
        table(
          ['Category', 'Examples', 'Where it comes from'],
          [
            [
              'Identity and contact',
              'Name, date of birth, sex, phone and WhatsApp number, email, home address, city and area for home visits, emergency contact',
              'You; a parent, guardian or caregiver; a referring doctor or partner with your consent',
            ],
            [
              'Health and care **(S)**',
              'Symptoms and pain descriptions, medical history, medicines, allergies, pregnancy, surgery, test results and scans you upload, assessment findings, diagnoses within physiotherapy scope, care plans, exercise programmes, progress logs, outcome scores, discharge summaries',
              'You; your Physiotherapist; a referring clinician with your consent; Joy conversations',
            ],
            [
              'Joy and messaging',
              'WhatsApp messages, voice notes, photos and videos you send, language preference, message timestamps and delivery status',
              'You, through WhatsApp and the Platform',
            ],
            [
              'Session data',
              'Appointment times, attendance, session type, video-session connection logs (we do not record video sessions)',
              'The Platform and our video provider',
            ],
            [
              'Exercise media **(S where it shows your body or condition)**',
              'Videos or photos you upload so your Physiotherapist can review your exercise form',
              'You',
            ],
            [
              'Payment',
              'Amounts, payment reference, last four card digits and card type, bank and transfer references, refund records. We do not see or store your full card number or PIN',
              'Paystack and you',
            ],
            [
              'Financing',
              'Whether a medical loan was approved and paid to us for your care; we do not receive your credit assessment',
              'MediLoan by MyItura or another financing partner, with your consent',
            ],
            ['Rehabify Access', 'Information about your circumstances that you give us to assess eligibility for reduced-fee care', 'You'],
            [
              'Physiotherapist and professional',
              'Name, photo, MRTB registration number, practising licence, qualifications, specialities, CV, government ID, tax identification number, bank account for payouts, indemnity insurance, availability, service areas, ratings, complaints and performance records',
              'You, the MRTB register, referees, Patients',
            ],
            ['Clinic staff', 'Name, role, work email, access permissions, activity logs', 'The Clinic and you'],
            [
              'Technical and usage',
              'IP address, device and browser type, operating system, app version, pages and features used, crash reports, approximate location derived from IP',
              'Your device, cookies and similar technologies',
            ],
            ['Communications and support', 'Emails, complaints, call notes, survey answers', 'You'],
            ['Marketing preferences', 'Whether you agreed to receive news and offers, and your choices', 'You'],
          ]
        ),
        p(
          '**2.2 If you do not provide data.** Some data is necessary to provide care safely, for example your health history and, for home visits, your address. If you do not provide it, we may be unable to book or deliver the service.'
        ),
        p(
          '**2.3 Data about other people.** If you give us data about someone else, such as a Child or an emergency contact, you must have their permission or lawful authority to do so, and tell them about this Policy.'
        ),
        p(
          '**2.4 Cookies.** We use strictly necessary cookies to run the Platform and keep it secure. We use analytics or other non-essential cookies only with your consent, which you can give or withdraw through the cookie banner or settings at any time.'
        ),
      ],
    },
    {
      title: '3. Why we use your data and our lawful bases',
      blocks: [
        p(
          '3.1 We process personal data only on a lawful basis under section 25 of the NDPA, and sensitive personal data only on a ground permitted by section 30. For health data, the ground we rely on is your **explicit consent**, which the GAID makes mandatory for sensitive personal data, except where the law permits processing without consent (for example, to protect your vital interests in an emergency, or to establish or defend legal claims).'
        ),
        table(
          ['Purpose', 'Data used', 'Lawful basis'],
          [
            [
              'Triage your request, match you to a suitable Physiotherapist and book your care',
              'Identity, contact, health, location',
              'Contract; explicit consent for health data',
            ],
            [
              'Deliver Clinical Services and keep your clinical record',
              'Identity, health, session, exercise media',
              'Contract; explicit consent; legal obligation to keep clinical records',
            ],
            [
              'Provide Flex and Flex Max, including Joy reminders and adherence support',
              'Contact, health, Joy messages, progress',
              'Contract; explicit consent',
            ],
            [
              'Escalate red-flag or worsening symptoms to our care team or your Physiotherapist',
              'Health, Joy messages',
              'Explicit consent; vital interests where life or health is at immediate risk',
            ],
            ['Take payments, process refunds and keep financial records', 'Payment, identity', 'Contract; legal obligation (tax and accounting law)'],
            [
              'Confirm financed treatment with a financing partner you chose',
              'Identity, booking and service-delivered confirmation (not clinical notes)',
              'Explicit consent',
            ],
            ['Assess Rehabify Access eligibility', 'Identity, circumstances, health', 'Explicit consent'],
            [
              'Verify Physiotherapists, pay them and manage the network',
              'Professional data, bank details',
              'Contract; legal obligation; legitimate interest in patient safety',
            ],
            ['Investigate complaints, incidents and safeguarding concerns', 'Any relevant data', 'Legal obligation; legitimate interest; legal claims'],
            ['Keep the Platform secure, prevent fraud and fix faults', 'Technical, usage, payment', 'Legitimate interest; legal obligation'],
            [
              'Improve our services and measure clinical outcomes',
              'Usage data and de-identified or aggregated health data',
              'Legitimate interest (assessed and recorded); consent where data is not de-identified',
            ],
            ['Send service messages (confirmations, reminders, renewal notices)', 'Contact', 'Contract'],
            ['Send marketing and news', 'Contact, preferences', 'Consent (opt-in, withdraw any time)'],
            ['Comply with law, regulators, courts and professional bodies', 'Any relevant data', 'Legal obligation'],
          ]
        ),
        p(
          '**3.2 Your consent.** We ask for consent separately and clearly, in plain language, before we collect health data, before Joy processes your messages, and before any transfer that relies on consent. Consent is never a condition of receiving essential care information. You may withdraw consent at any time by telling Joy, using your account settings or emailing our DPO. Withdrawal does not affect processing already carried out, but it may mean we can no longer provide a service that depends on that data, and we must still keep clinical records for the period the law requires.'
        ),
        p(
          '**3.3 Legitimate interests.** Where we rely on legitimate interests, we have carried out and documented a legitimate interest assessment as the GAID requires, and we do not rely on legitimate interests where your interests or rights override ours. You may ask our DPO for details and object at any time.'
        ),
        p(
          '**3.4 Research and service improvement.** We use only de-identified or aggregated data to analyse outcomes and improve services. We will not use identifiable health data for research, or publish case studies about you, without your separate, specific consent and any required ethics approval.'
        ),
        p(
          '**3.5 No secondary use by Physiotherapists.** Physiotherapists may use your data only to care for you and to meet their legal and professional duties, not for their own marketing or unrelated purposes.'
        ),
      ],
    },
    {
      title: '4. Joy, AI and automated processing',
      blocks: [
        p(
          '4.1 Joy uses AI models to understand your messages (including voice notes and messages in English, Yoruba, Igbo and Hausa), suggest a suitable service or Physiotherapist, and send reminders. Your messages are processed by our AI model provider(s) as our data processors under contracts that prohibit them from using your data to train their models or for any purpose of their own.'
        ),
        p(
          '4.2 Joy does not make clinical decisions. Decisions that have a legal or similarly significant effect on you, such as declining a booking for safety reasons or deciding Rehabify Access eligibility, are made or reviewed by a person. Under section 37 of the NDPA, you may ask for human review of any automated decision, express your view and contest the decision, by telling Joy "I want a person to review this" or by emailing our DPO.'
        ),
        p(
          '4.3 We review samples of Joy conversations, with access limited to trained staff bound by confidentiality, to check safety and quality.'
        ),
      ],
    },
    {
      title: '5. Who we share your data with',
      blocks: [
        p('5.1 We share personal data only where necessary, under written contracts that require confidentiality and NDPA-compliant protection:'),
        ol(
          '**Your Physiotherapist** – the information they need to assess and treat you. A Physiotherapist sees only the records of Patients they are treating.',
          '**Our service providers (data processors)** – Paystack (payments), Meta Platforms (WhatsApp Business Platform for Joy), GetStream (virtual sessions), Vercel (hosting and storage), Google (Joy), Resend (notifications), Umami Analytics and PostHog (usage analytics, only with consent). A current list is available from our DPO on request.',
          '**A Clinic or Independent Physiotherapist** – where they are the controller of your care record, as described in clause 1.3.',
          '**Financing partners you choose** – for example MediLoan by MyItura, limited to confirming that your booking exists and that the financed service was delivered. We do not share your clinical notes with a lender without your separate written consent for a specified purpose.',
          '**Referring clinicians and partners** – progress or discharge summaries, only where you asked to be referred or have agreed to the update.',
          '**Professional advisers and insurers** – lawyers, auditors and insurers under duties of confidentiality, where needed for claims, audits or insurance.',
          '**Regulators and authorities** – the NDPC, the MRTB, the FCCPC, tax authorities, law enforcement or a court, where the law requires it. We disclose only what is required and, where lawful, tell you.',
          "**Emergency services or your emergency contact** – where we reasonably believe it is necessary to protect your life or health or someone else's.",
          '**A successor business** – if Rehabify is reorganised, merged or sold, subject to this Policy continuing to protect your data.'
        ),
        p('5.2 We do not sell personal data, and we do not share it with advertisers.'),
      ],
    },
    {
      title: '6. Transfers outside Nigeria',
      blocks: [
        p(
          '6.1 Some of our providers store or process data outside Nigeria, including Meta (WhatsApp), our cloud hosting provider (United States) and our AI model provider(s) (United States). We transfer personal data outside Nigeria only in line with sections 41 to 43 of the NDPA and the GAID, which means one of the following applies:'
        ),
        ol(
          'the recipient country or arrangement is covered by an adequacy decision of the NDPC;',
          'the transfer is protected by an NDPC-approved transfer instrument, such as standard contractual clauses or binding corporate rules; or',
          'you have given explicit, informed consent to the transfer after we told you about the possible risks.'
        ),
        p(
          '6.2 When you first use Joy or create an account, we ask for your explicit consent to transfers that rely on clause 6.1(3), and explain that the recipient country may not offer the same protection as Nigerian law. We also apply encryption, contractual restrictions and data minimisation to every transfer. You may ask our DPO for a copy of the safeguards that apply.'
        ),
      ],
    },
    {
      title: '7. How long we keep your data',
      blocks: [
        p(
          '7.1 We keep personal data only as long as necessary for the purpose collected and to meet legal, professional and accounting obligations. At the end of the period we securely delete or irreversibly anonymise it, unless it is needed for an ongoing complaint, investigation or legal claim.'
        ),
        table(
          ['Record', 'Retention period'],
          [
            ['Clinical records of adults (assessments, care plans, session notes, discharge summaries)', '10 years after the last episode of care'],
            ['Clinical records of Children', 'Until the Child turns 25, or 10 years after the last episode of care, whichever is later'],
            ['Joy conversations not forming part of the clinical record', '24 months after the last message'],
            [
              'Exercise videos and photos you upload',
              'Until reviewed and the outcome recorded, then deleted within 90 days, unless your Physiotherapist adds them to your clinical record',
            ],
            ['Payment, refund, invoice and payout records', '6 years after the end of the financial year to which they relate'],
            ['Account data (Patient)', 'While the account is active, then 2 years after closure, except data forming part of a clinical or financial record'],
            ['Physiotherapist verification, contract and performance records', 'Duration of the engagement plus 6 years'],
            ['Rehabify Access applications', '2 years after the decision, or with the clinical record if care is provided'],
            ['Complaints and incident records', '6 years after closure'],
            ['Marketing preferences', 'Until you withdraw consent, then a suppression record so we do not contact you again'],
            ['Technical logs and analytics', 'Up to 13 months'],
          ]
        ),
        p(
          '7.2 Where a Clinic or Independent Physiotherapist is the controller, they set the retention period for their records; we keep their data for the term of our agreement with them and return or delete it afterwards as that agreement requires.'
        ),
      ],
    },
    {
      title: '8. How we protect your data',
      blocks: [
        p(
          '8.1 We apply technical and organisational measures appropriate to health data, as required by section 39 of the NDPA, including: encryption of data in transit (TLS) and at rest; role-based access so Physiotherapists see only their own Patients; multi-factor authentication for staff and professional accounts; logging of access to clinical records; secure software development and vulnerability testing; written confidentiality obligations for all staff and contractors; regular data protection training; vendor due diligence; and backup and recovery procedures.'
        ),
        p('8.2 No system is completely secure. Please protect your account as described in our Terms of Service.'),
        p(
          '**8.3 Personal data breaches.** If a breach is likely to result in a risk to your rights and freedoms, we will notify the NDPC within 72 hours of becoming aware of it, as section 40 of the NDPA requires. If the breach is likely to result in a high risk to you, we will also tell you directly and without undue delay, in plain language, what happened, the likely consequences and the steps you can take to protect yourself.'
        ),
      ],
    },
    {
      title: '9. Your rights',
      blocks: [
        p('9.1 Under sections 34 to 38 of the NDPA, you have the right to:'),
        ol(
          'be informed about how we process your data (this Policy);',
          'access your personal data and obtain a copy, including your clinical record;',
          'have inaccurate or incomplete data corrected;',
          'have data erased where there is no longer a lawful reason to keep it (clinical records may need to be kept for the period in section 7, and we will explain if so);',
          'restrict processing while a dispute about accuracy or lawfulness is resolved;',
          'withdraw consent at any time;',
          'object to processing based on legitimate interests and to direct marketing at any time;',
          'not be subject to a decision based solely on automated processing that significantly affects you (see section 4); and',
          'receive data you provided in a structured, commonly used, machine-readable format and have it transmitted to another provider (data portability).'
        ),
        p(
          '**9.2 How to exercise your rights.** Tell Joy, use your account settings, or email our DPO at hello@myrehabifyhealth.com. We may need to verify your identity. We will respond within 30 days and tell you if we need more time and why. We do not charge a fee unless a request is manifestly unfounded or excessive, as the law allows.'
        ),
        p(
          '**9.3 Standard Notice to Address Grievance.** You may also send us a Standard Notice to Address Grievance (SNAG) under the GAID. We will acknowledge it and respond within the period the GAID sets.'
        ),
      ],
    },
    {
      title: '10. Children',
      blocks: [
        p(
          "We process a Child's personal data only with the express consent of their parent or legal guardian, as section 31 of the NDPA and the GAID require, and we take reasonable steps to verify that consent. Children may not open accounts. A parent or guardian may exercise the Child's rights on their behalf. When a Child turns 18, they may exercise their rights directly."
        ),
      ],
    },
    {
      title: '11. Complaints',
      blocks: [
        p(
          'If you are unhappy with how we handle your data, contact our DPO first so we can try to put it right. You also have the right to complain to the **Nigeria Data Protection Commission** at any time (ndpc.gov.ng).'
        ),
      ],
    },
    {
      title: '12. Changes to this Policy',
      blocks: [
        p(
          'We will update this Policy when our processing or the law changes. We will publish the new version with its effective date and, for material changes, tell you at least 30 days in advance by email, in-app notice or WhatsApp. Where a change requires new consent, we will ask for it and will not rely on continued use as consent.'
        ),
      ],
    },
    {
      title: '13. Contact',
      blocks: [p('Data Protection Officer, hello@myrehabifyhealth.com')],
    },
  ],
};
