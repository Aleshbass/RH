/**
 * Photos for the Learn pages, picked from the blog media library (Admin › Blog › Media, stored
 * on ImageKit). ImageKit resizes them per screen through `imagekitLoader`.
 */

export type LearnPhoto = { src: string; alt: string; width: number; height: number }

const BLOG = 'https://ik.imagekit.io/benqpjfyv/blog'

export const LEARN_PHOTOS = {
  consult: {
    src: `${BLOG}/image_Dy5DRaYeB.webp`,
    alt: 'A physiotherapist talking with a patient in a clinic',
    width: 1480,
    height: 878,
  },
  explain: {
    src: `${BLOG}/p13-b-upload-cast-femi-9-16_A4AqhGlvm.webp`,
    alt: 'A physiotherapist explaining a point',
    width: 941,
    height: 1672,
  },
  stretch: {
    src: `${BLOG}/p02-e-4-3_FCFScBoW1.webp`,
    alt: 'A woman stretching at her desk at work',
    width: 1448,
    height: 1086,
  },
  phone: {
    src: `${BLOG}/p13-a-9-16_RqbDPVZyq.webp`,
    alt: 'A woman learning on her phone at home',
    width: 941,
    height: 1672,
  },
  backPain: {
    src: `${BLOG}/p01-a-optional-replaces-slide-1-upload-cast-tunde-4-5_HCMZV8ZVu.webp`,
    alt: 'A man at his office desk holding his lower back',
    width: 1122,
    height: 1402,
  },
  deskIllustration: {
    src: `${BLOG}/p02-a-desk-day-1-1_61OdFAobc.webp`,
    alt: 'Illustration of a woman stretching at her desk',
    width: 1254,
    height: 1254,
  },
} satisfies Record<string, LearnPhoto>

/** ImageKit picks the size, quality and WebP/AVIF for each screen. */
export function imagekitPhotoLoader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  return `${src}${src.includes('?') ? '&' : '?'}tr=w-${width},q-${quality ?? 78},f-auto`
}
