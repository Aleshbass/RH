/**
 * Shortcuts that open a form on the page that owns it. The top bar fires the event when that page
 * is already open; from anywhere else it goes there with `?book=1` / `?add=1` instead.
 */
export const CLINIC_BOOK_EVENT = 'rehabify:clinic-book'
export const CLINIC_ADD_PATIENT_EVENT = 'rehabify:clinic-add-patient'
export const CLINIC_REQUEST_PAYMENT_EVENT = 'rehabify:clinic-request-payment'
/** "Record payment": money a patient has already paid (transfer, cash, POS), `?record=1` */
export const CLINIC_RECORD_PAYMENT_EVENT = 'rehabify:clinic-record-payment'

/** Reads a query parameter once and removes it from the address bar (e.g. ?patient=<id>). */
export function takeQueryParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search)
  const value = params.get(name)
  if (value === null) return null
  params.delete(name)
  const query = params.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
  return value
}

/**
 * Runs `open` when the shortcut event fires, and once on arrival when the URL carries
 * `?{param}=1` (the flag is then removed, so a refresh doesn't reopen the form).
 */
export function listenForShortcut(event: string, param: string, open: () => void) {
  const params = new URLSearchParams(window.location.search)
  if (params.get(param) === '1') {
    params.delete(param)
    const query = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    // After the page's first render, so access checks and data hooks are ready
    window.setTimeout(open, 0)
  }
  window.addEventListener(event, open)
  return () => window.removeEventListener(event, open)
}
