import Link from "next/link";
import { Check } from "@/components/icons";
import BackBreadcrumb from "@/components/common/BackBreadcrumb";
import { BookedSound } from "@/components/booking/BookedSound";

export default async function BookingConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const bookingId = typeof params?.bookingId === 'string' ? params.bookingId : Array.isArray(params?.bookingId) ? params.bookingId[0] : undefined;

  return (
    <div className="min-h-dvh w-full bg-rh-canvas px-4 py-8 text-rh-night sm:px-6 lg:px-8">
      <BookedSound bookingId={bookingId} />
      <div className="mx-auto w-full max-w-xl">
        <BackBreadcrumb fallbackHref="/dashboard/patient/appointments" className="mb-4 sm:mb-6" />
        <div className="flex flex-col items-center gap-4 text-center sm:gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rh-lime shadow-[0_14px_30px_-12px_rgba(0,205,15,0.9)]">
            <Check className="h-8 w-8 text-rh-night" strokeWidth={3} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Booking confirmed</h1>
          {bookingId && (
            <p className="text-sm text-rh-night/55">
              Reference: <span className="font-medium text-rh-night/80">{bookingId}</span>
            </p>
          )}
          <p className="max-w-prose text-rh-night/70">
            Thank you for your payment. Your session has been scheduled.
          </p>
        </div>

        <div className="mt-6 rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-rh-night/[0.06] sm:mt-8 sm:p-6">
          <h2 className="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">What happens next</h2>
          <ol className="list-decimal space-y-2 pl-5 text-left text-sm text-rh-night/75 sm:text-base">
            <li>Your appointment appears in <span className="font-medium text-rh-night">My Appointments</span>.</li>
            <li>You&rsquo;ll receive a confirmation email with the date and time.</li>
            <li>Your physiotherapist may contact you to finalise location or video details.</li>
            <li>Need changes? You can reschedule from your appointments page.</li>
            <li>Optional: add the appointment to your personal calendar.</li>
          </ol>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:flex sm:items-center sm:justify-center">
          <Link
            href="/dashboard/patient/appointments"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-rh-lime px-5 text-base font-semibold text-rh-night shadow-[0_10px_24px_-12px_rgba(0,205,15,0.9)] transition-[filter] hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-night focus-visible:ring-offset-2 sm:w-auto"
          >
            Go to My Appointments
          </Link>
          <Link
            href="/find-a-physio"
            className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-rh-night/15 bg-white px-5 text-base font-semibold text-rh-night transition-colors hover:bg-rh-night/[0.04] sm:w-auto"
          >
            Explore more physiotherapists
          </Link>
        </div>
      </div>
    </div>
  );
}
