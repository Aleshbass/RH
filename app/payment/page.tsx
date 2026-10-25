import { permanentRedirect } from "next/navigation";

// The pay-later page lives at /pay-later now. /payment/callback (the Paystack return page) stays here.
export default function PaymentPage() {
  permanentRedirect("/pay-later");
}
