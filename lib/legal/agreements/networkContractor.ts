import { ol, p, ul, type LegalDocument } from '../types';

/** Network Physiotherapist Independent Contractor Agreement, effective 26 October 2026 (owner-approved wording). {{tokens}} are filled in when someone signs (lib/agreements.ts). */
export const NETWORK_CONTRACTOR_AGREEMENT: LegalDocument = {
  title: 'Network Physiotherapist Independent Contractor Agreement',
  effectiveDate: '26 October 2026',
  version: '2026-10-26',
  intro: [
    p('This Network Physiotherapist Independent Contractor Agreement (the "**Agreement**") is made on {{agreementDate}}.'),
    p('**BETWEEN**'),
    p(
      '**REHABIFY LIMITED**, a private company limited by shares incorporated under the laws of the Federal Republic of Nigeria with RC Number 6989173, having its registered office at Okeoffa, Babasale, Oje, Ibadan, Ibadan North-East, Oyo State (hereinafter referred to as "**Rehabify**", which expression shall, where the context admits, include its successors and permitted assigns);'
    ),
    p('**AND**'),
    p(
      '**{{signerName}}**, a physiotherapist registered with the Medical Rehabilitation Therapists (Registration) Board of Nigeria under Registration Number **{{mrtbNumber}}**{{practiceClause}} (hereinafter referred to as the "**Contractor**", which expression shall, where the context admits, include their personal representatives and permitted assigns).'
    ),
    p('Rehabify and the Contractor may each be referred to as a "**Party**" and together as the "**Parties**".'),
  ],
  sections: [
    {
      title: 'Recitals',
      blocks: [
        p(
          '**A.** Rehabify operates a technology-enabled rehabilitation care platform, trading as Rehabify, Rehabify Health and Physio Around Me, through which Patients in Nigeria book and pay for physiotherapy services ("**Rehabify Care**").'
        ),
        p(
          '**B.** The Contractor is a physiotherapist duly registered with, and holding a current annual practising licence issued by, the Medical Rehabilitation Therapists (Registration) Board of Nigeria, and carries on an independent professional practice.'
        ),
        p(
          '**C.** Rehabify wishes to engage the Contractor, on a non-exclusive basis and as an independent contractor, to deliver physiotherapy services to Rehabify Care Patients who are matched with the Contractor and whom the Contractor agrees to treat.'
        ),
        p(
          '**D.** The Parties intend that the Contractor shall at all times exercise independent clinical judgement, and that nothing in this Agreement shall compromise the Contractor\'s professional and ethical obligations to Patients.'
        ),
        p(
          '**E.** The Parties wish to record the terms on which the Contractor will provide such services, in compliance with the Medical Rehabilitation Therapists (Registration, etc.) Act, the National Health Act 2014, the Nigeria Data Protection Act 2023 and all other Applicable Laws.'
        ),
        p('**NOW, THIS AGREEMENT WITNESSES AS FOLLOWS:**'),
      ],
    },
    {
      title: '1. Interpretation',
      blocks: [
        p('**1.1 Definitions.** In this Agreement, unless the context otherwise requires:'),
        ol(
          '"**Applicable Law**" means all laws, regulations, directives, codes of ethics and professional standards in force in Nigeria from time to time, including the Medical Rehabilitation Therapists (Registration, etc.) Act, Cap. M9, Laws of the Federation of Nigeria 2004 and regulations made under it, the MRTB Code of Ethics, the National Health Act 2014, the Nigeria Data Protection Act 2023 ("**NDPA**"), the NDPA General Application and Implementation Directive 2025 ("**GAID**"), the Federal Competition and Consumer Protection Act 2018, the Child Rights Act 2003 (as domesticated), the Cybercrimes (Prohibition, Prevention, etc.) Act 2015 (as amended), the Nigeria Tax Act 2025 and the Nigeria Tax Administration Act 2025.',
          '"**Booking**" means a request for a Clinical Service by a Patient that has been paid for through the Platform and sent to the Contractor.',
          '"**Clinical Record**" means the assessment findings, care plans, session notes, consent records, outcome measures, discharge summaries and other clinical documentation relating to a Rehabify Care Patient.',
          '"**Clinical Service**" means a physiotherapy consultation, assessment, reassessment or treatment session of a type listed in Schedule 1, delivered virtually or at a Patient\'s home.',
          '"**Commencement Date**" means the date on which Rehabify notifies the Contractor that their account has been approved following completion of the onboarding requirements in Schedule 3.',
          '"**Confidential Information**" means all non-public information disclosed by or on behalf of a Party in connection with this Agreement, including Patient information, pricing, payout data, business plans, software and know-how.',
          '"**MRTB**" means the Medical Rehabilitation Therapists (Registration) Board of Nigeria.',
          '"**Patient**" means an individual who books Clinical Services through Rehabify Care, and includes a parent, guardian or authorised representative acting on their behalf.',
          '"**Payout**" means the amount payable to the Contractor for a completed Clinical Service as set out in Schedule 1 and the Payout Policy.',
          '"**Personal Data**" and "**Sensitive Personal Data**" have the meanings given in the NDPA, and include health data.',
          '"**Platform**" means Rehabify\'s website, web and mobile applications, clinician dashboard, WhatsApp channels (including Joy) and related systems.',
          '"**Policies**" means Rehabify\'s Terms of Service, Privacy Policy, Payment Policy, Payout Policy and Consultation and Booking Policy, and any clinical governance, safeguarding or information-security procedure that Rehabify provides to the Contractor in writing, each as amended under clause 21.2.',
          '"**Practising Licence**" means the Contractor\'s current annual practising licence issued by the MRTB.',
          '"**Rehabify Access**" means Rehabify\'s affordability programme for eligible Patients.',
          '"**Business Day**" means any day other than a Saturday, Sunday or public holiday in Nigeria.'
        ),
        p(
          '**1.2 Interpretation.** Headings do not affect interpretation. "Including" means "including without limitation". Words in the singular include the plural and vice versa. A reference to a law includes that law as amended, extended or re-enacted. The Schedules form part of this Agreement.'
        ),
        p(
          '**1.3 Order of precedence.** If there is a conflict, the following order applies: (a) the clauses of this Agreement; (b) the Schedules; (c) the Payout Policy; (d) the other Policies. Nothing in any document requires the Contractor to act contrary to Applicable Law or the MRTB Code of Ethics.'
        ),
      ],
    },
    {
      title: '2. Engagement and status',
      blocks: [
        p(
          '**2.1 Engagement.** Rehabify engages the Contractor, with effect from the Commencement Date, to provide Clinical Services to Patients under Bookings that the Contractor accepts, on the terms of this Agreement.'
        ),
        p(
          '**2.2 Independent contractor.** The Contractor is an independent contractor. Nothing in this Agreement creates a relationship of employment, agency, partnership or joint venture between the Parties. The Contractor is not entitled to salary, pension contributions, leave, or any other employment benefit from Rehabify, and shall not hold themselves out as an employee or agent of Rehabify.'
        ),
        p('**2.3 Control of work.** Consistent with clause 2.2, the Contractor:'),
        ol(
          'decides when they are available, sets their own availability on the Platform and may change it at any time;',
          'is free to accept or decline any Booking without giving a reason and without penalty;',
          'determines the clinical method and content of each Clinical Service in the exercise of independent professional judgement;',
          'provides their own portable equipment, device, data connection and transport, save as otherwise agreed in writing; and',
          'bears their own business costs, except the travel share payable under clause 7.'
        ),
        p(
          '**2.4 No minimum commitment.** Rehabify does not guarantee any number of Bookings, Patients or earnings. Matching depends on Patient demand, suitability, location, availability and Patient choice. The Contractor is not required to accept any minimum number of Bookings or hours.'
        ),
        p(
          '**2.5 Non-exclusivity.** This Agreement is non-exclusive. The Contractor may practise privately, work for any employer, hospital or clinic, and provide services through other platforms, provided that the Contractor complies with clauses 6, 10 and 11.'
        ),
        p(
          '**2.6 No authority to bind.** Neither Party has authority to bind the other or to incur any liability on the other\'s behalf, except that the Contractor authorises Rehabify to collect payment from Patients for Clinical Services in Rehabify\'s own name as the seller of Rehabify Care.'
        ),
        p(
          '**2.7 Personal services and substitution.** Clinical Services must be delivered personally by the Contractor. The Contractor may not send a substitute, assistant or student in their place without Rehabify\'s prior written consent and the Patient\'s consent, and any approved substitute must be a Network Physiotherapist approved by Rehabify.'
        ),
      ],
    },
    {
      title: '3. Eligibility, onboarding and continuing requirements',
      blocks: [
        p(
          '**3.1 Conditions of approval.** Rehabify will approve the Contractor\'s account only after it has received and verified the documents and information listed in Schedule 3, including evidence of current MRTB registration and Practising Licence.'
        ),
        p(
          '**3.2 Continuing warranties.** The Contractor warrants, on the date of this Agreement and on each day they accept or deliver a Booking, that:'
        ),
        ol(
          'they are registered with the MRTB and hold a current Practising Licence, and are not subject to any suspension, restriction, condition or undertaking on their practice that they have not disclosed to Rehabify in writing;',
          'they meet the MRTB\'s continuing professional development requirements for renewal of their Practising Licence;',
          'all information and documents they have given Rehabify are true, complete and not misleading;',
          'they have not been convicted of any offence involving violence, dishonesty, sexual misconduct or harm to a child or vulnerable adult, and are not the subject of a pending charge for any such offence, save as disclosed in writing to Rehabify; and',
          'they will deliver Clinical Services only within the limits of their training, competence and scope of practice.'
        ),
        p(
          '**3.3 Duty to notify.** The Contractor shall notify Rehabify in writing within 24 hours of becoming aware of any of the following: (a) expiry, non-renewal, suspension, restriction or revocation of their MRTB registration or Practising Licence; (b) any complaint to, investigation by, or disciplinary proceeding before the MRTB or any other regulator or employer concerning their practice; (c) any arrest, charge or conviction for an offence referred to in clause 3.2(4); (d) any claim against them arising from professional practice; (e) any lapse or cancellation of the insurance required by clause 13; or (f) any health condition that may affect their ability to practise safely.'
        ),
        p(
          '**3.4 Annual renewal.** The Contractor shall upload evidence of the renewed Practising Licence to the Platform as soon as it is issued and in any event before the existing licence expires. Rehabify will automatically pause new Bookings to the Contractor from the date the current Practising Licence expires until the renewed licence is verified.'
        ),
        p(
          '**3.5 Verification.** The Contractor consents to Rehabify verifying their registration and Practising Licence with the MRTB and its public register, contacting referees, and carrying out identity and, where permitted by law, criminal-record checks. Rehabify will process the Contractor\'s Personal Data for these purposes in accordance with its Privacy Policy.'
        ),
        p(
          '**3.6 Profile.** The Contractor authorises Rehabify to publish on the Platform their name, photograph, qualifications, MRTB registration status, languages, service areas and a short professional biography that the Contractor approves. The Contractor shall keep their profile accurate and shall not make claims about their qualifications, experience or outcomes that are untrue or misleading.'
        ),
      ],
    },
    {
      title: '4. Bookings',
      blocks: [
        p(
          '**4.1 Offer and acceptance.** Rehabify will offer Bookings through the Platform. Each Booking shows the service, date, time, format, Patient\'s general location (for home visits), relevant intake information, the Payout and any travel share. The Contractor shall accept or decline each Booking within the response time in Schedule 2. A Booking binds the Contractor only once accepted.'
        ),
        p(
          '**4.2 Information before acceptance.** Before accepting, the Contractor shall review the intake information and decline any Booking that is outside their competence or for which they cannot attend on time.'
        ),
        p(
          '**4.3 Cancellation by the Contractor.** The Contractor shall cancel an accepted Booking only for good reason (such as illness, emergency or safety), and shall give Rehabify and the Patient as much notice as possible through the Platform. Rehabify will offer the Patient a replacement or refund.'
        ),
        p(
          '**4.4 Prices are set by Rehabify.** Rehabify sets the price that Patients pay for Rehabify Care. The Contractor shall not quote or charge Patients any additional fee, deposit, tip or charge for a Booking, and shall not sell any product or service to a Rehabify Care Patient during a Booking, including equipment, supplements or private sessions.'
        ),
      ],
    },
    {
      title: '5. Delivery of Clinical Services',
      blocks: [
        p(
          '**5.1 Standard of care.** The Contractor shall deliver every Clinical Service with the reasonable skill, care and diligence expected of a competent registered physiotherapist in Nigeria, in accordance with Applicable Law, the MRTB Code of Ethics and the service standards in Schedule 2.'
        ),
        p(
          '**5.2 Clinical independence.** The Contractor retains full responsibility for, and independence in, all clinical decisions, including assessment, diagnosis within physiotherapy scope, treatment, referral and discharge. Rehabify shall not direct, and the Contractor shall not accept direction on, any clinical matter from any non-clinical person. Rehabify shall not set any target for the number of sessions recommended or digital services sold.'
        ),
        p(
          '**5.3 Consent.** The Contractor shall obtain and record valid informed consent before any assessment or treatment, in line with clause 6 of the Consultation and Booking Policy, and shall obtain consent from a parent or legal guardian for any Patient under 18.'
        ),
        p(
          '**5.4 Safety and red flags.** The Contractor shall screen for red-flag signs and contraindications at every assessment, shall not treat where physiotherapy is unsafe, and shall promptly direct the Patient to emergency or medical care where indicated and record that advice.'
        ),
        p(
          '**5.5 Clinical records.** The Contractor shall record every Clinical Service contemporaneously on the Platform, and in any event shall complete the session note within 24 hours of the session ending. Records must be accurate, legible, dated and sufficient for another physiotherapist to continue care. The Contractor shall not keep separate records of Rehabify Care Patients outside the Platform, save as required by Applicable Law.'
        ),
        p(
          '**5.6 Home visits.** For home visits, the Contractor shall carry and show Rehabify identification, follow Rehabify\'s lone-worker and infection-prevention procedures, respect the Patient\'s home and privacy, and may decline to start or may end a visit where they reasonably believe their or the Patient\'s safety is at risk, informing Rehabify promptly.'
        ),
        p(
          '**5.7 Virtual sessions.** For virtual sessions, the Contractor shall use only the video service provided through the Platform, conduct the session from a private location, confirm the Patient\'s identity and location at the start, and stop the session and arrange appropriate care if it becomes unsafe to continue remotely.'
        ),
        p(
          '**5.8 Recording.** The Contractor shall not record, photograph or stream any session without the express, documented consent of the Patient (and of any other person present), and any approved clip must be stored only on the Platform.'
        ),
        p(
          '**5.9 Professional boundaries and safeguarding.** The Contractor shall maintain professional boundaries at all times; shall not enter into any personal, sexual, romantic or financial relationship with a Patient; shall offer a chaperone where appropriate; and shall comply with Rehabify\'s safeguarding procedure, including reporting concerns about a child or vulnerable adult.'
        ),
        p(
          '**5.10 Joy and Digital Recovery Services.** The Contractor shall approve or prepare each Patient\'s home programme on the Platform. The Contractor acknowledges that Joy does not make clinical decisions, and shall respond within a reasonable time to escalations that Rehabify routes to them, during their working hours.'
        ),
      ],
    },
    {
      title: '6. Patient relationship and non-circumvention',
      blocks: [
        p(
          '**6.1 Patient choice.** Neither Party owns any Patient. Every Patient is free to choose and change their physiotherapist and to seek care elsewhere, and nothing in this clause restricts that freedom.'
        ),
        p(
          '**6.2 Payments for Rehabify Care.** The Contractor shall not request or accept, directly or indirectly, any payment from a Rehabify Care Patient for a Clinical Service that was or could have been booked through Rehabify Care, and shall refer any Patient who wishes to pay or rebook to the Platform.'
        ),
        p(
          '**6.3 No solicitation.** During this Agreement and for 6 months after the Contractor\'s last Clinical Service with a Rehabify Care Patient, the Contractor shall not use Patient contact details, Clinical Records or any other information obtained through Rehabify to solicit, invite or induce that Patient to receive physiotherapy from the Contractor or any third party outside the Platform.'
        ),
        p(
          '**6.4 Patient-initiated choice.** Clause 6.3 does not prevent the Contractor from treating a Patient who, on their own initiative and without solicitation, chooses to see the Contractor privately, provided that the Contractor (a) tells Rehabify in writing within 7 days, (b) does not use Rehabify\'s Platform, branding or Patient data for that private care except under an Independent Physiotherapist Platform Agreement, and (c) ensures the Patient understands that the private care is not provided by or through Rehabify.'
        ),
        p(
          '**6.5 Existing patients.** Clauses 6.2 to 6.4 do not apply to a person who was the Contractor\'s patient before the Patient\'s first Rehabify Care Booking, if the Contractor can reasonably demonstrate the prior relationship.'
        ),
        p(
          '**6.6 Separate relationships.** Where the Contractor also uses Rehabify as an Independent Physiotherapist or works for a Rehabify subscriber Clinic, the terms applicable to each Patient are determined by how that Patient came to the Contractor and which service is provided, not by the Contractor\'s status alone.'
        ),
      ],
    },
    {
      title: '7. Payouts and expenses',
      blocks: [
        p(
          '**7.1 Payout.** In consideration of each Clinical Service completed in accordance with this Agreement, Rehabify shall pay the Contractor the Payout for that service set out in Schedule 1, together with the travel share for any home visit, in accordance with the Payout Policy.'
        ),
        p(
          '**7.2 Payout fixed at acceptance.** The Payout and travel share shown on a Booking when the Contractor accepts it are the amounts payable for that Booking, notwithstanding any later change to Schedule 1.'
        ),
        p(
          '**7.3 Discounts borne by Rehabify.** Rehabify shall not reduce the Payout for a completed Clinical Service because a Patient received a discount, package price, promotional code, sponsored credit, goodwill refund or other concession. Rehabify bears the cost of any such concession.'
        ),
        p(
          '**7.4 Cancellations and non-attendance.** Payouts for Patient cancellations, Patient non-attendance, platform failures and Contractor cancellations are payable as set out in section 4 of the Payout Policy.'
        ),
        p(
          '**7.5 Payment timing and method.** Rehabify shall pay all Payouts that have become available under the Payout Policy in weekly payout runs by bank transfer to the Contractor\'s nominated Nigerian bank account, together with a remittance statement. Failure by Rehabify to pay undisputed Payouts within 5 Business Days of the scheduled payout run, after written notice from the Contractor, is a material breach of this Agreement.'
        ),
        p(
          '**7.6 No deductions except as permitted.** Rehabify shall not deduct any platform fee, commission, payment-processing fee, fine or penalty from the Contractor\'s Payouts. Rehabify may deduct only the amounts permitted by section 8 of the Payout Policy, following the notice process in that section.'
        ),
        p(
          '**7.7 Rehabify Access.** The Contractor may opt in or out of Rehabify Access sessions at any time. Access Bookings pay the assisted payout shown on the Booking, which the Contractor may accept or decline. Rehabify shall not reduce standard Payouts to fund Rehabify Access.'
        ),
        p(
          '**7.8 Expenses.** Except for the travel share, the Contractor bears all expenses of providing the Clinical Services, unless Rehabify agrees in writing in advance to reimburse a specific expense.'
        ),
        p(
          '**7.9 Patient money.** Payments made by Patients for Rehabify Care are Rehabify\'s revenue, collected by Rehabify in its own name. The Contractor\'s entitlement is to the Payout under this clause 7, and not to any share of Patient payments.'
        ),
        p(
          '**7.10 Records and disputes.** The Contractor may query any Payout within 30 days of the relevant remittance statement. Rehabify shall respond within 5 Business Days and correct any error in the next payout run.'
        ),
      ],
    },
    {
      title: '8. Tax',
      blocks: [
        p(
          '**8.1 Contractor\'s responsibility.** The Contractor is solely responsible for registering with the relevant tax authority, filing returns, and paying all income tax and other taxes and levies arising on Payouts. The Contractor shall provide a valid tax identification number before the first Payout.'
        ),
        p(
          '**8.2 Withholding.** Where Applicable Law requires Rehabify to deduct tax at source from any Payout, Rehabify shall deduct it, remit it to the relevant tax authority within the statutory period, and give the Contractor a receipt or credit note for the amount deducted.'
        ),
        p(
          '**8.3 Indemnity.** The Contractor shall indemnify Rehabify against any tax, interest or penalty assessed on Rehabify because the Contractor failed to account for tax on Payouts, except to the extent caused by Rehabify\'s own failure to withhold or remit tax as required by clause 8.2.'
        ),
      ],
    },
    {
      title: '9. Rewards and anti-inducement',
      blocks: [
        p(
          '**9.1 Rewards programme.** Rehabify may, at its discretion, offer the Contractor sponsored patient-access credits or other rewards for verified onboarding, professional development, feedback or appropriate participation, under written rewards terms. Rewards are not remuneration, have no cash value, may be capped and may be withdrawn on reasonable notice.'
        ),
        p(
          '**9.2 No reward for volume of care.** No reward, payout, or other benefit under this Agreement shall be linked to the number or value of Clinical Services the Contractor recommends, Digital Recovery Services sold, or renewals purchased by Patients.'
        ),
        p(
          '**9.3 No referral payments.** The Contractor shall not offer, pay, request or accept any fee, commission, gift or other benefit for referring a Patient to or from Rehabify, any other healthcare provider, supplier or financing partner, where to do so would breach Applicable Law or the MRTB Code of Ethics.'
        ),
        p(
          '**9.4 Anti-bribery.** Each Party shall comply with all applicable anti-corruption laws, including the Corrupt Practices and Other Related Offences Act 2000, and shall not offer or give any improper payment or advantage to any person, including any public official, in connection with this Agreement.'
        ),
        p(
          '**9.5 Gifts.** The Contractor shall not accept gifts, money or hospitality from Patients other than tokens of nominal value, and shall declare to Rehabify any offer of a gift above ₦10,000 in value.'
        ),
      ],
    },
    {
      title: '10. Data protection',
      blocks: [
        p(
          '**10.1 Roles.** For Rehabify Care, Rehabify and the Contractor are joint data controllers of each Patient\'s Clinical Record: Rehabify determines the systems, security, retention and Patient-facing processes, and the Contractor determines the clinical content. Rehabify is the sole controller of all other Patient Personal Data (including booking, payment and Joy data) and of the Contractor\'s own Personal Data. This clause 10 is the Parties\' arrangement for joint controllers.'
        ),
        p('**10.2 Allocation of responsibilities.**'),
        ol(
          'Rehabify is responsible for: the privacy notice to Patients; obtaining and recording Patients\' explicit consent to processing of health data and to cross-border transfers; registration with the Nigeria Data Protection Commission; the Platform\'s security; contracts with data processors; responding to data subject requests (with the Contractor\'s assistance); breach notification to the Commission and Patients; and secure retention and deletion of Clinical Records.',
          'The Contractor is responsible for: the accuracy and completeness of Clinical Records they create; accessing only the records of Patients they are treating; keeping their devices and credentials secure; and complying with clause 10.3.'
        ),
        p('**10.3 Contractor\'s obligations.** The Contractor shall:'),
        ol(
          'process Patient Personal Data only to deliver Clinical Services and meet their legal and professional obligations, and for no other purpose;',
          'access and store Patient Personal Data only within the Platform, and not download, copy, photograph, forward or export it (including to personal phones, WhatsApp accounts or email) except as the Platform permits for clinical care;',
          'communicate with Patients about their care only through the Platform, save in an emergency;',
          'use multi-factor authentication, a device screen lock and up-to-date operating system on every device used to access the Platform, and log out of shared devices;',
          'hold Patient information in strict confidence in accordance with the National Health Act 2014 and the MRTB Code of Ethics;',
          'notify Rehabify at privacy@physioaroundme.com within 24 hours of becoming aware of any actual or suspected personal data breach, loss of a device used for the Platform, or unauthorised access, and cooperate fully so that Rehabify can meet its 72-hour obligation to notify the Commission;',
          'promptly forward to Rehabify any request from a Patient to exercise their data protection rights, and help Rehabify respond within the statutory period;',
          'not disclose Patient Personal Data to any third party (including another clinician) without the Patient\'s consent, except where required by law or necessary to protect the Patient\'s vital interests; and',
          'complete Rehabify\'s data protection and confidentiality training before the first Booking and annually thereafter.'
        ),
        p(
          '**10.4 Contractor\'s Personal Data.** Rehabify processes the Contractor\'s Personal Data, including verification documents, bank details and performance information, in accordance with its Privacy Policy, for the purposes of this Agreement and Applicable Law.'
        ),
        p(
          '**10.5 Access to records after termination.** Rehabify shall retain Clinical Records for the period in its Privacy Policy and shall give the Contractor reasonable access to the Clinical Records of Patients they treated where needed to respond to a complaint, claim, regulatory inquiry or legal obligation, both during and after this Agreement.'
        ),
      ],
    },
    {
      title: '11. Confidentiality',
      blocks: [
        p(
          '**11.1** Each Party shall keep the other Party\'s Confidential Information confidential, use it only to perform this Agreement, and disclose it only to its personnel and advisers who need to know it and are bound by equivalent obligations, or where required by law, a court or a regulator (in which case, where lawful, the disclosing Party shall notify the other Party first).'
        ),
        p(
          '**11.2** Confidential Information does not include information that is or becomes public other than through breach of this Agreement, or that the receiving Party already lawfully held or independently developed.'
        ),
        p(
          '**11.3** This clause survives termination of this Agreement indefinitely in respect of Patient information and for 3 years in respect of other Confidential Information.'
        ),
      ],
    },
    {
      title: '12. Intellectual property',
      blocks: [
        p(
          '**12.1 Rehabify\'s IP.** All intellectual property rights in the Platform, Joy, Rehabify\'s exercise library, templates, branding and materials remain with Rehabify or its licensors. Rehabify grants the Contractor a non-exclusive, non-transferable, royalty-free licence to use them during this Agreement solely to provide Clinical Services.'
        ),
        p(
          '**12.2 Contractor content.** The Contractor retains ownership of their pre-existing know-how and materials. Where the Contractor creates exercise videos, education materials or templates for use on the Platform, the Contractor grants Rehabify a perpetual, worldwide, non-exclusive, royalty-free licence to use, adapt and distribute them on the Platform, and warrants that they have the right to do so and that no Patient is identifiable in them without that Patient\'s written consent.'
        ),
        p(
          '**12.3 Name and likeness.** Rehabify may use the Contractor\'s name and approved photograph to identify them as a Network Physiotherapist on the Platform. Any other marketing use requires the Contractor\'s prior written consent. The Contractor shall not use Rehabify\'s name or logo except to state truthfully that they are a Rehabify Network Physiotherapist.'
        ),
      ],
    },
    {
      title: '13. Insurance',
      blocks: [
        p(
          '**13.1** The Contractor shall maintain, throughout this Agreement and for at least 2 years after it ends, professional indemnity (medical malpractice) insurance shall be covered under a group professional indemnity policy arranged by Rehabify on the terms notified to the Contractor in writing.'
        ),
        p('**13.2** The Contractor shall provide evidence of cover before the first Booking and on each renewal, and on request.'),
        p('**13.3** Rehabify shall maintain appropriate public liability, professional indemnity (for its own services) and cyber-liability insurance.'),
      ],
    },
    {
      title: '14. Liability and indemnity',
      blocks: [
        p(
          '**14.1 Contractor\'s indemnity.** The Contractor shall indemnify Rehabify against all losses, damages, fines, costs and reasonable legal fees arising from (a) the Contractor\'s professional negligence, misconduct or breach of Applicable Law; (b) the Contractor\'s breach of clauses 6, 10 or 11; or (c) any claim by a Patient or third party to the extent caused by the Contractor\'s acts or omissions.'
        ),
        p(
          '**14.2 Rehabify\'s indemnity.** Rehabify shall indemnify the Contractor against all losses, damages, fines, costs and reasonable legal fees arising from (a) Rehabify\'s breach of its data protection obligations, including any security failure of the Platform; (b) a failure of Rehabify\'s own systems, booking, payment or matching processes; or (c) the negligence or misconduct of Rehabify\'s employees.'
        ),
        p(
          '**14.3 Conduct of claims.** A Party seeking an indemnity shall notify the other promptly, allow it to conduct the defence (subject to the indemnifying Party\'s insurer and to the Contractor\'s right to separate representation before the MRTB), and not settle without consent, which shall not be unreasonably withheld.'
        ),
        p(
          '**14.4 Limitation.** Except for liability under clauses 10, 11, 14.1 and 14.2, liability for fraud, wilful misconduct, death or personal injury caused by negligence, and Rehabify\'s obligation to pay Payouts, neither Party shall be liable to the other for indirect or consequential loss or loss of profit, and each Party\'s total liability to the other under this Agreement in any 12-month period shall not exceed the greater of ₦5,000,000 and the total Payouts paid to the Contractor in that period.'
        ),
        p('**14.5 Survival.** This clause 14 survives termination.'),
      ],
    },
    {
      title: '15. Quality, complaints and audit',
      blocks: [
        p(
          '**15.1 Clinical governance.** Rehabify operates a clinical governance process led by a registered physiotherapist. The Contractor shall cooperate with it, including by participating in peer review of a sample of Clinical Records, case discussions and learning from incidents.'
        ),
        p(
          '**15.2 Complaints.** The Contractor shall respond to any complaint or incident that Rehabify refers to them within 3 Business Days, give a full and honest account, and cooperate with Rehabify\'s investigation. Rehabify shall give the Contractor a fair opportunity to respond before reaching any conclusion and shall share its findings in writing.'
        ),
        p(
          '**15.3 Regulators.** Nothing in this Agreement prevents either Party from reporting a matter to the MRTB, the police or any other regulator where required by law or where patient safety requires it. Rehabify shall, where lawful and safe, tell the Contractor before making a report that concerns them.'
        ),
        p(
          '**15.4 Performance support.** Where Rehabify has reasonable concerns about service quality, punctuality, cancellations or documentation, it may, in proportion to the concern, (a) give feedback; (b) agree a written improvement plan; (c) reduce the Bookings offered while the plan is in progress; or (d) proceed under clause 17 or 16. Rehabify shall not impose fines.'
        ),
        p(
          '**15.5 Patient feedback.** The Contractor consents to Rehabify collecting Patient ratings and feedback and displaying aggregated ratings on the Platform. Rehabify shall remove feedback that is abusive, discriminatory, or plainly not about the Contractor\'s services.'
        ),
      ],
    },
    {
      title: '16. Term and termination',
      blocks: [
        p(
          '**16.1 Term.** This Agreement starts on the date of signature, takes effect for Bookings from the Commencement Date, and continues until terminated under this clause.'
        ),
        p(
          '**16.2 Termination without cause.** Either Party may terminate this Agreement for any reason by giving not less than 30 days\' written notice. During the notice period, the Contractor shall complete accepted Bookings unless the Parties agree otherwise.'
        ),
        p(
          '**16.3 Termination for cause by either Party.** Either Party may terminate this Agreement by written notice if the other Party commits a material breach that is not capable of remedy or, if capable of remedy, is not remedied within 14 days of written notice describing it.'
        ),
        p(
          '**16.4 Immediate termination by Rehabify.** Rehabify may terminate this Agreement immediately by written notice if: (a) the Contractor\'s MRTB registration or Practising Licence is suspended, revoked or not renewed within 30 days of expiry; (b) the Contractor is found, after the process in clause 15.2, to have committed fraud, dishonesty, sexual misconduct, abuse of a Patient, serious professional misconduct or a serious breach of clause 6 or 10; or (c) the Contractor\'s continued engagement presents a serious risk to Patient safety.'
        ),
        p(
          '**16.5 Immediate termination by the Contractor.** The Contractor may terminate this Agreement immediately by written notice if Rehabify fails to pay undisputed Payouts after notice under clause 7.5, or if Rehabify\'s conduct would require the Contractor to act contrary to Applicable Law or the MRTB Code of Ethics.'
        ),
        p(
          '**16.6 Consequences.** On termination: (a) Rehabify shall pay all Payouts due within 14 days, less any permitted deduction; (b) the Contractor shall complete or hand over (as Rehabify directs, with the Patients\' interests as the priority) any outstanding Bookings and ensure all Clinical Records are complete; (c) the Contractor\'s access to the Platform shall end, subject to clause 10.5; (d) the Contractor shall delete any Patient information held outside the Platform, save where retention is required by law; and (e) clauses 6.2, 6.3, 8, 10, 11, 12, 13, 14, 18 and any other clause intended to survive shall continue in force.'
        ),
      ],
    },
    {
      title: '17. Suspension',
      blocks: [
        p(
          '**17.1** Rehabify may suspend new Bookings to the Contractor, for no longer than is reasonably necessary, while it investigates a credible allegation of misconduct or a serious patient-safety concern, or while the Contractor\'s Practising Licence is unverified. Rehabify shall tell the Contractor the reason in writing, unless doing so would prejudice an investigation by the police or a regulator.'
        ),
        p(
          '**17.2** Suspension does not affect the Contractor\'s entitlement to Payouts for Clinical Services completed before it, except as provided in section 11 of the Payout Policy. Rehabify shall aim to conclude any investigation within 30 days.'
        ),
      ],
    },
    {
      title: '18. Dispute resolution',
      blocks: [
        p(
          '**18.1 Negotiation.** Any dispute arising out of or in connection with this Agreement shall first be referred, by written notice, to a meeting (in person or virtual) between the Contractor and a director of Rehabify, to be held within 15 days of the notice.'
        ),
        p(
          '**18.2 Mediation.** If the dispute is not resolved within 15 days of that meeting, either Party may refer it to mediation under the Arbitration and Mediation Act 2023 at the Lagos Multi-Door Courthouse, or before a mediator agreed by the Parties.'
        ),
        p(
          '**18.3 Arbitration.** If the dispute is not resolved within 30 days of the referral to mediation, or if either Party declines to mediate, it shall be finally resolved by arbitration under the Arbitration and Mediation Act 2023 before a sole arbitrator appointed by agreement or, failing agreement within 15 days, by the Chairman of the Chartered Institute of Arbitrators (UK), Nigeria Branch. The seat of arbitration shall be Lagos, Nigeria, and the language English.'
        ),
        p(
          '**18.4 Interim relief and regulators.** Nothing in this clause prevents a Party from seeking urgent interim relief from a court of competent jurisdiction, or from engaging with the MRTB, the Nigeria Data Protection Commission or another regulator on matters within its remit.'
        ),
        p(
          '**18.5 Continued performance.** The Parties shall continue to perform their undisputed obligations, including the payment of undisputed Payouts, while a dispute is being resolved.'
        ),
        p(
          '**18.6 Costs.** Unless the arbitrator decides otherwise, each Party bears its own costs and the Parties share the fees of the mediator or arbitrator equally.'
        ),
      ],
    },
    {
      title: '19. Force majeure',
      blocks: [
        p(
          '**19.1** Neither Party is liable for delay or failure to perform caused by events beyond its reasonable control, including natural disasters, epidemics, civil unrest, strikes, failure of public power or telecommunications networks, or government action, provided that it notifies the other Party within 3 Business Days with details of the event and its expected duration and uses reasonable efforts to mitigate its effect.'
        ),
        p(
          '**19.2** Force majeure does not excuse payment of sums already due or compliance with clauses 10 and 11 to the extent performance remains possible. If a force majeure event continues for more than 60 days, either Party may terminate this Agreement by 15 days\' written notice.'
        ),
      ],
    },
    {
      title: '20. Notices',
      blocks: [
        p(
          '**20.1** Notices under this Agreement shall be in writing and sent by email to the addresses below (or such other address as a Party notifies in writing). Operational communications about Bookings may also be sent through the Platform.'
        ),
        ul(
          'Rehabify: Attention: Chief Executive Officer · hello@myrehabifyhealth.com',
          'Contractor: the email address registered on the Contractor\'s Platform account'
        ),
        p(
          '**20.2** A notice sent by email is deemed received at the time of sending if sent before 5:00 p.m. on a Business Day, and otherwise at 9:00 a.m. on the next Business Day, unless the sender receives an automated message that the email was not delivered.'
        ),
      ],
    },
    {
      title: '21. General',
      blocks: [
        p(
          '**21.1 Entire agreement.** This Agreement, its Schedules and the Policies constitute the entire agreement between the Parties on its subject matter and supersede all prior agreements, representations and understandings.'
        ),
        p(
          '**21.2 Amendments and changes to Policies.** No amendment to the clauses of this Agreement is effective unless in writing and signed by both Parties. Rehabify may amend Schedule 1, Schedule 2 or the Policies by giving the Contractor not less than 30 days\' written notice; no such change applies to Bookings accepted before it takes effect, and no change may reduce Payouts retrospectively. If the Contractor does not accept a change, they may terminate this Agreement before the change takes effect without giving the notice in clause 16.2.'
        ),
        p(
          '**21.3 Assignment.** The Contractor may not assign or subcontract this Agreement. Rehabify may assign it to an affiliate or a successor to its business on written notice, provided the Contractor\'s rights are not reduced.'
        ),
        p('**21.4 Waiver.** A failure or delay in exercising a right is not a waiver of it, and a waiver is effective only if in writing.'),
        p(
          '**21.5 Severability.** If any provision is held invalid or unenforceable, it shall be modified to the minimum extent necessary to make it enforceable, and the rest of this Agreement shall remain in force.'
        ),
        p('**21.6 Third parties.** Except that Patients may rely on clauses 5 and 10, no person other than the Parties has any right to enforce this Agreement.'),
        p(
          '**21.7 Counterparts and electronic signature.** This Agreement may be executed in counterparts and by electronic signature, each of which is an original and which together are one instrument. The Parties agree that an electronic signature is valid and that electronic records of this Agreement are admissible under the Evidence Act 2011.'
        ),
        p('**21.8 Stamp duty.** Rehabify shall bear any stamp duty payable on this Agreement.'),
        p('**21.9 Governing law.** This Agreement is governed by the laws of the Federal Republic of Nigeria.'),
      ],
    },
  ],
};
