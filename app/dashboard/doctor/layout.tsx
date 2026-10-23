import { redirect } from "next/navigation";

/** Referring doctors now work from the partner portal (referrals, referral link, commissions). */
export default function DoctorLayout() {
  redirect("/partners/portal");
}
