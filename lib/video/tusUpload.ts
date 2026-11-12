/**
 * A small resumable (TUS 1.0) uploader for Bunny Stream: the browser sends the lesson video
 * straight to Bunny in chunks, signed by our server (learn:adminStartBunnyUpload), so the API key
 * never reaches the browser and a dropped chunk is retried from where Bunny says it got to.
 */

export type BunnyUploadAuth = { endpoint: string; libraryId: string; videoId: string; expires: number; signature: string }

const CHUNK_BYTES = 32 * 1024 * 1024
const MAX_RETRIES = 4

function authHeaders(auth: BunnyUploadAuth): Record<string, string> {
  return {
    'Tus-Resumable': '1.0.0',
    AuthorizationSignature: auth.signature,
    AuthorizationExpire: String(auth.expires),
    VideoId: auth.videoId,
    LibraryId: auth.libraryId,
  }
}

/** Base64 of UTF-8 text (TUS metadata values). */
function b64(text: string) {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function abortError() {
  return new DOMException('Upload cancelled', 'AbortError')
}

/** Asks Bunny for a new upload and returns its URL. */
async function createUpload(file: File, title: string, auth: BunnyUploadAuth, signal?: AbortSignal) {
  const res = await fetch(auth.endpoint, {
    method: 'POST',
    signal,
    headers: {
      ...authHeaders(auth),
      'Upload-Length': String(file.size),
      'Upload-Metadata': `filetype ${b64(file.type || 'video/mp4')},title ${b64(title || file.name)}`,
    },
  })
  const location = res.headers.get('Location')
  if (!res.ok || !location) throw new Error(`Bunny Stream didn't start the upload (${res.status}).`)
  return new URL(location, auth.endpoint).toString()
}

/** Where Bunny has got to (after a dropped chunk). */
async function currentOffset(url: string, auth: BunnyUploadAuth, signal?: AbortSignal) {
  const res = await fetch(url, { method: 'HEAD', signal, headers: authHeaders(auth) })
  const offset = Number(res.headers.get('Upload-Offset'))
  if (!res.ok || !Number.isFinite(offset)) throw new Error(`Couldn't resume the upload (${res.status}).`)
  return offset
}

/** One PATCH with upload progress (XHR: fetch can't report upload progress). Resolves to the new offset. */
function sendChunk(
  url: string,
  chunk: Blob,
  offset: number,
  auth: BunnyUploadAuth,
  onBytes: (sent: number) => void,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const xhr = new XMLHttpRequest()
    xhr.open('PATCH', url)
    for (const [key, value] of Object.entries(authHeaders(auth))) xhr.setRequestHeader(key, value)
    xhr.setRequestHeader('Upload-Offset', String(offset))
    xhr.setRequestHeader('Content-Type', 'application/offset+octet-stream')
    xhr.upload.onprogress = (e) => onBytes(e.loaded)
    const onAbort = () => xhr.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    xhr.onload = () => {
      signal?.removeEventListener('abort', onAbort)
      if (xhr.status >= 200 && xhr.status < 300) {
        const next = Number(xhr.getResponseHeader('Upload-Offset'))
        resolve(Number.isFinite(next) && next > offset ? next : offset + chunk.size)
      } else {
        reject(new Error(`Upload chunk failed (${xhr.status}).`))
      }
    }
    xhr.onerror = () => {
      signal?.removeEventListener('abort', onAbort)
      reject(new Error('The connection dropped during the upload.'))
    }
    xhr.onabort = () => {
      signal?.removeEventListener('abort', onAbort)
      reject(abortError())
    }
    xhr.send(chunk)
  })
}

export async function tusUploadToBunny(
  file: File,
  title: string,
  auth: BunnyUploadAuth,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
) {
  const url = await createUpload(file, title, auth, signal)
  let offset = 0
  let retries = 0
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + CHUNK_BYTES))
    try {
      const start = offset
      offset = await sendChunk(url, chunk, offset, auth, (sent) => onProgress?.(Math.min(1, (start + sent) / file.size)), signal)
      retries = 0
      onProgress?.(Math.min(1, offset / file.size))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      if (++retries > MAX_RETRIES) throw err
      await new Promise((r) => setTimeout(r, 1000 * 2 ** retries))
      offset = await currentOffset(url, auth, signal)
    }
  }
}
