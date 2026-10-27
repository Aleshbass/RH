/** YouTube id from a watch, share, shorts or embed link (recordings are often unlisted YouTube). */
export function youtubeIdFrom(url: string | null | undefined) {
  if (!url) return null
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/)
  return match?.[1] ?? null
}
