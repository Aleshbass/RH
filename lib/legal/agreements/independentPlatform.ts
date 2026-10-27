import { ol, p, table, type LegalDocument } from '../types';

/** Independent Physiotherapist Platform Agreement, effective 26 October 2026 (owner-approved wording). {{tokens}} are filled in when someone signs (lib/agreements.ts). */
export const INDEPENDENT_PLATFORM_AGREEMENT: LegalDocument = {
  title: 'Independent Physiotherapist Platform Agreement',
  effectiveDate: '26 October 2026',
  version: '2026-10-26',
  intro: [
    p(
      'This Independent Physiotherapist Platform Agreement (the "**Agreement**") is effective on the date the Practitioner accepts it electronically on the Platform, being {{agreementDate}}.'
    ),
    p('**BETWEEN**'),
    p(
      '**REHABIFY LIMITED**, a private company limited by shares incorporated under the laws of the Federal Republic of Nigeria with RC Number 6989173, having its registered office at Okeoffa, Babasale, Oje, Ibadan, Ibadan North-East, Oyo State (hereinafter referred to as "**Rehabify**", which expression shall, where the context admits, include its successors and permitted assigns);'
    ),
    p('**AND**'),
    p(
      '**{{signerName}}**, a physiotherapist registered with the Medical Rehabilitation Therapists (Registration) Board of Nigeria under Registration Number **{{mrtbNumber}}**, practising at **{{practiceName}}**, {{practiceAddress}} (hereinafter referred to as the "**Practitioner**", which expression shall, where the context admits, include their personal representatives and permitted assigns).'
    ),
  ],
  sections: [
    {
      title: 'Recitals',
      blocks: [
        p(
          '**A.** Rehabify provides a clinical workspace through which physiotherapists can document assessments, create care plans, prescribe exercise programmes and follow up patients (the "**Workspace**").'
        ),
        p(
          '**B.** The Practitioner carries on an independent physiotherapy practice and wishes to use the Workspace to manage patients whom the Practitioner has acquired independently of Rehabify.'
        ),
        p(
          '**C.** Rehabify has agreed to make the core features of the Workspace available to the Practitioner without a compulsory subscription fee, and to offer the Practitioner\'s patients optional Digital Recovery Services which the patients may buy directly from Rehabify.'
        ),
        p(
          '**D.** The Parties intend that Rehabify shall take no share of the fees the Practitioner charges for their own clinical services, and that the Practitioner shall remain the data controller of their patients\' clinical records, with Rehabify acting as data processor.'
        ),
        p('**NOW, THIS AGREEMENT WITNESSES AS FOLLOWS:**'),
      ],
    },
    {
      title: '1. Interpretation',
      blocks: [
        p('**1.1 Definitions.** In this Agreement, unless the context otherwise requires:'),
        ol(
          '"**Applicable Law**" has the meaning given in Rehabify\'s Terms of Service, and includes the Medical Rehabilitation Therapists (Registration, etc.) Act, the MRTB Code of Ethics, the National Health Act 2014, the Nigeria Data Protection Act 2023 ("**NDPA**") and the General Application and Implementation Directive 2025 ("**GAID**").',
          '"**Basic**" means the free provision to a Practitioner Patient of the essential instructions needed to follow the Practitioner\'s recommendations, as described in Schedule 1.',
          '"**Core Features**" means the Workspace features listed in Part A of Schedule 1, made available without a subscription fee.',
          '"**Digital Recovery Services**" means Flex and Flex Max.',
          '"**Fair Use Limits**" means the usage limits in Part B of Schedule 1, as updated under clause 2.4.',
          '"**Flex**" means Rehabify\'s 30-day interactive home programme service with clinician-approved exercise demonstrations and progress tracking.',
          '"**Flex Max**" means Flex together with the defined Joy-supported WhatsApp recovery experience for 30 days.',
          '"**Joy**" means Rehabify\'s AI-enabled assistant.',
          '"**Practitioner Data**" means all Personal Data relating to Practitioner Patients that the Practitioner or Practitioner Patients enter into the Workspace, including Clinical Records, but excluding Rehabify DRS Data.',
          '"**Practitioner Patient**" means an individual whom the Practitioner acquired independently of Rehabify Care and manages in the Workspace.',
          '"**Rehabify DRS Data**" means the Personal Data of a Practitioner Patient who buys or receives a Digital Recovery Service, to the extent processed by Rehabify to provide that service, including account, payment, programme-usage and Joy conversation data.',
          '"**Sponsored Credit**" means a complimentary activation of a Digital Recovery Service funded by Rehabify under clause 6.',
          'Other capitalised terms have the meanings given in Rehabify\'s Terms of Service.'
        ),
        p(
          '**1.2** Headings do not affect interpretation; "including" means "including without limitation"; a reference to a law includes it as amended or re-enacted; and the Schedules form part of this Agreement. If the Practitioner is also a Network Physiotherapist or works for a Clinic, the Network Physiotherapist Independent Contractor Agreement governs Rehabify Care Patients, the Clinic Master SaaS Agreement governs the Clinic\'s patients, and this Agreement governs Practitioner Patients only. The applicable terms depend on the patient and the service, not on the Practitioner\'s status alone.'
        ),
      ],
    },
    {
      title: '2. Access to the Workspace',
      blocks: [
        p(
          '**2.1 Free core access.** Rehabify grants the Practitioner a non-exclusive, non-transferable, revocable right during this Agreement to use the Core Features for the management of Practitioner Patients, without any subscription or monthly fee.'
        ),
        p(
          '**2.2 Eligibility.** Access is conditional on Rehabify verifying the Practitioner\'s identity, MRTB registration and current annual practising licence. Clause 2.3 applies throughout this Agreement.'
        ),
        p(
          '**2.3 Duty to notify and annual renewal.** The Practitioner shall notify Rehabify within 24 hours if their MRTB registration or practising licence expires, is suspended, restricted or revoked, or becomes subject to disciplinary proceedings, and shall upload evidence of each renewed practising licence. Rehabify may restrict the Workspace to read-only access (so that records remain available) while a licence is unverified.'
        ),
        p(
          '**2.4 Fair Use Limits.** Use of the Workspace is subject to the Fair Use Limits in Part B of Schedule 1, which exist because storage, video delivery and messaging cost Rehabify money. Rehabify may revise the Fair Use Limits on not less than 30 days\' written notice, but shall not reduce them in a way that prevents the Practitioner from accessing or exporting existing Practitioner Data. If the Practitioner consistently exceeds the limits, Rehabify will discuss options with the Practitioner before taking any action, which may include offering an optional paid tier.'
        ),
        p(
          '**2.5 Optional paid features.** Rehabify may in future offer optional paid features or higher limits. The Practitioner is never obliged to buy them, and no Core Feature shall be converted into a paid feature except on not less than 60 days\' written notice, during which the Practitioner may export all Practitioner Data free of charge and terminate this Agreement.'
        ),
        p(
          '**2.6 Accounts.** The Workspace account is personal to the Practitioner. The Practitioner may not share login credentials. Assistants or colleagues require their own accounts on terms Rehabify agrees.'
        ),
      ],
    },
    {
      title: '3. The Practitioner\'s practice and fees',
      blocks: [
        p(
          '**3.1 Independent practice.** The Practitioner\'s clinical services to Practitioner Patients are provided by the Practitioner in their own name, on their own terms and at their own risk. Rehabify is not a party to, and is not responsible for, the Practitioner\'s contract with any Practitioner Patient. Nothing in this Agreement creates an employment, agency, partnership or joint venture relationship.'
        ),
        p(
          '**3.2 Fees belong to the Practitioner.** The Practitioner sets their own fees and is entitled to all fees they charge for their clinical services. Rehabify shall not charge any commission, percentage or fee on those fees.'
        ),
        p(
          '**3.3 Payment of the Practitioner\'s fees.** The Practitioner may collect their fees by any lawful means. The Practitioner is not required to process their fees through Rehabify. Rehabify shall not collect, hold or receive the Practitioner\'s clinical fees unless the Parties sign a separate written payment addendum under clause 5.3.'
        ),
        p(
          '**3.4 Clinical and professional responsibility.** The Practitioner is solely responsible for: the clinical care of Practitioner Patients; obtaining informed consent; the accuracy and completeness of records; compliance with the MRTB Code of Ethics and Applicable Law; and their own professional indemnity insurance. The Practitioner shall use Workspace content (including exercise libraries and templates) only in the exercise of their own professional judgement.'
        ),
        p(
          '**3.5 Patient-facing statements.** The Practitioner shall not represent that Practitioner Patients are Rehabify patients, that Rehabify supervises or endorses the Practitioner\'s clinical care, or that Rehabify is responsible for it. The Practitioner may state truthfully that they use Rehabify\'s software.'
        ),
        p(
          '**3.6 Patient information.** The Practitioner shall give each Practitioner Patient a privacy notice that explains, among other things, that the Practitioner uses Rehabify as a software provider to store and process their records.'
        ),
      ],
    },
    {
      title: '4. Digital Recovery Services',
      blocks: [
        p(
          '**4.1 What Rehabify offers.** When a Practitioner Patient\'s programme is ready, or when the Practitioner Patient is about to pay for their first treatment session, Rehabify may offer the Practitioner Patient a choice of:'
        ),
        table(
          ['Plan', 'Content', 'Price to the patient'],
          [
            ['Basic', 'The essential instructions needed to follow the Practitioner\'s recommendations', 'Free'],
            ['Flex', 'Interactive home programme, approved demonstrations and progress tracking for 30 days', '₦1,500'],
            ['Flex Max', 'Everything in Flex, plus Joy-supported WhatsApp recovery support for 30 days', '₦3,500'],
          ]
        ),
        p('Prices are as published by Rehabify from time to time; a price change does not affect a period already paid for.'),
        p(
          '**4.2 Rehabify is the seller.** Flex and Flex Max are sold by Rehabify directly to the Practitioner Patient, under Rehabify\'s Terms of Service, Payment Policy and Privacy Policy. The Practitioner Patient pays Rehabify. The Practitioner is not the seller and is not responsible for refunds of Digital Recovery Services.'
        ),
        p(
          '**4.3 No commission to the Practitioner.** The Practitioner receives no commission, fee or other benefit linked to the purchase or renewal of Digital Recovery Services by Practitioner Patients, other than Sponsored Credits under clause 6, which are not linked to sales.'
        ),
        p(
          '**4.4 Clinical neutrality.** The Practitioner shall present Basic, Flex and Flex Max neutrally and accurately, shall not make the purchase of any Digital Recovery Service a condition of clinical care, and shall ensure that the essential instructions each Practitioner Patient needs are always available to them through Basic or otherwise.'
        ),
        p(
          '**4.5 Programme approval.** Rehabify shall deliver to a Practitioner Patient only exercise content that the Practitioner has prescribed or approved in the Workspace. Joy shall not create, change or progress a programme. The 30-day period of a Digital Recovery Service starts when the Practitioner\'s approved programme becomes available and is activated.'
        ),
        p(
          '**4.6 Escalations for Flex Max patients.** Where Joy identifies a message from a Practitioner Patient that suggests worsening symptoms, red flags or distress, Rehabify will: (a) give the Practitioner Patient safety guidance, including directions to emergency care where indicated; and (b) notify the Practitioner through the Workspace. The Practitioner shall review notifications during their working hours and respond as their professional judgement requires. Rehabify is not responsible for the clinical management of Practitioner Patients.'
        ),
        p(
          '**4.7 Expiry and renewal.** Rehabify shall notify the Practitioner Patient before access expires. Renewal is never automatic and requires the Practitioner Patient\'s express authorisation. On expiry, premium functionality ends, but the Practitioner Patient keeps the essential instructions, appropriate discharge information and their rights over their records.'
        ),
      ],
    },
    {
      title: '5. Payments and payment links',
      blocks: [
        p(
          '**5.1 Separate payment links.** Rehabify may provide the Practitioner with a payment link for Digital Recovery Services that the Practitioner may share with a Practitioner Patient. Payments made through that link are made to Rehabify for the Digital Recovery Service only.'
        ),
        p(
          '**5.2 No mixing of funds.** The Practitioner shall not collect payment for Digital Recovery Services on Rehabify\'s behalf, and Rehabify shall not collect the Practitioner\'s clinical fees, save as provided in clause 5.3.'
        ),
        p(
          '**5.3 Integrated checkout (optional).** If Rehabify offers, and the Practitioner chooses to use, an integrated checkout through which a Practitioner Patient pays the Practitioner\'s fee and a Digital Recovery Service in one transaction, the Parties shall first sign a written payment addendum that sets out, at a minimum: which entity is the collecting merchant for each amount; how and when the Practitioner\'s share is settled to the Practitioner; who bears payment-processing charges; refund and chargeback responsibilities; and how each amount is shown to the Practitioner Patient. The checkout must show the Practitioner Patient each amount and its recipient before payment.'
        ),
      ],
    },
    {
      title: '6. Sponsored Credits and rewards',
      blocks: [
        p(
          '**6.1 Sponsored Credits.** Rehabify may give the Practitioner a limited number of Sponsored Credits (for example, a number of free Flex activations on verification, or for verified participation in professional development or feedback programmes), on the terms shown in the Workspace at the time they are granted.'
        ),
        p(
          '**6.2 Nature of credits.** Sponsored Credits are complimentary Digital Recovery Services for Practitioner Patients. They have no cash value, cannot be sold, transferred or exchanged, expire as stated, and may be capped. Rehabify records their cost. Flex Max credits are offered only where Rehabify specifically says so.'
        ),
        p(
          '**6.3 No inducement.** Sponsored Credits and rewards are never linked to the number of treatment sessions the Practitioner recommends or to sales of Digital Recovery Services, and shall be used only where clinically appropriate for the Practitioner Patient. Rehabify may withdraw unused credits on 14 days\' notice if they are misused.'
        ),
      ],
    },
    {
      title: '7. Data protection',
      blocks: [
        p(
          '**7.1 Roles.** The Practitioner is the data controller of Practitioner Data, and Rehabify processes Practitioner Data as the Practitioner\'s data processor under section 29 of the NDPA. Rehabify is an independent data controller of Rehabify DRS Data and of the Practitioner\'s own account Personal Data.'
        ),
        p(
          '**7.2 Practitioner\'s obligations as controller.** The Practitioner shall: (a) have a lawful basis, and where required, the Practitioner Patient\'s explicit consent, for processing health data and for its processing by Rehabify as processor; (b) give Practitioner Patients the privacy notice required by clause 3.6; (c) enter only data that is accurate and necessary; (d) respond to data subject requests, with Rehabify\'s assistance; and (e) comply with any obligation to register with the Nigeria Data Protection Commission that applies to the Practitioner.'
        ),
        p('**7.3 Rehabify\'s obligations as processor.** In respect of Practitioner Data, Rehabify shall:'),
        ol(
          'process it only on the Practitioner\'s documented instructions, which are given by this Agreement and by the Practitioner\'s use of the Workspace, unless required by law to do otherwise (in which case Rehabify shall inform the Practitioner, unless the law prohibits it);',
          'ensure that its personnel who access it are bound by confidentiality and access it only where necessary to provide, support or secure the Workspace;',
          'apply appropriate technical and organisational security measures, including encryption in transit and at rest, access controls, logging, multi-factor authentication for staff, backups and vulnerability management;',
          'engage sub-processors only under written contracts imposing equivalent obligations, keep a list of sub-processors available to the Practitioner, and give at least 30 days\' notice of any new sub-processor, during which the Practitioner may object and, if the objection cannot be resolved, terminate this Agreement;',
          'transfer Practitioner Data outside Nigeria only in compliance with sections 41 to 43 of the NDPA and the GAID;',
          'assist the Practitioner, taking into account the nature of the processing, to respond to data subject requests, carry out data protection impact assessments, and meet its security and breach-notification obligations;',
          'notify the Practitioner without undue delay, and in any event within 48 hours, of becoming aware of a personal data breach affecting Practitioner Data, with the information the Practitioner reasonably needs to notify the Commission within 72 hours;',
          'on termination, make Practitioner Data available for export under clause 12.5 and then delete it, except where retention is required by law; and',
          'make available information reasonably necessary to demonstrate compliance with this clause, and allow an audit by the Practitioner or an independent auditor once a year on 30 days\' notice, at the Practitioner\'s cost, or provide a recent independent assessment report instead.'
        ),
        p('Processing details are set out in Part C of Schedule 1.'),
        p(
          '**7.4 Digital Recovery Services data.** When a Practitioner Patient buys or receives a Digital Recovery Service, the Practitioner instructs Rehabify to make the Practitioner\'s approved programme available to that Practitioner Patient. Rehabify obtains that Practitioner Patient\'s own consent to process their data for the Digital Recovery Service under Rehabify\'s Privacy Policy. Rehabify may share with the Practitioner, through the Workspace, the Practitioner Patient\'s programme adherence, progress data and Joy escalations, as described to the Practitioner Patient.'
        ),
        p(
          '**7.5 No solicitation by Rehabify.** Rehabify shall not use Practitioner Data, or Rehabify DRS Data obtained because of the Practitioner\'s referral, to market Rehabify Care, to invite a Practitioner Patient to be treated by any other physiotherapist, or to divert a Practitioner Patient away from the Practitioner. This does not prevent a Practitioner Patient from independently choosing Rehabify Care or another provider, or Rehabify from sending service messages about a Digital Recovery Service the Practitioner Patient has bought.'
        ),
        p(
          '**7.6 Aggregated data.** Rehabify may create and use de-identified and aggregated data derived from use of the Workspace to operate, secure and improve its services and to produce statistics, provided that no individual Practitioner Patient or Practitioner can be identified from it.'
        ),
        p('**7.7 No sale.** Rehabify shall not sell Practitioner Data or use it to train AI models offered to third parties.'),
        p(
          '**7.8 Practitioner\'s security duties.** The Practitioner shall keep their credentials secure, use multi-factor authentication, use the Workspace only on secured devices, and notify Rehabify within 24 hours of any suspected compromise of their account or devices.'
        ),
      ],
    },
    {
      title: '8. Intellectual property',
      blocks: [
        p(
          '**8.1** Rehabify and its licensors own all rights in the Workspace, Joy, the exercise library, templates and Rehabify\'s branding. The Practitioner receives only the right of use in clause 2.1.'
        ),
        p(
          '**8.2** The Practitioner owns content they create (including custom exercises, videos and templates) and grants Rehabify a non-exclusive, royalty-free licence to host, process and display it to provide the Workspace and the Digital Recovery Services to the Practitioner\'s own patients. Rehabify shall not make the Practitioner\'s custom content available to other users without the Practitioner\'s written consent.'
        ),
        p(
          '**8.3** The Practitioner shall not copy, scrape, reverse-engineer or resell the Workspace or its content, or use it to build a competing product.'
        ),
      ],
    },
    {
      title: '9. Confidentiality',
      blocks: [
        p(
          'Each Party shall keep confidential the other\'s non-public business information and all Practitioner Patient information, use it only to perform this Agreement, and disclose it only to personnel and advisers who need to know it and are bound by equivalent duties, or as required by law or a regulator. This clause survives termination.'
        ),
      ],
    },
    {
      title: '10. Service levels, support and changes',
      blocks: [
        p(
          '**10.1 Availability.** Rehabify shall use reasonable endeavours to make the Workspace available 24 hours a day, 7 days a week, excluding planned maintenance (notified at least 24 hours in advance where practicable and scheduled outside 8:00 a.m. to 8:00 p.m. West Africa Time where possible) and events outside its reasonable control. As the Core Features are provided free of charge, no service credits apply.'
        ),
        p(
          '**10.2 Support.** Rehabify provides support by email at hello@myrehabifyhealth.com and in-app chat during 8:00 a.m. to 6:00 p.m., Monday to Friday. Security and data incidents may be reported at any time.'
        ),
        p(
          '**10.3 Changes.** Rehabify may improve or change the Workspace. It shall give at least 30 days\' notice of any change that materially reduces the Core Features, and shall never remove the Practitioner\'s ability to access and export Practitioner Data.'
        ),
      ],
    },
    {
      title: '11. Warranties, liability and indemnity',
      blocks: [
        p(
          '**11.1 Practitioner warranties.** The Practitioner warrants that they are registered with the MRTB and hold a current practising licence, that the information they provided is accurate, and that their use of the Workspace will comply with Applicable Law.'
        ),
        p(
          '**11.2 Disclaimer.** The Workspace is a tool. Exercise libraries, templates and suggestions are aids to, not substitutes for, professional judgement. Except as expressly stated in this Agreement, the Workspace is provided "as is" and Rehabify gives no warranty that it will meet every clinical need of the Practitioner.'
        ),
        p(
          '**11.3 Indemnities.** The Practitioner shall indemnify Rehabify against claims and losses arising from the Practitioner\'s clinical care, breach of this Agreement or breach of Applicable Law. Rehabify shall indemnify the Practitioner against claims and losses arising from Rehabify\'s breach of clause 7 or a security failure of the Workspace, and from claims relating to the Digital Recovery Services it sells, except to the extent caused by the Practitioner\'s programme content or clinical decisions.'
        ),
        p(
          '**11.4 Limitation.** Except for liability under clauses 7, 9 and 11.3, liability for fraud, wilful misconduct, or death or personal injury caused by negligence, neither Party is liable for indirect or consequential loss or loss of profit, and each Party\'s total liability under this Agreement in any 12-month period is limited to ₦2,000,000.'
        ),
      ],
    },
    {
      title: '12. Term and termination',
      blocks: [
        p('**12.1 Term.** This Agreement starts when signed or accepted and continues until terminated.'),
        p(
          '**12.2 By the Practitioner.** The Practitioner may terminate this Agreement at any time by closing their account or giving written notice.'
        ),
        p(
          '**12.3 By Rehabify.** Rehabify may terminate this Agreement (a) on 60 days\' written notice for any reason; or (b) immediately by written notice if the Practitioner\'s MRTB registration or practising licence is suspended, revoked or not renewed within 30 days of expiry, if the Practitioner commits a material breach not remedied within 14 days of notice, or if the Practitioner\'s use of the Workspace presents a serious risk to patients or to the security of the Workspace.'
        ),
        p(
          '**12.4 Active Digital Recovery Services.** Termination does not end a Digital Recovery Service a Practitioner Patient has already paid for. Rehabify will continue to provide it until it expires, using the last programme the Practitioner approved, and will tell the Practitioner Patient that the Practitioner no longer uses the Workspace.'
        ),
        p(
          '**12.5 Data export and deletion.** For 60 days after termination, the Practitioner may export all Practitioner Data in a structured, commonly used, machine-readable format (including PDF copies of clinical records) free of charge. After that period, Rehabify shall delete Practitioner Data within a further 30 days, except where it is required by law to retain it, and shall confirm deletion on request. Where the Practitioner\'s account ends because of the Practitioner\'s death or incapacity, Rehabify shall make the records available to the Practitioner\'s personal representative or to a registered physiotherapist nominated to continue the patients\' care, in line with Applicable Law.'
        ),
        p('**12.6 Survival.** Clauses 7, 8.2, 9, 11, 12.4, 12.5 and 13 survive termination.'),
      ],
    },
    {
      title: '13. Dispute resolution and governing law',
      blocks: [
        p(
          '**13.1** The Parties shall try to resolve any dispute through good-faith discussion between the Practitioner and a director of Rehabify within 15 days of written notice. If unresolved, either Party may refer the dispute to mediation under the Arbitration and Mediation Act 2023 and, if mediation fails or is declined within 30 days, to arbitration under that Act before a sole arbitrator, seated in Lagos, in English. Either Party may seek urgent interim relief from a court.'
        ),
        p('**13.2** This Agreement is governed by the laws of the Federal Republic of Nigeria.'),
      ],
    },
    {
      title: '14. General',
      blocks: [
        p(
          '**14.1 Entire agreement.** This Agreement, its Schedule and Rehabify\'s Terms of Service and Privacy Policy (to the extent they apply to professional users) are the entire agreement between the Parties on its subject matter.'
        ),
        p(
          '**14.2 Amendment.** Rehabify may amend this Agreement on not less than 30 days\' written notice; if the Practitioner does not agree, they may terminate before the change takes effect. Any other amendment must be in writing and agreed to by both Parties.'
        ),
        p(
          '**14.3 Assignment.** The Practitioner may not assign this Agreement. Rehabify may assign it to an affiliate or successor on notice, provided the Practitioner\'s rights are not reduced.'
        ),
        p(
          '**14.4 Notices.** Notices shall be sent by email: to Rehabify at hello@myrehabifyhealth.com and to the Practitioner at the email address on their account.'
        ),
        p(
          '**14.5 Force majeure.** Neither Party is liable for delay or failure caused by events beyond its reasonable control, provided it notifies the other promptly and takes reasonable steps to limit the effect; this does not excuse compliance with clauses 7 and 9 where performance remains possible.'
        ),
        p(
          '**14.6 Waiver and severability.** A failure or delay in exercising a right is not a waiver of it. If any provision is held unenforceable, it shall be modified to the minimum extent necessary, and the rest of this Agreement remains in force.'
        ),
        p(
          '**14.7 Electronic execution.** This Agreement may be signed in counterparts or accepted electronically on the Platform; electronic acceptance is a valid signature, and electronic records of it are admissible under the Evidence Act 2011.'
        ),
      ],
    },
  ],
};
