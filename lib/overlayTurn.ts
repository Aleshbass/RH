/**
 * One first-visit overlay at a time. Welcome tours and the app setup prompt open on their own, and
 * two at once block each other (a modal dialog makes everything outside it unclickable, while the
 * tour's backdrop covers the dialog). A tour marks itself open here and waits for any dialog
 * already open; the app setup prompt waits for the tour to close.
 */

const TOUR_CLOSED_EVENT = 'rehabify:tour-closed';

export function markTourOpen(open: boolean) {
  document.documentElement.dataset.tourOpen = open ? '1' : '';
  if (!open) window.dispatchEvent(new Event(TOUR_CLOSED_EVENT));
}

function isTourOpen() {
  return document.documentElement.dataset.tourOpen === '1';
}

/** Runs `callback` once no tour is open (now, or when the open one closes). Returns a cancel. */
export function whenNoTourOpen(callback: () => void): () => void {
  if (!isTourOpen()) {
    callback();
    return () => undefined;
  }
  const onClosed = () => {
    window.removeEventListener(TOUR_CLOSED_EVENT, onClosed);
    callback();
  };
  window.addEventListener(TOUR_CLOSED_EVENT, onClosed);
  return () => window.removeEventListener(TOUR_CLOSED_EVENT, onClosed);
}

/** True while a modal dialog (consent, app setup...) is open: a tour waits for it. */
export function isDialogOpen() {
  return Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'));
}
