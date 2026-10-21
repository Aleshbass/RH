/**
 * Rehabify clinical network terms that affiliated physiotherapists accept before treating
 * Rehabify patients. Bump NETWORK_TERMS_VERSION whenever the wording changes. Physios
 * accept the new version from Settings › Network terms, and every acceptance is stored
 * (physioNetworkAgreements).
 */
export const NETWORK_TERMS_VERSION = "2026-10-19";

export const NETWORK_TERMS_SUMMARY: { title: string; body: string }[] = [
  {
    title: "Standard Rehabify pricing",
    body:
      "Rehabify sets one price per service for every patient across the network. You don't set or negotiate your own prices for Rehabify patients. The only variable is the travel-zone charge on home visits, which Rehabify calculates and shows the patient before they pay.",
  },
  {
    title: "Your payout per service",
    body:
      "For each completed session you earn the fixed payout in the schedule below, plus your share of any travel-zone charge. Patients pay Rehabify, and Rehabify pays you after the session is marked completed. Rehabify's share covers the platform, payment processing, patient acquisition and coordination.",
  },
  {
    title: "Clinical standards",
    body:
      "You deliver each service as described: its duration, what happens and what the patient receives. You document every session in your Rehabify workspace. Where a virtual session isn't enough, you recommend an in-person assessment, and you refer urgent concerns on to the right service.",
  },
  {
    title: "Rehabify Access (optional)",
    body:
      "You can choose to accept selected reduced-fee cases for patients approved for Rehabify Access, and set the minimum payout you'd accept for each service. Rehabify still sets the patient's price. You're only matched with Access patients when your minimum is met and the case fits your skills.",
  },
  {
    title: "Changes",
    body:
      "Rehabify may update prices and payouts. Bookings already made keep the price and payout they were booked at. If these terms change, you'll be asked to accept the new version.",
  },
];
