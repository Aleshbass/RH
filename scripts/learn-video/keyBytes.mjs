/** Base64 → bytes for the AES key handed over by Convex (kept in memory only). */
export function fromBase64(text) {
  const bytes = Uint8Array.from(Buffer.from(String(text ?? ''), 'base64'))
  if (bytes.length !== 16) throw new Error('Convex sent a key of the wrong length.')
  return bytes
}
