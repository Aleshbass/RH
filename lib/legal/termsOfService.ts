import { ol, p, type LegalDocument } from './types';

/** Rehabify Terms of Service, effective 26 October 2026 (owner-approved wording). */
export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Terms of Service',
  effectiveDate: '26 October 2026',
  version: '2026-10-26',
  intro: [p('These Terms govern every use of Rehabify by patients, caregivers, physiotherapists, clinics and partners. Please read them carefully.')],
  sections: [
    {
      title: '1. About these Terms',
      blocks: [
        p(
          '**1.1 Who we are.** Rehabify is operated by **Rehabify Limited**, a private company limited by shares incorporated in the Federal Republic of Nigeria under the Companies and Allied Matters Act 2020 with registration number **RC 6989173** ("**Rehabify**", "**we**", "**us**" or "**our**"). We trade as "Rehabify", "Rehabify Health" and "Physio Around Me".'
        ),
        p(
          '**1.2 What these Terms cover.** These Terms of Service ("**Terms**") form a legally binding agreement between you and Rehabify. They apply to your use of our website at physioaroundme.com and its sub-domains, our web and mobile applications, our WhatsApp channels (including Joy), our application programming interfaces and every other service we provide (together, the "**Platform**").'
        ),
        p(
          '**1.3 Policies that form part of these Terms.** The following policies are incorporated into these Terms and apply to you to the extent relevant to how you use the Platform:'
        ),
        ol(
          'the **Privacy Policy**, which explains how we process personal data;',
          'the **Payment Policy**, which governs prices, payments, cancellations and refunds;',
          'the **Consultation and Booking Policy**, which governs how appointments are requested, matched, confirmed and delivered;',
          'the **Payout Policy**, which governs payments to Network Physiotherapists; and',
          'any additional terms we show you before you use a specific feature.'
        ),
        p(
          '**1.4 Professional and organisational users.** If you are a physiotherapist or a clinic, a separate written agreement also applies to you: the **Network Physiotherapist Independent Contractor Agreement**, the **Independent Physiotherapist Platform Agreement** or the **Clinic Master SaaS Agreement**, as the case may be. If that agreement conflicts with these Terms, that agreement prevails for the matters it covers.'
        ),
        p(
          '**1.5 Order of precedence.** Subject to clause 1.4, if there is a conflict between these Terms and a policy listed in clause 1.3, the more specific document prevails on its subject matter. Nothing in any document limits a right you have under the Nigeria Data Protection Act 2023, the Federal Competition and Consumer Protection Act 2018 or any other law that cannot be excluded by contract.'
        ),
        p(
          '**1.6 Accepting these Terms.** You accept these Terms when you tick the acceptance box, create an account, request a booking, make a payment, send a message to Joy asking for care, or otherwise use the Platform after these Terms have been made available to you. If you do not agree, do not use the Platform. You agree that your electronic acceptance is a valid signature and that these Terms are enforceable as an electronic record.'
        ),
        p(
          '**1.7 Acting for someone else.** If you use the Platform on behalf of another person (for example, as a parent, guardian or caregiver) or on behalf of an organisation, you confirm that you have the legal authority to do so, and these Terms bind both you and the person or organisation you represent.'
        ),
      ],
    },
    {
      title: '2. Definitions',
      blocks: [
        p('In these Terms, unless the context requires otherwise:'),
        ol(
          '"**Applicable Law**" means all laws and regulations in force in Nigeria from time to time, including the Medical Rehabilitation Therapists (Registration, etc.) Act, Cap. M9, Laws of the Federation of Nigeria 2004, the National Health Act 2014, the Nigeria Data Protection Act 2023 ("**NDPA**") and the General Application and Implementation Directive 2025 ("**GAID**") issued under it, the Federal Competition and Consumer Protection Act 2018 ("**FCCPA**"), the Cybercrimes (Prohibition, Prevention, etc.) Act 2015 (as amended), the Evidence Act 2011, the Nigeria Tax Act 2025 and the Nigeria Tax Administration Act 2025, together with binding codes of professional conduct and regulatory directives.',
          '"**Clinic**" means a physiotherapy or rehabilitation practice that subscribes to Rehabify\'s clinic software under a Clinic Master SaaS Agreement.',
          '"**Clinical Service**" means a physiotherapy consultation, assessment, reassessment or treatment session booked through Rehabify Care.',
          '"**Digital Recovery Services**" means Flex and Flex Max.',
          '"**Flex**" means our interactive home programme service, which includes clinician-approved exercise demonstrations and progress tracking.',
          '"**Flex Max**" means Flex together with the defined Joy-supported WhatsApp recovery experience described on the Platform.',
          '"**Independent Physiotherapist**" means a physiotherapist who uses Rehabify\'s professional workspace to manage patients they acquired independently, under an Independent Physiotherapist Platform Agreement.',
          '"**Joy**" means Rehabify\'s AI-enabled assistant, available through WhatsApp and the Platform, which collects information, answers general questions, supports bookings and, for Flex Max users, supports adherence to a clinician-approved programme.',
          '"**MRTB**" means the Medical Rehabilitation Therapists (Registration) Board of Nigeria.',
          '"**Network Physiotherapist**" means a physiotherapist engaged by Rehabify as an independent contractor to deliver Clinical Services to Rehabify Care patients.',
          '"**Patient**" means an individual who receives, or seeks to receive, care or Digital Recovery Services through the Platform, and includes a person acting for that individual under clause 1.7.',
          '"**Physiotherapist**" means a Network Physiotherapist, an Independent Physiotherapist or a physiotherapist working for a Clinic, each of whom must hold a current MRTB registration and annual practising licence.',
          '"**Rehabify Access**" means our affordability programme for eligible Patients.',
          '"**Rehabify Care**" means the service through which a Patient books and pays Rehabify for Clinical Services delivered by a Network Physiotherapist.',
          '"**User**", "**you**" and "**your**" mean any person who accesses or uses the Platform.'
        ),
        p('Headings are for convenience only. "Including" means "including without limitation". A reference to a law includes that law as amended or re-enacted.'),
      ],
    },
    {
      title: '3. Our services and our role',
      blocks: [
        p('**3.1 What Rehabify provides.** Rehabify provides four related services, each governed by the terms that apply to it:'),
        ol(
          '**Rehabify Care** – we arrange Clinical Services for Patients, match them with an appropriately qualified Network Physiotherapist, collect payment and coordinate the booking;',
          '**Digital Recovery Services** – Flex and Flex Max, which support a Patient between appointments;',
          '**Professional workspace** – tools that allow Independent Physiotherapists to document assessments, create care plans and prescribe home programmes for their own patients; and',
          '**Clinic software** – a subscription system that Clinics use to run their records, scheduling, programmes, staff access and billing.'
        ),
        p(
          "**3.2 Who delivers clinical care.** Every Clinical Service is delivered by a Physiotherapist registered with, and holding a current annual practising licence from, the MRTB. Rehabify verifies each Network Physiotherapist's MRTB registration and practising licence before activation and at each annual renewal, but Rehabify does not itself practise physiotherapy. The treating Physiotherapist is professionally responsible for the assessment, diagnosis within their scope of practice, treatment plan and clinical advice given to you."
        ),
        p(
          "**3.3 Rehabify's responsibilities in Rehabify Care.** When you book Rehabify Care, Rehabify is responsible to you for: (a) verifying the Physiotherapist's identity and licence; (b) taking reasonable care in matching you to a Physiotherapist whose stated competencies fit the information you gave us; (c) handling your booking, payment, cancellation and refund in line with the Payment Policy and the Consultation and Booking Policy; (d) operating the Platform with reasonable skill and care; (e) keeping your personal data secure in line with the Privacy Policy; and (f) receiving and investigating complaints about the service, including complaints about a Physiotherapist."
        ),
        p(
          "**3.4 Clinical independence.** No commercial arrangement, price, package, incentive or target will override a Physiotherapist's professional judgement. Physiotherapists decide what care is clinically appropriate. You will never be required to buy a fixed number of sessions, and a recommended course of treatment is only a recommendation that you are free to accept, decline or seek a second opinion on. Rehabify does not pay any Physiotherapist, doctor or other referrer for recommending more treatment."
        ),
        p(
          '**3.5 Emergencies. The Platform is not an emergency service. Joy, our support team and our Physiotherapists cannot respond to medical emergencies through the Platform.** If you have chest pain, difficulty breathing, signs of stroke (face drooping, arm weakness, slurred speech), sudden severe pain, loss of bladder or bowel control, numbness in the groin or saddle area, a suspected fracture or dislocation, heavy bleeding, a head injury, thoughts of harming yourself or any other urgent symptom, call **112** (the national emergency number) or go to the nearest hospital emergency department immediately. If information you share suggests an urgent problem, we may stop a booking and direct you to emergency or doctor-led care; this is for your safety and is not a refusal of service.'
        ),
        p(
          '**3.6 Limits of physiotherapy and of remote care.** Physiotherapy is not a substitute for medical diagnosis by a doctor where one is needed. A Physiotherapist may advise you to see a doctor or another professional before or during treatment. Virtual sessions cannot include a hands-on examination; your Physiotherapist will tell you if a virtual session is not suitable for your condition and may recommend an in-person assessment.'
        ),
        p(
          '**3.7 No guarantee of outcome.** Recovery depends on many factors, including your condition, your general health and how closely you follow your programme. We do not guarantee any particular clinical result, recovery time or pain reduction.'
        ),
        p(
          '**3.8 Availability.** We aim to match Patients quickly, but appointment availability depends on demand, your location, the service you need and Physiotherapist availability. A suggested Physiotherapist or time slot is not a confirmed appointment until the Consultation and Booking Policy says it is.'
        ),
      ],
    },
    {
      title: '4. Joy and artificial intelligence',
      blocks: [
        p(
          '**4.1 What Joy is.** Joy is an AI-enabled assistant. You are communicating with software, not a human clinician, unless a message clearly says that a named member of our team or your Physiotherapist has joined the conversation.'
        ),
        p(
          '**4.2 What Joy does.** Joy may collect information about your symptoms and preferences to help route you to an appropriate Physiotherapist, answer general questions about our services, help you book and pay, send reminders, and (for Flex Max users) support you in following the programme your Physiotherapist approved.'
        ),
        p(
          "**4.3 What Joy does not do.** Joy does not diagnose conditions, prescribe treatment, change or create an exercise programme, interpret test results, provide emergency support or replace an examination by a qualified Physiotherapist. Any exercise content Joy shares comes from a programme approved by your Physiotherapist. If something Joy says seems inconsistent with your Physiotherapist's advice, follow your Physiotherapist and tell us."
        ),
        p(
          '**4.4 Human review and escalation.** Joy is designed to escalate messages that suggest worsening symptoms, red-flag symptoms or distress to our care team or to your Physiotherapist. Escalation is not instant and does not make Joy an emergency service (see clause 3.5).'
        ),
        p(
          "**4.5 Automated processing.** Joy's suggestions about which Physiotherapist or service may suit you are made with the help of automated processing. A Rehabify team member or Physiotherapist will review any decision that has a significant effect on you, such as a decision that you are not suitable for a service, and you may ask for that review at any time. Our Privacy Policy explains your rights in more detail."
        ),
        p('**4.6 Accuracy.** AI-generated text can be wrong. Do not rely on Joy for clinical decisions. Check anything important with your Physiotherapist.'),
      ],
    },
    {
      title: '5. Eligibility and accounts',
      blocks: [
        p('**5.1 Age.** You must be at least 18 years old to create an account or contract with us in your own name.'),
        p(
          '**5.2 Children and young people.** Care for a person under 18 (a "**Child**") may only be booked by the Child\'s parent or legal guardian, who must create or use their own account, give the consents required by the NDPA and the Privacy Policy, and accept these Terms on the Child\'s behalf. A parent, guardian or another responsible adult nominated by them must be present (in person or on screen) for the whole of every session with a Child, unless the Physiotherapist agrees otherwise in writing for a Child aged 16 or 17 in line with Applicable Law and professional guidance. Rehabify does not knowingly allow a Child to open an account.'
        ),
        p(
          '**5.3 Capacity and representatives.** If a Patient lacks the capacity to make decisions about their care, a person with lawful authority to act for them may use the Platform on their behalf under clause 1.7.'
        ),
        p(
          '**5.4 Accurate information.** You must give accurate, current and complete information, including your health history, current medicines, allergies, recent surgery, pregnancy and any condition that may affect the safety of physiotherapy. You must update it when it changes. Inaccurate or incomplete information can affect your safety and the suitability of the care you receive.'
        ),
        p(
          '**5.5 Account security.** You are responsible for keeping your login details, one-time passcodes and devices secure, and for activity on your account. Tell us immediately at hello@myrehabifyhealth.com if you suspect unauthorised access. We will never ask for your password or card PIN.'
        ),
        p(
          '**5.6 WhatsApp identity.** If you use Joy on WhatsApp, the mobile number linked to your WhatsApp account identifies your Rehabify record. Do not let other people use your WhatsApp account to message Joy about your care, and tell us if your number changes.'
        ),
        p(
          '**5.7 One person, one record.** Each Patient should have one record so that their clinical history is complete. A parent or guardian may manage records for more than one Child from one account.'
        ),
      ],
    },
    {
      title: '6. Acceptable use',
      blocks: [
        p('6.1 You must use the Platform lawfully, honestly and respectfully. You must not:'),
        ol(
          'give false information, impersonate any person, or misrepresent a professional qualification or licence;',
          'use the Platform for any purpose other than seeking, providing or managing legitimate rehabilitation care or related services;',
          'harass, threaten, abuse, discriminate against or behave in a sexual or otherwise inappropriate way towards any Patient, Physiotherapist or member of our team, in sessions, home visits or messages;',
          'record, photograph or stream any session, or share any session link, without the express consent of everyone taking part;',
          "arrange to pay a Network Physiotherapist directly, outside the Platform, for a Clinical Service that was introduced through Rehabify Care (this protects your refund rights and our ability to support you, and is also a breach of the Physiotherapist's agreement with us);",
          "upload malware, attempt to gain unauthorised access to any system or data, probe or test the Platform's security without our written permission, or interfere with its operation;",
          'scrape, harvest, copy or index content or personal data from the Platform by automated means, except through an interface we have expressly authorised;',
          'reverse-engineer, decompile or attempt to derive the source code of the Platform except where Applicable Law expressly permits it;',
          'use the Platform or any content from it to train or improve any artificial intelligence model, or to build a competing product;',
          "post or send content that is unlawful, defamatory, obscene, misleading or that infringes anyone's rights; or",
          'commit or attempt fraud, payment manipulation, chargeback abuse or money laundering.'
        ),
        p(
          "**6.2 Safety at home visits.** For a home visit, you must provide a safe, reasonably private space for the session, secure any animals, and ensure that an adult is present where the Patient is a Child. A Physiotherapist may decline or end a home visit if they reasonably believe their safety, or the Patient's safety, is at risk. Our Consultation and Booking Policy explains how this affects payment."
        ),
        p(
          '**6.3 Respect for Physiotherapists.** Physiotherapists are entitled to refuse or stop care where a Patient behaves abusively or unsafely, where the requested care is outside their competence, or where continuing would be contrary to their professional obligations, provided they act in line with their professional duties to the Patient.'
        ),
      ],
    },
    {
      title: '7. Physiotherapists, Clinics and partners',
      blocks: [
        p(
          '**7.1 Licensing.** Every Physiotherapist using the Platform must hold, and keep current, MRTB registration and an annual practising licence, and must practise only within their competence. A Physiotherapist must tell us immediately if their registration or licence lapses, is suspended, is restricted or becomes the subject of disciplinary proceedings. We may suspend access until we have verified the position.'
        ),
        p(
          "**7.2 Verification.** We check identity, MRTB registration, the current practising licence and other credentials described in the relevant agreement. A verification badge confirms only that those checks were completed on the date shown; it is not a warranty of a Physiotherapist's skill or the outcome of care."
        ),
        p(
          "**7.3 Professional obligations.** Physiotherapists remain bound by the MRTB's Code of Ethics and professional standards, by the duty of confidentiality and by Applicable Law, whether or not those obligations are repeated in our agreements."
        ),
        p(
          "**7.4 Separate relationships.** The terms that apply to a Physiotherapist depend on the Patient and the service, not on the Physiotherapist alone. Care booked through Rehabify Care is governed by the Network Physiotherapist Independent Contractor Agreement; care an Independent Physiotherapist provides to their own patients is governed by the Independent Physiotherapist Platform Agreement; care a Physiotherapist provides to a Clinic's patients on the Clinic's licensed workspace is governed by the Clinic Master SaaS Agreement."
        ),
        p(
          "**7.5 Partners.** Healthcare financing partners, referral partners and integration partners act under their own written agreements with us and their own terms with you. Where you use a partner's service (for example, a medical loan from MediLoan by MyItura), the partner is responsible for that service, and its terms and privacy notice apply to it."
        ),
      ],
    },
    {
      title: '8. Prices, payments and digital access',
      blocks: [
        p(
          '**8.1 Prices.** Our current prices for Clinical Services and Digital Recovery Services are published on the Platform. The total you will pay, including any travel charge for a home visit, is shown before you pay and is the authoritative price for that booking. We do not add booking, platform or card-processing fees at checkout.'
        ),
        p('**8.2 Payment Policy.** Payments, cancellations, refunds, failed payments, chargebacks and receipts are governed by the Payment Policy.'),
        p(
          '**8.3 What Digital Recovery Services include.** Rehabify Care packages that include Flex or Flex Max give you that access for the period stated in the package, normally 30 days from the date your approved programme becomes available. You will not be charged again for access your package already includes.'
        ),
        p(
          "**8.4 Patients of Independent Physiotherapists.** If you are a patient of an Independent Physiotherapist, you may be offered: **Basic** (free – the essential instructions you need to follow your Physiotherapist's recommendations), **Flex** or **Flex Max**, each for a 30-day period at the price shown before you pay. Flex Max includes everything in Flex. These are optional services that you buy from Rehabify, not from your Physiotherapist. Your Physiotherapist's own fees are agreed between you and your Physiotherapist; Rehabify does not take a share of them and is not responsible for collecting or refunding them unless it has clearly told you, at the point of payment, that it is collecting them."
        ),
        p(
          '**8.5 No automatic renewal.** Digital Recovery Services do not renew automatically. Before your access period ends, we will tell you and offer you the choice to renew, change level or stop. We will only charge you for a renewal if you expressly authorise that payment.'
        ),
        p(
          '**8.6 Essential information is never paywalled.** If you do not buy, or do not renew, a Digital Recovery Service, premium features may end, but you will keep access to: (a) the essential instructions your Physiotherapist prescribed; (b) appropriate discharge information; and (c) your rights to access and obtain copies of your health records under the Privacy Policy and Applicable Law. Your Physiotherapist can still provide clinically necessary care whether or not you buy Digital Recovery Services.'
        ),
        p(
          '**8.7 Usage limits.** Digital Recovery Services are subject to the fair-use limits published on the Platform (for example, limits on Joy conversations, video uploads or storage). We set these limits so we can keep the service safe and affordable, and we will not reduce them during a period you have already paid for.'
        ),
        p(
          '**8.8 Rehabify Access.** Eligible Patients may apply for reduced-fee care or funded support under Rehabify Access. Eligibility, the approved fee and any conditions are confirmed in writing before care begins. The quality of care does not depend on the price you pay.'
        ),
        p(
          "**8.9 Healthcare financing.** If you finance care through a partner such as MediLoan by MyItura, the financing is a separate agreement between you and the partner. Rehabify is not a lender, does not decide on your application, does not collect loan repayments and is not liable for the partner's decisions."
        ),
        p(
          '**8.10 Taxes.** Prices for Clinical Services are inclusive of any taxes that apply to them. Prices for Digital Recovery Services and software include value added tax where Rehabify is required to charge it under the Nigeria Tax Act 2025.'
        ),
      ],
    },
    {
      title: '9. Intellectual property',
      blocks: [
        p(
          '**9.1 Our rights.** Rehabify and its licensors own all intellectual property rights in the Platform, including its software, design, text, exercise libraries, demonstration videos, the Joy name and persona, and the Rehabify, Rehabify Health and Physio Around Me names and logos. Except for the licence in clause 9.2, nothing in these Terms transfers any of those rights to you.'
        ),
        p(
          '**9.2 Your licence.** We grant you a personal, limited, non-exclusive, non-transferable, revocable licence to use the Platform, and to view content made available to you, solely for the purpose for which we make it available and in line with these Terms.'
        ),
        p(
          '**9.3 Your content.** You keep ownership of content you upload, such as documents, images, videos and messages ("**Your Content**"). You grant Rehabify a non-exclusive, royalty-free licence to host, store, copy, transmit, display and process Your Content only as needed to provide, secure and support the Platform, to comply with law and as described in the Privacy Policy. This licence ends when Your Content is deleted under our retention rules, except where we must keep it by law.'
        ),
        p(
          '**9.4 Professional content.** Content created by a Physiotherapist or Clinic (for example, a custom exercise or a clinical template) is governed by the intellectual property terms of their agreement with us.'
        ),
        p('**9.5 Feedback.** If you send us suggestions or feedback, we may use them without restriction or payment, but we will not identify you publicly without your consent.'),
      ],
    },
    {
      title: '10. Privacy and confidentiality',
      blocks: [
        p(
          '10.1 We process personal data, including health data, in line with the NDPA, the GAID and our Privacy Policy. Health data is sensitive personal data, and we process it only on a lawful basis permitted for sensitive data, which for most Platform activities is your explicit consent.'
        ),
        p(
          '10.2 Health information about you is confidential. Physiotherapists who treat you are bound by professional duties of confidentiality and by the National Health Act 2014. Rehabify staff who need access to health information to support your care are bound by written confidentiality obligations and role-based access controls.'
        ),
        p('10.3 We never sell your personal data.'),
      ],
    },
    {
      title: '11. Third-party services and links',
      blocks: [
        p(
          "11.1 The Platform relies on third-party services, including Paystack for payment processing, Meta's WhatsApp Business Platform for Joy, a video service for virtual sessions, cloud hosting providers and AI model providers. Your use of some of these services is also subject to the provider's own terms. Our Privacy Policy lists the categories of providers and how we protect data shared with them."
        ),
        p(
          '11.2 Links to third-party websites are provided for convenience. We do not control and are not responsible for third-party websites or services, except to the extent they act on our behalf as our data processors.'
        ),
      ],
    },
    {
      title: '12. Our liability to you',
      blocks: [
        p(
          '**12.1 What we do not exclude.** Nothing in these Terms excludes or limits liability for death or personal injury caused by negligence, for fraud or fraudulent misrepresentation, for wilful misconduct, or for any other liability that cannot lawfully be excluded or limited, including your rights as a consumer under the FCCPA.'
        ),
        p(
          '**12.2 Clinical care.** Each Physiotherapist is responsible for the clinical care they personally provide. Rehabify is responsible for its own obligations under clause 3.3 and for the acts of its own employees. Where a Clinical Service is booked through Rehabify Care, Rehabify will help you pursue any complaint about clinical care, including by providing relevant records and contact details and by cooperating with the MRTB and any insurer.'
        ),
        p(
          '**12.3 Losses we are not responsible for.** To the extent permitted by law, we are not liable for: (a) loss that was not reasonably foreseeable when you accepted these Terms; (b) loss of profit, business, revenue or opportunity, where you use the Platform for business purposes; (c) loss caused by your failure to follow clinical advice, to give accurate information or to seek emergency care; or (d) loss caused by events outside our reasonable control under clause 16.5.'
        ),
        p(
          '**12.4 Cap.** Subject to clause 12.1, our total liability to a Patient arising out of or in connection with these Terms in any 12-month period is limited to the greater of the total amount you paid to Rehabify in the 12 months before the event giving rise to the claim.'
        ),
        p(
          '**12.5 Platform availability.** We work to keep the Platform available and secure, but we do not promise that it will be uninterrupted or error-free. Where an outage causes a confirmed booking to be missed through no fault of yours, you will receive a full refund or a free rebooking under the Payment Policy.'
        ),
      ],
    },
    {
      title: '13. Indemnity by professional and business users',
      blocks: [
        p(
          "If you use the Platform as a Physiotherapist, Clinic or partner, you will indemnify Rehabify against losses, fines and reasonable costs arising from your breach of these Terms or your agreement with us, your breach of Applicable Law, your professional negligence or misconduct, or claims that content you supplied infringes a third party's rights. This clause does not apply to Patients using the Platform as consumers."
        ),
      ],
    },
    {
      title: '14. Suspension and termination',
      blocks: [
        p(
          '**14.1 By you.** You may stop using the Platform and ask us to close your account at any time by contacting hello@myrehabifyhealth.com. Closing an account does not cancel confirmed bookings automatically; please cancel them first under the Payment Policy.'
        ),
        p(
          "**14.2 By us.** We may suspend or restrict your access, with notice where it is safe and lawful to give it, if: (a) you materially breach these Terms; (b) we reasonably suspect fraud, abuse or a threat to the safety of a Patient, Physiotherapist or our team; (c) a Physiotherapist's licence lapses or is suspended; (d) we are required to do so by law, a regulator or a court; or (e) your account has been inactive for more than 24 months (after at least 30 days' notice to you)."
        ),
        p(
          '**14.3 Continuity of care.** If we suspend or close a Patient account, we will refund any amount paid for Clinical Services or Digital Recovery Services not yet provided (unless the suspension results from fraud), and we will continue to honour your rights over your health records.'
        ),
        p('**14.4 Survival.** Clauses that by their nature should continue after termination (including clauses 9, 10, 12, 13, 15 and 16) continue to apply.'),
      ],
    },
    {
      title: '15. Complaints and disputes',
      blocks: [
        p(
          '**15.1 How to complain.** Send complaints to hello@myrehabifyhealth.com with "Complaint" in the subject line, or tell Joy you want to make a complaint. We will acknowledge your complaint within 2 business days and aim to resolve it within 14 business days. Complaints about clinical care are reviewed by a registered physiotherapist on our clinical governance team who was not involved in your care. If we need longer, we will tell you why and when to expect a response.'
        ),
        p(
          '**15.2 Your other rights.** You may at any time complain to the Federal Competition and Consumer Protection Commission (about consumer matters), the Nigeria Data Protection Commission (about personal data), or the MRTB (about the professional conduct of a Physiotherapist). Using our complaints process does not prevent you from doing so.'
        ),
        p(
          '**15.3 Mediation.** If a dispute is not resolved through our complaints process within 30 days, either party may propose mediation under the Arbitration and Mediation Act 2023 at the Lagos Multi-Door Courthouse or another mediation centre we both agree. Mediation is voluntary for Patients.'
        ),
        p(
          '**15.4 Courts for consumers.** If you are a Patient using the Platform as a consumer, you may bring proceedings in any Nigerian court of competent jurisdiction, and nothing in these Terms requires you to arbitrate.'
        ),
        p(
          '**15.5 Arbitration for business users.** Any dispute between Rehabify and a Physiotherapist, Clinic or partner that is not resolved by negotiation or mediation will be resolved by arbitration under the Arbitration and Mediation Act 2023, unless their agreement with us says otherwise. The seat will be Lagos, the language English, and there will be a sole arbitrator appointed by agreement or, failing agreement within 15 days, by the Chairman of the Chartered Institute of Arbitrators (UK), Nigeria Branch. Either party may seek urgent interim relief from a court.'
        ),
        p('**15.6 Governing law.** These Terms and any dispute arising from them are governed by the laws of the Federal Republic of Nigeria.'),
      ],
    },
    {
      title: '16. General',
      blocks: [
        p(
          "**16.1 Changes to these Terms.** We may update these Terms to reflect changes in law, regulatory guidance, our services or how we operate. We will publish the updated Terms with a new version number and effective date and, for material changes, give at least 30 days' notice by email, in-app notice or WhatsApp. Changes do not apply to bookings already confirmed or periods already paid for. If you do not agree, you may stop using the Platform before the change takes effect."
        ),
        p(
          '**16.2 Notices.** We may give you notices by email, in-app message or WhatsApp message to the contact details on your account. You may give us notices at hello@myrehabifyhealth.com or by post to our registered office.'
        ),
        p(
          '**16.3 Electronic records.** You agree that these Terms, booking confirmations, consents and receipts may be created, stored and delivered electronically, and that our system records, kept in the ordinary course of business, may be used as evidence in line with section 84 of the Evidence Act 2011.'
        ),
        p(
          '**16.4 Assignment.** You may not transfer your rights under these Terms. We may transfer our rights and obligations to a successor business, provided your rights are not reduced, and your personal data remains protected as described in the Privacy Policy.'
        ),
        p(
          '**16.5 Events beyond control.** We are not responsible for delay or failure caused by events beyond our reasonable control, such as natural disasters, epidemics, civil unrest, strikes, failures of public utilities or telecommunications networks, or actions of government, provided we take reasonable steps to limit the effect and refund you for services not provided.'
        ),
        p('**16.6 Severability.** If a court finds any provision invalid, the rest of these Terms remain in force, and the invalid provision will be applied to the maximum lawful extent.'),
        p('**16.7 No waiver.** A delay in enforcing a right is not a waiver of it.'),
        p('**16.8 Entire agreement.** These Terms and the documents they incorporate are the whole agreement between you and Rehabify on their subject matter.'),
        p(
          '**16.9 Language.** These Terms are written in English. Where we provide a translation (for example, through Joy in Yoruba, Igbo or Hausa), the English version prevails in case of conflict, but we will interpret any ambiguity in your favour if you are a consumer.'
        ),
        p('**16.10 Contact.** hello@myrehabifyhealth.com · WhatsApp +234 806 152 5811.'),
      ],
    },
  ],
};
