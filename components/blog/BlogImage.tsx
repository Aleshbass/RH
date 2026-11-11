'use client'

import Image, { type ImageLoaderProps, type ImageProps } from 'next/image'

const IMAGEKIT = /^https:\/\/ik\.imagekit\.io\//i

/** ImageKit resizes, compresses and picks WebP or AVIF itself, so the browser gets the right file for its screen. */
function imagekitLoader({ src, width, quality }: ImageLoaderProps) {
  return `${src}${src.includes('?') ? '&' : '?'}tr=w-${width},q-${quality ?? 78},f-auto`
}

/**
 * next/image for blog pictures. A loader is a function, which a server component can't pass
 * to next/image, so this thin client wrapper holds it; the <img> is still in the server HTML.
 */
export function BlogImage(props: Omit<ImageProps, 'loader'>) {
  const onImagekit = typeof props.src === 'string' && IMAGEKIT.test(props.src)
  // eslint-disable-next-line jsx-a11y/alt-text -- alt comes in with the props
  return <Image {...props} loader={onImagekit ? imagekitLoader : undefined} unoptimized={onImagekit ? undefined : true} />
}
