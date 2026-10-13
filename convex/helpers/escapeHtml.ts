/**
 * HTML-escapes a value before it is interpolated into an email template, so names,
 * messages and other user-supplied text cannot inject markup or links into mail sent
 * from the Rehabify domain.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes an optional value, keeping `undefined` so templates can still omit the field. */
export function escapeOptional(value: string | undefined | null): string | undefined {
  return value === undefined || value === null || value === "" ? undefined : escapeHtml(value);
}

/** Plain-text email subject: collapses newlines (subjects are not HTML, so no escaping). */
export function plainSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
