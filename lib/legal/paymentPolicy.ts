import { ol, p, table, type LegalDocument } from './types';

/** Rehabify Payment Policy, effective 26 October 2026 (owner-approved wording). */
export const PAYMENT_POLICY: LegalDocument = {
  title: 'Payment Policy',
  effectiveDate: '26 October 2026',
  version: '2026-10-26',
  intro: [
    p(
      'The price you see before you pay is the price you pay: one all-inclusive price per service, plus a travel charge for home visits shown before checkout. This Policy forms part of our Terms of Service and is issued by Rehabify Limited (RC 6989173). Nothing in it limits your rights under the Federal Competition and Consumer Protection Act 2018 ("**FCCPA**").'
    ),
  ],
  sections: [
    {
      title: '1. Scope and who you pay',
      blocks: [
        p(
          '**1.1 Rehabify Care.** When you book a Clinical Service through Rehabify Care, you pay **Rehabify Limited**. Rehabify holds your payment and pays your Network Physiotherapist after the session is completed. Your contract for the booking is with Rehabify, and Rehabify handles your cancellation and refund under this Policy.'
        ),
        p(
          '**1.2 Digital Recovery Services.** When you access Flex or Flex Max, you pay Rehabify for that service, including when an Independent Physiotherapist recommends it.'
        ),
        p(
          "**1.3 Independent Physiotherapists' own fees.** If you are a patient of an Independent Physiotherapist, the fees for their clinical services are set by them and paid to them under your arrangement with them. Rehabify does not take a share of those fees, and this Policy does not apply to them, unless Rehabify clearly tells you at checkout that it is collecting that payment on the Physiotherapist's behalf, in which case the checkout will show exactly which amount goes to whom."
        ),
        p(
          '**1.4 Clinic patients.** If you are a patient of a Clinic that uses Rehabify software, the Clinic sets its prices, and its own payment and refund terms apply, even if you pay through a Rehabify payment link. Rehabify provides the technology only.'
        ),
      ],
    },
    {
      title: '2. Prices',
      blocks: [
        p(
          '**2.1 Rehabify Care price list.** Current prices are on our Pricing page. They are the same regardless of which Network Physiotherapist you see.'
        ),
        p(
          '**2.2 The initial consultation is optional.** It is an option for people who want an initial clinician-led conversation and guidance. You do not have to book it before a comprehensive assessment.'
        ),
        p(
          '**2.3 Travel charges.** Home visits carry a travel charge set by your city and area (travel zone), reflecting distance and estimated travel time. The travel charge for your address is shown, with your total, before you pay. It is not added afterwards.'
        ),
        p('**2.4 Digital Recovery Services.**'),
        table(
          ['Plan', 'What you get', 'Price per 30 days'],
          [
            ['Basic', "The essential instructions you need to follow your Physiotherapist's recommendations", 'Free'],
            ['Flex', 'Interactive home programme, clinician-approved exercise demonstrations and progress tracking', '₦1,500'],
            ['Flex Max', 'Everything in Flex, plus Joy-supported WhatsApp recovery support', '₦3,500'],
          ]
        ),
        p(
          'Flex Max includes Flex; it is not ₦1,500 plus ₦3,500. Each period runs for 30 days from the date your approved programme becomes available and is activated, not from the date you pay if your programme is not ready yet.'
        ),
        p(
          '**2.5 Included access.** Where your Rehabify Care package includes Flex or Flex Max, the package description says which, and for how long. You will not be charged again for access your package already includes.'
        ),
        p(
          '**2.6 Packages.** We may offer bundles of sessions at a package price. A package is never required. Your Physiotherapist recommends the care you need; you decide whether to buy it as single sessions or as a package. Each package states its sessions, price, inclusions and validity period before you pay.'
        ),
        p(
          "**2.7 No hidden fees.** We do not add booking, platform, card-processing or late-payment fees for Network Patients. Rehabify pays Paystack's processing fee."
        ),
      ],
    },
    {
      title: '3. How payment works',
      blocks: [
        p(
          '**3.1 Payment processor.** Payments are processed by Paystack Payments Limited, a payment service provider licensed by the Central Bank of Nigeria. You can pay by debit or credit card (Visa, Mastercard, Verve), bank transfer, USSD or any other method shown at checkout. Rehabify never sees or stores your full card number, CVV or PIN; Paystack handles them under the PCI DSS security standard.'
        ),
        p(
          '**3.2 Paying in advance.** Clinical Services and Digital Recovery Services are paid in full in advance unless we agree otherwise in writing (for example, under Rehabify Access or a financing arrangement).'
        ),
        p(
          '**3.3 Slot holds.** When you choose a time, we hold it for up to 30 minutes while you pay. If payment is not completed within that time, the hold may expire, and the slot may be offered to someone else.'
        ),
        p(
          '**3.4 When your booking is confirmed.** Payment alone does not confirm an appointment. Your booking is confirmed only when (a) Rehabify has verified your payment and (b) the Physiotherapist has accepted the appointment. The Consultation and Booking Policy explains what happens if the Physiotherapist declines or does not respond within 5 hours (or 1 hour for appointments starting within the next 8 hours), including your right to choose a replacement or receive a full refund.'
        ),
        p(
          '**3.5 Failed payments.** If a payment fails, you will be told and may retry. You may retry up to 3 times within the hold period; after that, the slot may be released. A failed payment is never treated as a booking.'
        ),
        p(
          '**3.6 Duplicate or incorrect charges.** If you are charged twice for the same booking, or charged an amount different from the total shown at checkout, tell us within 30 days. Once verified, we will refund the excess in full within 5 business days of verification.'
        ),
        p(
          '**3.7 Money debited but booking not confirmed.** If your account is debited but the payment is not confirmed to us (for example, because of a bank delay), we will check with Paystack. If the payment reached us, we will confirm your booking or refund you in full; if it did not, your bank will normally reverse the debit, and we will give you the Paystack reference to help you trace it.'
        ),
        p(
          "**3.8 Paying for someone else.** You may pay for another person's care. The person receiving care is the Patient for clinical purposes; refunds are made to the original payment method."
        ),
        p(
          '**3.9 Discounts and promotions.** Any discount, promotional code or sponsored credit is subject to the conditions shown with it, cannot be exchanged for cash and applies only to the booking or period stated.'
        ),
      ],
    },
    {
      title: '4. Cancellations and refunds',
      blocks: [
        p(
          '**4.1 Principle.** If a service is not delivered because of us or the Physiotherapist, you get your money back in full. If you cancel late or miss an appointment, a late-cancellation charge may apply because the Physiotherapist reserved that time for you and may already be travelling to you; the charge is shown here and at checkout so you know it in advance.'
        ),
        p(
          '**4.2 How to cancel or reschedule.** Use your account, tell Joy, or email hello@myrehabifyhealth.com. The time we receive your request is the time that counts.'
        ),
        p('**4.3 When you cancel or miss an appointment.** Times are measured from the start of the confirmed appointment.'),
        table(
          ['What happens', 'Session fee', 'Travel charge (home visits)'],
          [
            ['You cancel 24 hours or more before', 'Full refund, or free reschedule', 'Full refund'],
            [
              'You cancel between 2 and 24 hours before',
              'Free reschedule once within 14 days, or 50% refund',
              'Full refund if the Physiotherapist has not set off; otherwise no refund',
            ],
            [
              'You cancel less than 2 hours before, or do not attend (no-show)',
              'No refund',
              'Full refund if the Physiotherapist has not set off; otherwise no refund',
            ],
            [
              'You are more than 15 minutes late without telling us',
              'Treated as a no-show, unless the Physiotherapist agrees to continue for the remaining time',
              'As above',
            ],
            ['You join late but the session goes ahead', 'The session ends at its scheduled time; no partial refund', 'Not applicable'],
          ]
        ),
        p(
          '**4.4 Exceptions.** We will waive the late-cancellation charge and give you a full refund or credit if you cancel late because of a medical emergency, hospital admission, bereavement or another serious event outside your control, and you tell us within 72 hours and give reasonable evidence if we ask. We will apply this fairly and sympathetically.'
        ),
        p('**4.5 When the Physiotherapist or Rehabify cannot deliver.**'),
        table(
          ['What happens', 'Your options'],
          [
            [
              'The Physiotherapist declines, does not accept within the response time in the Consultation and Booking Policy, or cancels at any time',
              'Choose a replacement Physiotherapist or slot, or a full refund including any travel charge',
            ],
            [
              'The Physiotherapist does not attend, or is more than 15 minutes late for a virtual session or 30 minutes late for a home visit without your agreement',
              'Full refund including travel, or a free rebooking; you may also stay for the full scheduled duration if the Physiotherapist can offer it',
            ],
            ['A platform or video failure on our side prevents or substantially disrupts the session', 'Full refund or free rebooking'],
            [
              'Your own internet or device fails',
              'One free rebooking if less than half of the session took place; otherwise the session counts as delivered',
            ],
            ['We stop a booking for your safety (for example, to direct you to emergency or doctor-led care)', 'Full refund'],
            ['The Physiotherapist ends a home visit because the environment is unsafe for reasons outside your control', 'Full refund or free rebooking'],
            ['The Physiotherapist ends a session because of abusive, threatening or inappropriate behaviour', 'No refund'],
          ]
        ),
        p(
          '**4.6 If you are unhappy with a session.** Tell us within 7 days of the appointment. We will review your concern, which may include asking the Physiotherapist for their account and reviewing the session record, and respond within 10 business days. If the service was not delivered as described (for example, it was much shorter than booked, or the wrong service was provided), we will refund all or part of the fee or offer a free session with another Physiotherapist. Disagreement with a clinical opinion is handled as a clinical complaint under our Terms of Service.'
        ),
        p(
          '**4.7 Packages.** You may cancel the unused part of a package at any time within its validity period. We will refund the amount you paid less the standard single-session price of each session you have used (so you pay what you would have paid without the package, never more). Sessions not used by the end of the validity period expire, but we will remind you before they do and will extend the period if a delay was caused by us or by a clinical reason your Physiotherapist confirms.'
        ),
        p('**4.8 Digital Recovery Services.**'),
        ol(
          'If your approved programme is not made available within 7 days of payment, you may cancel for a full refund.',
          'You may cancel within 48 hours of activation for a full refund if you have not used the service substantially (for example, more than 3 programme sessions or 10 Joy conversations).',
          'After that, the 30-day period is non-refundable, except where the service is unavailable or materially defective for a significant part of the period because of us, in which case we will refund a fair proportion or extend your access.',
          'Flex or Flex Max included in a Rehabify Care package is part of the package price and is not refunded separately.'
        ),
        p(
          '**4.9 Rehabify Access and financed bookings.** Refunds of amounts paid by a funder or financing partner (for example, MediLoan by MyItura) are paid to that funder or partner, or handled under its terms, not to you, unless the funder agrees otherwise. Any amount you paid yourself is refunded to you.'
        ),
      ],
    },
    {
      title: '5. How refunds are paid',
      blocks: [
        p(
          '5.1 Refunds go to the original payment method. We approve or decline a refund request within 3 business days of receiving everything we need, and send approved refunds to Paystack within 2 business days. Your bank normally credits the money within 5 to 10 business days after that.'
        ),
        p(
          '5.2 If you chose a credit or free reschedule instead of a refund, the credit is valid for 6 months, may be used for any Rehabify Care service, and will be refunded to you on request if you have not used it before it expires.'
        ),
        p(
          '5.3 Refunds are made in Naira for the amount you paid. We do not refund amounts charged by your own bank, such as SMS alerts or transfer fees.'
        ),
      ],
    },
    {
      title: '6. Chargebacks',
      blocks: [
        p(
          'If you have a problem with a payment, please contact us first so we can fix it quickly. If you raise a chargeback with your bank for a service that was delivered or a charge that this Policy permits, we will provide the booking and session records to Paystack and your bank. Where a chargeback is found to be unjustified, we may recover the amount and suspend new bookings until it is settled.'
        ),
      ],
    },
    {
      title: '7. Receipts and invoices',
      blocks: [
        p(
          'We send a receipt by email or WhatsApp for every payment and every refund, showing the service, date, amount, any travel charge, any discount and the payment reference. Receipts are also available in your account. Ask us if you need an itemised invoice for an insurer, employer or HMO.'
        ),
      ],
    },
    {
      title: '8. Taxes',
      blocks: [
        p(
          'Medical services are exempt from value-added tax under the Nigeria Tax Act 2025, so Rehabify Care prices carry no VAT. Prices for Digital Recovery Services include VAT where Rehabify is required to charge it; your receipt will show any VAT charged. Physiotherapists are responsible for their own income tax.'
        ),
      ],
    },
    {
      title: '9. Health insurance and HMOs',
      blocks: [
        p(
          'Unless we have told you in writing that we have an agreement with your HMO or insurer, you pay us directly and claim reimbursement from your insurer yourself. We will provide the documentation you reasonably need for a claim.'
        ),
      ],
    },
    {
      title: '10. Price changes',
      blocks: [
        p(
          'We may change prices from time to time. New prices are published on the Platform before they apply and do not affect bookings already paid for, packages already bought, or Digital Recovery Services periods already paid for.'
        ),
      ],
    },
    {
      title: '11. Questions and complaints',
      blocks: [
        p(
          'Email hello@myrehabifyhealth.com with "Payment" and your booking or Paystack reference in the subject line, or tell Joy. We respond within 1 business day. Complaints are handled under clause 15 of our Terms of Service, and you may also contact the Federal Competition and Consumer Protection Commission.'
        ),
      ],
    },
    {
      title: 'Summary',
      blocks: [
        table(
          ['Question', 'Short answer'],
          [
            ['When is my booking confirmed?', 'When payment is verified and the Physiotherapist accepts'],
            ['Cancel 24+ hours ahead?', 'Full refund or free reschedule'],
            ['Cancel 2-24 hours ahead?', 'Free reschedule once within 14 days, or 50% refund'],
            ['Physiotherapist cancels or does not show?', 'Full refund including travel, or a replacement'],
            ['Do Flex or Flex Max renew automatically?', 'Never without your express authorisation'],
          ]
        ),
      ],
    },
  ],
};
