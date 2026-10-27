import { ol, p, table, type LegalDocument } from '../types';

/** Clinic Master Software-as-a-Service Agreement, effective 26 October 2026 (owner-approved wording). {{tokens}} are filled in when the clinic signs (lib/agreements.ts). */
export const CLINIC_MASTER_SAAS_AGREEMENT: LegalDocument = {
  title: 'Clinic Master SaaS Agreement',
  effectiveDate: '26 October 2026',
  version: '2026-10-26',
  intro: [
    p('This Clinic Master Software-as-a-Service Agreement (the "**Agreement**") is made on {{agreementDate}}.'),
    p('**BETWEEN**'),
    p(
      '**REHABIFY LIMITED**, a private company limited by shares incorporated under the laws of the Federal Republic of Nigeria with RC Number 6989173, having its registered office at Okeoffa, Babasale, Oje, Ibadan, Ibadan North-East, Oyo State (hereinafter referred to as "**Rehabify**", which expression shall, where the context admits, include its successors and permitted assigns);'
    ),
    p('**AND**'),
    p(
      '**{{clinicLegalName}}**, a {{entityType}} registered under the laws of the Federal Republic of Nigeria with {{registrationLabel}} Number **{{registrationNumber}}**, having its {{addressLabel}} at {{clinicAddress}} (hereinafter referred to as the "**Clinic**", which expression shall, where the context admits, include its successors and permitted assigns).'
    ),
    p('Rehabify and the Clinic may each be referred to as a "**Party**" and together as the "**Parties**".'),
  ],
  sections: [
    {
      title: 'Recitals',
      blocks: [
        p(
          '**A.** Rehabify has developed and operates a cloud-based clinical and practice management system for physiotherapy and rehabilitation providers, including electronic clinical records, scheduling, exercise programmes, staff access controls and billing tools (the "**Service**").'
        ),
        p(
          '**B.** The Clinic operates a physiotherapy or rehabilitation practice in Nigeria, staffed by physiotherapists registered with the Medical Rehabilitation Therapists (Registration) Board of Nigeria, and wishes to subscribe to the Service for use by its staff in managing its own patients.'
        ),
        p(
          '**C.** The Parties intend that this Agreement shall set the master terms on which the Clinic subscribes to the Service, with the plan, fees and other commercial details set out in one or more Order Forms.'
        ),
        p(
          '**D.** The Parties further intend that the Clinic shall remain the data controller of its patients\' personal data, that Rehabify shall process such data only as the Clinic\'s data processor, and that any arrangement under which Rehabify refers patients to the Clinic shall be the subject of a separate written agreement.'
        ),
        p('**NOW, THIS AGREEMENT WITNESSES AS FOLLOWS:**'),
      ],
    },
    {
      title: '1. Interpretation',
      blocks: [
        p('**1.1 Definitions.** In this Agreement, unless the context otherwise requires:'),
        ol(
          '"**Active Patient Programme**" means a patient record in the Service to which an exercise or home programme is assigned and which has been created, updated or accessed by the patient within the preceding 30 days.',
          '"**Applicable Law**" means all laws and regulations in force in Nigeria from time to time, including the Medical Rehabilitation Therapists (Registration, etc.) Act, the National Health Act 2014, the Nigeria Data Protection Act 2023 ("**NDPA**") and the General Application and Implementation Directive 2025 ("**GAID**"), the Federal Competition and Consumer Protection Act 2018, the Cybercrimes (Prohibition, Prevention, etc.) Act 2015 (as amended), the Nigeria Tax Act 2025 and the Nigeria Tax Administration Act 2025, and any applicable State health facility laws.',
          '"**Authorised User**" means an employee or contractor of the Clinic whom the Clinic authorises to use the Service, each with an individual login.',
          '"**Clinic Data**" means all data, including Personal Data of the Clinic\'s patients and staff, that the Clinic, its Authorised Users or its patients enter into or generate through the Service.',
          '"**Clinic Patient**" means an individual who receives care from the Clinic and whose record is held in the Service.',
          '"**Clinician Seat**" means one licence for a named physiotherapist Authorised User, as set out in the Clinic\'s plan.',
          '"**Documentation**" means Rehabify\'s user guides and help materials for the Service, as updated from time to time.',
          '"**Fees**" means the subscription fees, overage fees and any other fees set out in an Order Form.',
          '"**Order Form**" means an order for the Service, substantially in the form in Schedule 2, signed (including electronically) by both Parties and referring to this Agreement.',
          '"**Patient Programme Allowance**" means the number of Active Patient Programmes included in the Clinic\'s plan.',
          '"**Personal Data**" and "**Sensitive Personal Data**" have the meanings given in the NDPA.',
          '"**Subscription Term**" means the period stated in the Order Form, including renewals.',
          '"**Business Day**" means any day other than a Saturday, Sunday or public holiday in Nigeria.'
        ),
        p(
          '**1.2 Interpretation.** Headings do not affect interpretation; "including" means "including without limitation"; references to a law include it as amended or re-enacted; and the Schedules form part of this Agreement.'
        ),
      ],
    },
    {
      title: '2. Structure of this Agreement',
      blocks: [
        p(
          '**2.1 Order Forms.** Each Order Form incorporates this Agreement and forms a separate contract for the Service it describes. The Clinic may sign more than one Order Form (for example, for additional branches).'
        ),
        p(
          '**2.2 Order of precedence.** If there is a conflict, the following order applies: (a) Schedule 4 (Data Processing Terms) on any data protection matter; (b) a provision of an Order Form that expressly states it overrides this Agreement; (c) the clauses of this Agreement; (d) the other Schedules; (e) the Documentation.'
        ),
      ],
    },
    {
      title: '3. Subscription',
      blocks: [
        p(
          '**3.1 Grant.** Subject to payment of the Fees, Rehabify grants the Clinic a non-exclusive, non-transferable right during the Subscription Term for its Authorised Users to use the Service, in accordance with this Agreement and the Documentation, solely for the internal operation of the Clinic\'s practice and the care of Clinic Patients.'
        ),
        p(
          '**3.2 Plans.** The Clinic\'s plan, number of Clinician Seats, Patient Programme Allowance and Fees are set out in the Order Form, by reference to the plans in Schedule 1. Administrative and reception users are included without limit unless the Order Form states otherwise.'
        ),
        p(
          '**3.3 Seats.** Each Clinician Seat may be used by one named physiotherapist at a time. The Clinic may reassign a seat when a physiotherapist leaves, but may not share logins. Additional seats may be added at any time through the Service or a new Order Form, and are charged pro rata for the current billing month.'
        ),
        p(
          '**3.4 Patient Programme Allowance and overage.** If the number of Active Patient Programmes in any calendar month exceeds the Patient Programme Allowance, Rehabify may charge the overage fee in plans and pricing for each Active Patient Programme above the allowance in that month. Rehabify shall notify the Clinic when usage reaches 80% and 100% of the allowance, and the Clinic may upgrade its plan at any time. Overage is invoiced monthly in arrears.'
        ),
        p(
          '**3.5 Patient access.** Clinic Patients may access their programmes through the patient-facing features of the Service at no charge to them, as part of the Clinic\'s subscription.'
        ),
      ],
    },
    {
      title: '4. Included and excluded services',
      blocks: [
        p(
          '**4.1 Included.** The Service includes the features listed for the Clinic\'s plan in plans and pricing, including interactive home programmes and progress tracking for Clinic Patients within the Patient Programme Allowance.'
        ),
        p(
          '**4.2 Joy and Flex Max are excluded.** The Service does not include Joy, Rehabify\'s AI-enabled WhatsApp assistant, or the Flex Max service, and neither is available to the Clinic or Clinic Patients under this Agreement unless the Parties sign a separate written addendum.'
        ),
        p(
          '**4.3 No duplicate charges.** Rehabify shall not charge any Clinic Patient for Flex or any other functionality that is included in the Clinic\'s subscription.'
        ),
        p(
          '**4.4 No Rehabify Care referrals.** The subscription does not include, and Rehabify does not promise, any referral of patients to the Clinic. Clause 16 applies to any such arrangement.'
        ),
      ],
    },
    {
      title: '5. Clinic responsibilities',
      blocks: [
        p(
          '**5.1 Licensed professionals.** The Clinic shall ensure that every physiotherapist Authorised User is registered with the MRTB and holds a current annual practising licence, and that the Clinic holds all registrations and permits required to operate its practice, including any registration required by the relevant State Ministry of Health or health facility regulator.'
        ),
        p(
          '**5.2 Clinical responsibility.** The Clinic and its clinicians are solely responsible for the clinical care of Clinic Patients, including consent, assessment, treatment, records and professional conduct. The Service is a tool and does not provide clinical advice.'
        ),
        p(
          '**5.3 Users and access.** The Clinic is responsible for: deciding who is an Authorised User and what access each has; removing access promptly when a person leaves or no longer needs it; ensuring Authorised Users comply with this Agreement and use multi-factor authentication; and all activity under its Authorised Users\' accounts.'
        ),
        p(
          '**5.4 Acceptable use.** The Clinic shall not, and shall ensure that its Authorised Users do not: use the Service unlawfully or to store data the Clinic has no right to process; upload malware; attempt to gain unauthorised access to the Service or other customers\' data; reverse-engineer the Service; resell or sublicense it; or use it to build a competing product.'
        ),
        p(
          '**5.5 Patient terms and prices.** The Clinic sets its own prices and patient terms, including cancellation and refund terms, and is responsible to Clinic Patients for them.'
        ),
      ],
    },
    {
      title: '6. Payment facilitation',
      blocks: [
        p(
          '**6.1 Billing tools.** The Service enables the Clinic to issue invoices and payment links to Clinic Patients. Payments are processed by Paystack Payments Limited (or another licensed payment service provider notified by Rehabify) and are settled to the Clinic\'s own registered bank account or Paystack subaccount.'
        ),
        p(
          '**6.2 Clinic is the merchant.** The Clinic is the seller and merchant for all payments made by Clinic Patients through the Service. The Clinic shall accept the payment provider\'s terms. Rehabify does not hold, pool or receive the Clinic\'s patient payments and is not a party to the Clinic\'s transactions with Clinic Patients.'
        ),
        p(
          '**6.3 Transaction charges.** The payment provider\'s processing charges apply to the Clinic\'s transactions as set out in the Order Form. Rehabify charges no transaction fee on the Clinic\'s patient payments unless the Order Form expressly states one.'
        ),
        p('**6.4 Refunds and chargebacks.** The Clinic is responsible for refunds, chargebacks and disputes relating to its patient payments.'),
      ],
    },
    {
      title: '7. Fees and payment',
      blocks: [
        p(
          '**7.1 Fees.** The Clinic shall pay the Fees set out in the Order Form. Subscription Fees are payable monthly in advance (or annually in advance where the Order Form says so); overage fees are payable monthly in arrears.'
        ),
        p(
          '**7.2 Invoicing and payment.** Rehabify shall issue an invoice at the start of each billing period. The Clinic shall pay each invoice within 7 days of its date by card, direct debit (where authorised) or bank transfer to the account shown on the invoice, quoting the invoice number.'
        ),
        p(
          '**7.3 Taxes.** Fees are exclusive of value added tax, which Rehabify shall charge where it is required to do so under the Nigeria Tax Act 2025 and show on its invoices. Where the Clinic is required by law to deduct withholding tax from a payment, it may do so, but shall remit it within the statutory period and give Rehabify the withholding tax receipt or credit note within 30 days; if it does not, the Clinic shall pay the amount deducted to Rehabify.'
        ),
        p(
          '**7.4 Late payment.** If an undisputed invoice is unpaid when due, Rehabify shall send a reminder. If it remains unpaid 14 days after the reminder, Rehabify may, on a further 7 days\' written notice, restrict the Service to read-only access (so the Clinic can still view and export Clinic Data and continue patient care) until payment is received. Rehabify shall not delete Clinic Data or block access to records because of late payment during the Subscription Term.'
        ),
        p(
          '**7.5 Disputed invoices.** The Clinic shall notify Rehabify of any disputed amount, with reasons, before the due date, and pay the undisputed part. The Parties shall resolve the dispute in good faith within 14 days.'
        ),
        p(
          '**7.6 Price changes.** Rehabify may change its Fees with effect from the start of a renewal period by giving the Clinic at least 60 days\' written notice. Fees are fixed for any prepaid annual term.'
        ),
        p(
          '**7.7 No refunds for partial months.** Monthly Fees are non-refundable for a month already started, except where this Agreement is terminated because of Rehabify\'s breach, or Rehabify terminates for convenience, in which case Rehabify shall refund prepaid Fees for the unused period.'
        ),
      ],
    },
    {
      title: '8. Implementation and support',
      blocks: [
        p(
          '**8.1 Onboarding.** Rehabify shall provide the onboarding set out in the Order Form, which by default includes account set-up, configuration of locations, users and templates, and one remote training session of up to 2 hours for the Clinic\'s staff.'
        ),
        p(
          '**8.2 Data migration.** Where the Order Form includes migration of existing records, Rehabify shall import data supplied by the Clinic in the agreed format. The Clinic is responsible for the accuracy and lawfulness of the data supplied and for checking the imported records.'
        ),
        p('**8.3 Support and service levels.** Rehabify shall provide support and meet the service levels in Schedule 3.'),
        p(
          '**8.4 Updates.** Rehabify may update the Service from time to time. It shall not materially reduce the functionality of the Clinic\'s plan during a Subscription Term, and shall give at least 30 days\' notice of any change that materially affects how the Clinic uses the Service.'
        ),
      ],
    },
    {
      title: '9. Data protection',
      blocks: [
        p(
          '**9.1 Roles.** The Clinic is the data controller of Clinic Data. Rehabify processes Clinic Data as the Clinic\'s data processor under section 29 of the NDPA, on the terms of Schedule 4 (Data Processing Terms), which form part of this Agreement. Rehabify is an independent controller only of the business contact details of the Clinic\'s representatives and Authorised Users, which it processes to manage this Agreement in line with its Privacy Policy.'
        ),
        p(
          '**9.2 Clinic\'s obligations.** The Clinic shall: (a) ensure it has a lawful basis, and where required the explicit consent of Clinic Patients, for processing health data and for its processing by Rehabify; (b) give Clinic Patients a privacy notice that explains its use of Rehabify as a software provider; (c) comply with its own obligations under the NDPA and GAID, including any registration with the Nigeria Data Protection Commission, data protection impact assessments and the appointment of a Data Protection Officer where required; and (d) give Rehabify only lawful instructions.'
        ),
        p(
          '**9.3 No use for Rehabify\'s own purposes.** Rehabify shall not use Clinic Data for its own purposes, including to market Rehabify Care or Digital Recovery Services to Clinic Patients, to solicit Clinic Patients or staff, or to train AI models offered to third parties. Rehabify may create de-identified and aggregated statistics about use of the Service, from which no Clinic, patient or individual can be identified, to operate, secure and improve the Service.'
        ),
        p(
          '**9.4 Security.** Rehabify shall maintain the technical and organisational measures in Schedule 4 and shall not materially reduce them during the Subscription Term.'
        ),
        p(
          '**9.5 Personal data breaches.** Rehabify shall notify the Clinic without undue delay, and in any event within 48 hours, of becoming aware of a personal data breach affecting Clinic Data, with the information the Clinic reasonably needs to notify the Commission within 72 hours and to inform affected individuals.'
        ),
      ],
    },
    {
      title: '10. Confidentiality',
      blocks: [
        p(
          '**10.1** Each Party shall keep the other Party\'s confidential information (including, for the Clinic, all Clinic Data, and for Rehabify, its non-public pricing, product plans and security information) confidential, use it only to perform this Agreement, and disclose it only to its personnel, sub-processors and professional advisers who need to know it and are bound by equivalent obligations, or where required by law, a court or a regulator.'
        ),
        p(
          '**10.2** This clause does not apply to information that is or becomes public through no breach of this Agreement, or that the receiving Party already lawfully held or independently developed. It survives termination indefinitely for Clinic Data and for 3 years for other confidential information.'
        ),
      ],
    },
    {
      title: '11. Intellectual property and Clinic Data',
      blocks: [
        p(
          '**11.1 Rehabify\'s IP.** Rehabify and its licensors own all intellectual property rights in the Service, the Documentation, Rehabify\'s exercise library and templates, and any improvements to them. The Clinic receives only the rights expressly granted in clause 3.1.'
        ),
        p(
          '**11.2 Clinic Data.** As between the Parties, the Clinic owns Clinic Data. The Clinic grants Rehabify a licence to host, process and transmit Clinic Data solely to provide the Service and as permitted by clause 9.'
        ),
        p(
          '**11.3 Clinic content.** Custom exercises, templates and materials the Clinic creates remain the Clinic\'s property and are not made available to other customers without the Clinic\'s written consent.'
        ),
        p('**11.4 Feedback.** Rehabify may use any suggestions or feedback the Clinic gives about the Service without restriction or payment.'),
        p(
          '**11.5 Third-party claims.** Rehabify shall defend the Clinic against any claim that the Clinic\'s authorised use of the Service infringes a third party\'s intellectual property rights in Nigeria, and indemnify the Clinic against resulting damages and costs, provided the Clinic notifies Rehabify promptly and allows it to control the defence. If such a claim is made, Rehabify may modify the Service to avoid the infringement, obtain a licence, or terminate the affected Service and refund prepaid Fees for the unused period.'
        ),
      ],
    },
    {
      title: '12. Warranties',
      blocks: [
        p(
          '**12.1 Mutual.** Each Party warrants that it is duly organised and in good standing under Nigerian law, has full power and authority to enter into this Agreement, and that this Agreement is binding on it.'
        ),
        p(
          '**12.2 Rehabify.** Rehabify warrants that the Service will perform materially in accordance with the Documentation and that it will provide the Service with reasonable skill and care. If the Service does not do so, Rehabify shall, at its option and as the Clinic\'s primary remedy, correct the non-conformity within a reasonable time or, if it cannot, allow the Clinic to terminate the affected Order Form and refund prepaid Fees for the unused period.'
        ),
        p(
          '**12.3 Clinic.** The Clinic warrants that it holds all registrations and permits needed to operate its practice, that its physiotherapists are licensed by the MRTB, and that it has the right to provide Clinic Data to Rehabify for processing under this Agreement.'
        ),
        p(
          '**12.4 Disclaimer.** Except as expressly stated in this Agreement, the Service is provided without any other warranty, express or implied. The Service supports, and does not replace, the professional judgement of the Clinic\'s clinicians.'
        ),
      ],
    },
    {
      title: '13. Limitation of liability',
      blocks: [
        p(
          '**13.1 Unlimited liability.** Nothing in this Agreement limits either Party\'s liability for fraud, wilful misconduct, death or personal injury caused by negligence, the Clinic\'s obligation to pay Fees, or any liability that cannot be limited by law.'
        ),
        p(
          '**13.2 Excluded loss.** Subject to clause 13.1, neither Party is liable for loss of profit, revenue, goodwill or business opportunity, or for any indirect or consequential loss.'
        ),
        p(
          '**13.3 General cap.** Subject to clauses 13.1 and 13.4, each Party\'s total liability arising out of or in connection with this Agreement in any 12-month period is limited to the total Fees paid and payable by the Clinic in the 12 months before the event giving rise to the claim.'
        ),
        p(
          '**13.4 Data protection cap.** Subject to clause 13.1, each Party\'s total liability for breach of clause 9, clause 10 or Schedule 4 is limited to the greater of 3 times the Fees paid and payable in the preceding 12 months.'
        ),
      ],
    },
    {
      title: '14. Indemnities',
      blocks: [
        p(
          '**14.1 By Rehabify.** Rehabify shall indemnify the Clinic against losses, fines and reasonable costs arising from (a) a claim under clause 11.5, or (b) a personal data breach caused by Rehabify\'s breach of Schedule 4, subject to clause 13.4.'
        ),
        p(
          '**14.2 By the Clinic.** The Clinic shall indemnify Rehabify against losses, fines and reasonable costs arising from (a) the Clinic\'s clinical services or its clinicians\' professional conduct; (b) Clinic Data that the Clinic had no right to provide; or (c) the Clinic\'s breach of clause 5.4 or Applicable Law.'
        ),
        p(
          '**14.3 Procedure.** The indemnified Party shall notify the other promptly, allow it to control the defence and settlement (save that no settlement may admit fault on the indemnified Party\'s behalf without consent), and give reasonable assistance at the indemnifying Party\'s cost.'
        ),
      ],
    },
    {
      title: '15. Term and termination',
      blocks: [
        p(
          '**15.1 Term.** This Agreement starts on the date of signature and continues while any Order Form is in force. Each Order Form runs for its initial Subscription Term (one month unless stated otherwise) and then renews automatically for successive periods of the same length, unless either Party gives notice of non-renewal at least 30 days before the end of the current period.'
        ),
        p(
          '**15.2 Termination for convenience.** On a monthly Order Form, the Clinic may terminate at any time on 30 days\' written notice. Rehabify may terminate any Order Form for convenience on 90 days\' written notice, refunding prepaid Fees for any unused period.'
        ),
        p(
          '**15.3 Termination for cause.** Either Party may terminate this Agreement or any Order Form by written notice if the other Party (a) commits a material breach that is not remedied within 30 days of written notice; (b) becomes insolvent, enters liquidation (other than for a solvent reorganisation), or has a receiver or administrator appointed; or (c) in the case of the Clinic, ceases to hold the registrations required to operate its practice.'
        ),
        p(
          '**15.4 Data on termination.** For 60 days after termination or expiry (the "**Exit Period**"), Rehabify shall provide read-only access to the Service so the Clinic can export all Clinic Data in a structured, commonly used, machine-readable format, together with PDF copies of clinical records, at no extra charge. At the Clinic\'s request and cost, Rehabify shall provide reasonable additional migration assistance. After the Exit Period, Rehabify shall delete Clinic Data within 30 days, except where retention is required by law, and certify deletion on request.'
        ),
        p(
          '**15.5 Continuity of patient care.** Neither Party shall act in a way that would leave Clinic Patients without access to their records. If the Clinic ceases to operate, Rehabify shall cooperate with the Clinic, its successor or a registered physiotherapist nominated to continue care, in line with Applicable Law and Schedule 4.'
        ),
        p('**15.6 Survival.** Clauses 7 (as to sums due), 9, 10, 11, 13, 14, 15.4, 15.5, 18 and 19 survive termination.'),
      ],
    },
    {
      title: '16. Separate clinical services arrangements',
      blocks: [
        p(
          '**16.1** This Agreement concerns software only. The Clinic paying for the Service does not make it a clinical delivery partner of Rehabify, and Rehabify does not refer patients to the Clinic under this Agreement.'
        ),
        p(
          '**16.2** If the Parties wish Rehabify to refer Rehabify Care patients to the Clinic, or the Clinic to deliver clinical services on Rehabify\'s behalf, they shall sign a separate Clinical Services Addendum setting out, at a minimum: the services and patient prices; which Party collects payment from patients; the basis and percentage of any revenue allocation and what it is calculated on; who pays the treating clinician; responsibility for refunds, travel and complaints; clinical governance and professional responsibility; and data protection roles. No revenue-sharing percentage applies unless set out in such an addendum.'
        ),
        p(
          '**16.3** Fees under this Agreement and any amounts under a Clinical Services Addendum shall be invoiced and accounted for separately, and neither shall be set off against the other unless the Parties agree in writing.'
        ),
      ],
    },
    {
      title: '17. Non-solicitation',
      blocks: [
        p(
          'During the Subscription Term and for 12 months after it, Rehabify shall not use Clinic Data or information obtained through the Service to solicit any Clinic Patient or to recruit any of the Clinic\'s clinicians. This clause does not prevent any person from responding to Rehabify\'s general advertising or independently choosing to use Rehabify\'s services.'
        ),
      ],
    },
    {
      title: '18. Dispute resolution',
      blocks: [
        p(
          '**18.1 Negotiation.** Any dispute arising out of or in connection with this Agreement shall first be referred, by written notice, to a meeting of senior representatives of both Parties within 15 days of the notice.'
        ),
        p(
          '**18.2 Mediation.** If the dispute is not resolved within 15 days of that meeting, either Party may refer it to mediation under the Arbitration and Mediation Act 2023 at the Lagos Multi-Door Courthouse or before a mediator agreed by the Parties.'
        ),
        p(
          '**18.3 Arbitration.** If the dispute is not resolved within 30 days of the referral to mediation, or a Party declines to mediate, it shall be finally resolved by arbitration under the Arbitration and Mediation Act 2023 before a sole arbitrator appointed by agreement or, failing agreement within 15 days, by the Chairman of the Chartered Institute of Arbitrators (UK), Nigeria Branch. The seat shall be Lagos, Nigeria, and the language English.'
        ),
        p(
          '**18.4** Nothing in this clause prevents a Party from seeking urgent interim relief from a court of competent jurisdiction. The Parties shall continue to perform undisputed obligations while a dispute is resolved. Unless the arbitrator decides otherwise, each Party bears its own costs and the Parties share the fees of the mediator or arbitrator equally.'
        ),
      ],
    },
    {
      title: '19. General',
      blocks: [
        p(
          '**19.1 Force majeure.** Neither Party is liable for delay or failure caused by events beyond its reasonable control, including natural disasters, epidemics, civil unrest, strikes, failure of public power, internet or telecommunications networks, or government action, provided it notifies the other Party within 3 Business Days and uses reasonable efforts to mitigate the effect. This does not excuse payment of sums due, or compliance with clauses 9 and 10 where performance remains possible. If an event continues for more than 60 days, either Party may terminate the affected Order Form on 15 days\' notice.'
        ),
        p(
          '**19.2 Notices.** Notices shall be in writing and sent by email to the addresses in the Order Form for Rehabify, hello@myrehabifyhealth.com. A notice is deemed received when sent if sent before 5:00 p.m. on a Business Day, and otherwise at 9:00 a.m. on the next Business Day, unless the sender receives a delivery failure message.'
        ),
        p(
          '**19.3 Amendments.** No amendment to this Agreement or an Order Form is effective unless in writing and signed by authorised representatives of both Parties. An update issued unilaterally through the Service, by email or by account notification is not binding on the Clinic unless this Agreement expressly permits it or the Clinic accepts it in writing.'
        ),
        p(
          '**19.4 Assignment and subcontracting.** Neither Party may assign this Agreement without the other\'s written consent, not to be unreasonably withheld, except that either Party may assign it to a successor to all or substantially all of its business on written notice. Rehabify may subcontract in accordance with Schedule 4 and remains responsible for its subcontractors.'
        ),
        p(
          '**19.5 Independent parties.** The Parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture, agency or employment relationship.'
        ),
        p(
          '**19.6 Publicity.** Neither Party shall use the other\'s name or logo in marketing without prior written consent, except that Rehabify may list the Clinic\'s name as a customer if the Clinic does not object in writing.'
        ),
        p(
          '**19.7 Anti-bribery.** Each Party shall comply with applicable anti-corruption laws, including the Corrupt Practices and Other Related Offences Act 2000.'
        ),
        p(
          '**19.8 Waiver and severability.** A failure or delay in exercising a right is not a waiver of it. If any provision is held invalid or unenforceable, it shall be modified to the minimum extent necessary, and the rest of this Agreement remains in force.'
        ),
        p(
          '**19.9 Entire agreement.** This Agreement, its Schedules and all Order Forms constitute the entire agreement between the Parties on their subject matter and supersede all prior communications. No representation not set out in this Agreement is binding.'
        ),
        p(
          '**19.10 Counterparts and electronic signature.** This Agreement and any Order Form may be executed in counterparts and by electronic signature, each of which is an original, and electronic records of them are admissible under the Evidence Act 2011.'
        ),
        p('**19.11 Governing law.** This Agreement is governed by the laws of the Federal Republic of Nigeria.'),
      ],
    },
    {
      title: 'Schedule 1 – Plans and pricing',
      blocks: [
        table(
          ['Plan', 'Clinician Seats', 'Patient Programme Allowance', 'Monthly Fee (excl. VAT)'],
          [
            ['Clinic Starter', 'Up to 3', '30 Active Patient Programmes', '₦25,000'],
            ['Clinic Growth', 'Up to 10', '100 Active Patient Programmes', '₦60,000'],
            ['Enterprise', 'As agreed', 'As agreed', 'Custom, per Order Form'],
          ]
        ),
        p('Overage: ₦500 per additional Active Patient Programme above the allowance, per month, excluding applicable VAT'),
        p(
          '**Included in all plans:** electronic clinical records with assessment and SOAP templates; scheduling for in-clinic and virtual sessions; staff and role-based access; exercise library and custom exercises; interactive home programmes and progress tracking for Clinic Patients; invoicing and payment links; reporting dashboards; data export; email support.'
        ),
        p('**Not included:** Joy (AI WhatsApp assistant); Flex Max; Rehabify Care patient referrals.'),
      ],
    },
    {
      title: 'Schedule 4 – Data processing terms',
      blocks: [
        p('**1. Processing details.**'),
        table(
          ['Item', 'Detail'],
          [
            ['Subject matter and duration', 'Provision of the Service for the Subscription Term and the Exit Period'],
            [
              'Nature and purpose',
              'Hosting, storage, organisation, display, transmission, backup and support access to Clinic Data, solely to provide the Service',
            ],
            ['Data subjects', 'Clinic Patients (including children), their parents, guardians or representatives, and the Clinic\'s staff'],
            [
              'Data categories',
              'Identity and contact data; health data (sensitive personal data) including assessments, diagnoses within physiotherapy scope, treatment plans, progress and media; appointment and billing data; staff account and audit-log data',
            ],
          ]
        ),
        p(
          '**2. Instructions.** Rehabify shall process Clinic Data only on the Clinic\'s documented instructions (this Agreement and the Clinic\'s configuration and use of the Service are its instructions), unless required by law, in which case it shall inform the Clinic first where lawful.'
        ),
        p(
          '**3. Personnel.** Rehabify shall ensure that personnel with access to Clinic Data are bound by confidentiality, trained in data protection, and given access only as needed for support, maintenance or security, with access logged.'
        ),
        p(
          '**4. Security measures.** Rehabify shall maintain at least: encryption in transit (TLS 1.2 or higher) and at rest; role-based access controls configurable by the Clinic; multi-factor authentication for Rehabify staff and available to all Authorised Users; audit logs of access to clinical records; secure software development and regular vulnerability testing; daily backups; and an incident response plan.'
        ),
        p(
          '**5. Sub-processors.** The Clinic authorises sub-processors. Rehabify shall impose equivalent data protection obligations on each sub-processor, remain liable for them, and give at least 30 days\' notice of any new sub-processor. If the Clinic objects on reasonable data protection grounds and the Parties cannot resolve the objection, the Clinic may terminate the affected Order Form and receive a refund of prepaid Fees for the unused period.'
        ),
        p(
          '**6. Transfers outside Nigeria.** Rehabify shall not transfer Clinic Data outside Nigeria except in compliance with sections 41 to 43 of the NDPA and the GAID (on the basis of an adequacy decision, an approved transfer instrument, or another lawful basis that the Clinic has confirmed in writing), and shall tell the Clinic where Clinic Data is hosted.'
        ),
        p(
          '**7. Assistance.** Rehabify shall provide reasonable assistance to the Clinic, through the Service\'s functionality where possible, to respond to data subject requests within the statutory period, carry out data protection impact assessments and consult the Nigeria Data Protection Commission where required.'
        ),
        p(
          '**8. Breach notification.** Rehabify shall notify the Clinic of a personal data breach as set out in clause 9.5, including the nature of the breach, categories and approximate numbers of data subjects and records affected, likely consequences and measures taken or proposed, and shall keep the Clinic updated.'
        ),
        p('**9. Return and deletion.** On termination, Rehabify shall make Clinic Data available for export and then delete it as set out in clause 15.4.'),
        p(
          '**10. Audit.** Rehabify shall make available the information reasonably necessary to demonstrate compliance with this Schedule, and allow one audit per year by the Clinic or an independent auditor bound by confidentiality, on 30 days\' notice, during business hours and at the Clinic\'s cost, or provide a recent independent security assessment report instead. Audits shall not extend to other customers\' data.'
        ),
      ],
    },
  ],
};
