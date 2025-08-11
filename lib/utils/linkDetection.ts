/**
 * Utility functions for detecting and extracting URLs from text
 */

// URL regex pattern that matches most common URL formats
const URL_REGEX = /(https?:\/\/(?:[-\w.])+(?:\:[0-9]+)?(?:\/(?:[\w\/_.])*(?:\?(?:[\w&=%.])*)?(?:\#(?:[\w.])*)?)?)/gi

/**
 * Extract all URLs from a text string
 */
export const extractUrls = (text: string): string[] => {
  const matches = text.match(URL_REGEX)
  return matches || []
}

/**
 * Check if text contains any URLs
 */
export const containsUrls = (text: string): boolean => {
  return URL_REGEX.test(text)
}

/**
 * Replace URLs in text with a placeholder or custom replacement
 */
export const replaceUrls = (text: string, replacement: (url: string) => string): string => {
  return text.replace(URL_REGEX, replacement)
}

/**
 * Split text into parts, separating URLs from regular text
 */
export interface TextPart {
  type: 'text' | 'url'
  content: string
}

export const parseTextWithUrls = (text: string): TextPart[] => {
  const parts: TextPart[] = []
  let lastIndex = 0
  
  const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags)
  let match
  
  while ((match = regex.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index)
      if (textContent) {
        parts.push({ type: 'text', content: textContent })
      }
    }
    
    // Add the URL
    parts.push({ type: 'url', content: match[0] })
    lastIndex = regex.lastIndex
  }
  
  // Add remaining text after the last URL
  if (lastIndex < text.length) {
    const textContent = text.slice(lastIndex)
    if (textContent) {
      parts.push({ type: 'text', content: textContent })
    }
  }
  
  // If no URLs were found, return the original text as a single part
  if (parts.length === 0) {
    parts.push({ type: 'text', content: text })
  }
  
  return parts
}

/**
 * Check if a URL is likely to be a media file (image, video, audio)
 */
export const isMediaUrl = (url: string): boolean => {
  const mediaExtensions = /\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|ogg|mp3|wav|pdf)$/i
  return mediaExtensions.test(url)
}

/**
 * Check if a URL is a YouTube video
 */
export const isYouTubeUrl = (url: string): boolean => {
  return /(?:youtube\.com|youtu\.be)/.test(url)
}

/**
 * Check if a URL is from a social media platform
 */
export const isSocialMediaUrl = (url: string): boolean => {
  const socialDomains = ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'tiktok.com']
  try {
    const domain = new URL(url).hostname.toLowerCase().replace('www.', '')
    return socialDomains.some(socialDomain => domain.includes(socialDomain))
  } catch {
    return false
  }
}

/**
 * Get the domain name from a URL
 */
export const getDomainFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return 'Unknown'
  }
}
