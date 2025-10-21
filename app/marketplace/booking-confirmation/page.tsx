import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import BackBreadcrumb from "@/components/common/BackBreadcrumb";

export default async function BookingConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const bookingId = typeof params?.bookingId === 'string' ? params.bookingId : Array.isArray(params?.bookingId) ? params.bookingId[0] : undefined;

  return (
    <div className="min-h-[70vh] w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-xl">
        <BackBreadcrumb fallbackHref="/dashboard/patient/appointments" className="mb-4 sm:mb-6" />
        <div className="flex flex-col items-center text-center gap-4 sm:gap-5">
          <CheckCircle2 className="h-12 w-12 text-green-600 sm:h-14 sm:w-14" />
          <h1 className="text-2xl font-bold sm:text-3xl">Booking Confirmed</h1>
          {bookingId && (
            <p className="text-sm text-gray-500">Reference: <span className="font-medium text-gray-700">{bookingId}</span></p>
          )}
          <p className="text-gray-700 max-w-prose">
            Thank you for your payment. Your session has been scheduled successfully.
          </p>
        </div>

        <div className="mt-6 sm:mt-8 rounded-lg border bg-white p-4 sm:p-6 shadow-sm">
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">What happens next</h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm sm:text-base text-gray-700 text-left">
            <li>Your appointment appears in <span className="font-medium">My Appointments</span>.</li>
            <li>You&rsquo;ll receive a confirmation email with date and time.</li>
            <li>Your physiotherapist may contact you to finalize location or video details.</li>
            <li>Need changes? You can reschedule from your appointments page.</li>
            <li>Optional: add the appointment to your personal calendar.</li>
          </ol>
        </div>

        <div className="mt-6 sm:mt-8 grid grid-cols-1 gap-3 sm:flex sm:items-center sm:justify-center">
          <Link
            href="/dashboard/patient/appointments"
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-md bg-[#005b57] px-4 py-3 text-white text-base font-medium hover:bg-[#004a45] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#005b57]"
          >
            Go to My Appointments
          </Link>
          <Link
            href="/find-a-physio"
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-3 text-base font-medium text-gray-700 hover:bg-gray-50"
          >
            Explore more physiotherapists
          </Link>
        </div>
      </div>
    </div>
  );
}
