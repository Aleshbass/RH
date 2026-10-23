import { redirect } from "next/navigation";

/** Referring doctors now work from the partner portal (referrals, referral link, commissions). */
export default function DoctorRedirect() {
  redirect("/partners/portal");
}
