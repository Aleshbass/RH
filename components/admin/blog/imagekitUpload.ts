/**
 * Uploads one file straight from the browser to ImageKit's public /blog folder, reporting
 * progress (0 to 1). The signature comes from blog:uploadAuth (writers and admins only).
 * Kept separate from the Learn video uploader so the blog doesn't import that module.
 */
import type { UploadAuth } from '@/lib/blog/api'

export type ImagekitFile = { fileId: string; filePath: string; url: string; size: number }

/** ImageKit keeps the name in the URL, so it becomes part of the picture's address: keep it readable. */
function safeName(name: string) {
  const dot = name.lastIndexOf('.')
  const ext = (dot > 0 ? name.slice(dot + 1) : 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${base || 'blog-image'}.${ext}`
}

export function uploadToImagekit(file: Blob, name: string, auth: UploadAuth, onProgress?: (fraction: number) => void): Promise<ImagekitFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('fileName', safeName(name))
    form.append('publicKey', auth.publicKey)
    form.append('signature', auth.signature)
    form.append('expire', String(auth.expire))
    form.append('token', auth.token)
    form.append('folder', auth.folder)
    form.append('useUniqueFileName', 'true')

    const xhr = new XMLHttpRequest()
    xhr.open('POST', 'https://upload.imagekit.io/api/v1/files/upload')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total)
    }
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // handled below
      }
      if (xhr.status >= 200 && xhr.status < 300 && typeof body.fileId === 'string' && typeof body.url === 'string') {
        resolve({ fileId: body.fileId, filePath: String(body.filePath ?? ''), url: body.url, size: Number(body.size) || file.size })
      } else {
        reject(new Error(typeof body.message === 'string' ? body.message : 'The upload failed. Please try again.'))
      }
    }
    xhr.onerror = () => reject(new Error('The upload stopped. Check your connection and try again.'))
    xhr.send(form)
  })
}
