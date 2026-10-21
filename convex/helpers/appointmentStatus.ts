/**
 * One vocabulary for appointment statuses across the physio, patient and clinic portals, plus
 * the rule for who confirms a visit: the side that did not set its current time.
 * Plain functions only, so Convex and the app share them.
 */
export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled_by_patient"
  | "cancelled_by_therapist"
  | "no_show";

export type AppointmentSide = "patient" | "provider";

export type StatusTone = "neutral" | "teal" | "green" | "amber" | "red";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Awaiting confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled_by_patient: "Cancelled by patient",
  cancelled_by_therapist: "Cancelled by physio",
  no_show: "No-show",
};

const STATUS_TONES: Record<AppointmentStatus, StatusTone> = {
  scheduled: "amber",
  confirmed: "teal",
  completed: "green",
  cancelled_by_patient: "red",
  cancelled_by_therapist: "red",
  no_show: "amber",
};

/** The fields these helpers read; every appointment row (and query result) has them. */
export type AppointmentStatusFields = {
  status: string;
  startTime?: number;
  requestedBy?: AppointmentSide;
  proposedStartTime?: number;
  proposedEndTime?: number;
  // Older rows have no requestedBy: provider-side creation paths always set one of these
  priority?: string;
  colorCode?: string;
  seriesId?: unknown;
  isOnline?: boolean;
};

/** Booked and still going ahead (waiting for confirmation or confirmed). */
export function isOpenAppointment(status: string): boolean {
  return status === "scheduled" || status === "confirmed";
}

export function isCancelledAppointment(status: string): boolean {
  return status === "cancelled_by_patient" || status === "cancelled_by_therapist";
}

/**
 * Who set the visit's current time. Rows saved before `requestedBy` existed are inferred:
 * only a patient's own request leaves priority, colour, series and isOnline unset.
 */
export function requestedByOf(apt: AppointmentStatusFields): AppointmentSide {
  if (apt.requestedBy) return apt.requestedBy;
  return apt.priority || apt.colorCode || apt.seriesId || apt.isOnline !== undefined ? "provider" : "patient";
}

/** The side that still has to confirm a pending visit, or null when nothing is pending. */
export function awaitingConfirmationFrom(apt: AppointmentStatusFields): AppointmentSide | null {
  if (apt.status !== "scheduled") return null;
  return requestedByOf(apt) === "patient" ? "provider" : "patient";
}

/** True while the physio's offer of another time is waiting for the patient. */
export function hasPendingProposal(apt: AppointmentStatusFields, now = Date.now()): boolean {
  return (
    isOpenAppointment(apt.status) &&
    typeof apt.proposedStartTime === "number" &&
    typeof apt.proposedEndTime === "number" &&
    apt.proposedStartTime > now
  );
}

/**
 * Label for a status. Pass the appointment and the viewer's side to say who a pending visit
 * is waiting on ("Waiting for your physio to confirm", "Needs your confirmation").
 */
export function appointmentStatusLabel(
  apt: AppointmentStatusFields | string,
  viewer?: AppointmentSide
): string {
  const status = typeof apt === "string" ? apt : apt.status;
  if (typeof apt !== "string" && viewer && isOpenAppointment(status)) {
    if (hasPendingProposal(apt)) {
      return viewer === "patient" ? "New time proposed" : "New time proposed, waiting for patient";
    }
    const waitingOn = awaitingConfirmationFrom(apt);
    if (waitingOn === viewer) return viewer === "patient" ? "Please confirm" : "Needs your confirmation";
    if (waitingOn) return viewer === "patient" ? "Waiting for your physio to confirm" : "Waiting for patient to confirm";
  }
  return APPOINTMENT_STATUS_LABELS[status as AppointmentStatus] ?? status.replace(/_/g, " ");
}

export function appointmentStatusTone(status: string): StatusTone {
  return STATUS_TONES[status as AppointmentStatus] ?? "neutral";
}
