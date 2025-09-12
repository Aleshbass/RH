

'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ExternalLink, Play, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import Image from 'next/image'

interface LinkPreviewProps {
  url: string
  className?: string
}

interface LinkMetadata {
  title?: string
  description?: string
  image?: string
  siteName?: string
  type?: 'video' | 'website' | 'image'
  duration?: string
  author?: string
}

const LinkPreview: React.FC<LinkPreviewProps> = ({ url, className }) => {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Extract YouTube video ID from URL
  const getYouTubeVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ]
    
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  // Check if URL is a YouTube video
  const isYouTubeVideo = (url: string): boolean => {
    return /(?:youtube\.com|youtu\.be)/.test(url)
  }

  // Check if URL is an image
  const isImageUrl = (url: string): boolean => {
    return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)
  }

  // Get YouTube thumbnail and metadata
  const getYouTubeMetadata = async (videoId: string): Promise<LinkMetadata> => {
    try {
      // YouTube thumbnail URLs
      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      
      // Try to get video title using YouTube oEmbed API
      const oembedResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      
      if (oembedResponse.ok) {
        const oembedData = await oembedResponse.json()
        return {
          title: oembedData.title,
          description: `by ${oembedData.author_name}`,
          image: thumbnailUrl,
          siteName: 'YouTube',
          type: 'video',
          author: oembedData.author_name
        }
      }
      
      // Fallback if oEmbed fails
      return {
        title: 'YouTube Video',
        description: 'Click to watch on YouTube',
        image: thumbnailUrl,
        siteName: 'YouTube',
        type: 'video'
      }
    } catch (error) {
      console.error('Error fetching YouTube metadata:', error)
      throw error
    }
  }

  // Get generic link metadata (fallback)
  const getGenericMetadata = async (url: string): Promise<LinkMetadata> => {
    try {
      // For now, return basic metadata
      // In a real implementation, you'd use a service like linkpreview.net or implement server-side scraping
      const domain = new URL(url).hostname.replace('www.', '')
      
      return {
        title: domain,
        description: 'Click to open link',
        siteName: domain,
        type: 'website'
      }
    } catch (error) {
      console.error('Error parsing URL:', error)
      throw error
    }
  }

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setLoading(true)
        setError(false)

        if (isImageUrl(url)) {
          setMetadata({
            title: 'Image',
            image: url,
            type: 'image'
          })
        } else if (isYouTubeVideo(url)) {
          const videoId = getYouTubeVideoId(url)
          if (videoId) {
            const ytMetadata = await getYouTubeMetadata(videoId)
            setMetadata(ytMetadata)
          } else {
            throw new Error('Invalid YouTube URL')
          }
        } else {
          const genericMetadata = await getGenericMetadata(url)
          setMetadata(genericMetadata)
        }
      } catch (error) {
        console.error('Error fetching link metadata:', error)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchMetadata()
  }, [url])

  const handleClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (loading) {
    return (
      <Card className={cn("max-w-sm animate-pulse", className)}>
        <CardContent className="p-3">
          <div className="flex gap-3">
            <div className="w-16 h-12 bg-muted rounded" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !metadata) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className={cn("text-xs", className)}
      >
        <ExternalLink className="h-3 w-3 mr-1" />
        Open Link
      </Button>
    )
  }

  return (
    <Card className={cn("max-w-sm cursor-pointer hover:bg-muted/50 transition-colors", className)} onClick={handleClick}>
      <CardContent className="p-3">
        <div className="flex gap-3">
          {/* Thumbnail/Icon */}
          <div className="flex-shrink-0">
            {metadata.image ? (
              <div className="relative w-16 h-12 bg-muted rounded overflow-hidden">
                <Image
                  src={metadata.image}
                  alt={metadata.title || 'Link preview'}
                  className="w-full h-full object-cover"
                  width={64}
                  height={48}
                  unoptimized
                  onError={(e) => {
                    // Handle error by hiding the image
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                  }}
                />
                {metadata.type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="h-4 w-4 text-white" fill="white" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-16 h-12 bg-muted rounded flex items-center justify-center">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="space-y-1">
              {metadata.title && (
                <h4 className="text-sm font-medium line-clamp-2 leading-tight">
                  {metadata.title}
                </h4>
              )}
              {metadata.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {metadata.description}
                </p>
              )}
              {metadata.siteName && (
                <p className="text-xs text-muted-foreground font-medium">
                  {metadata.siteName}
                </p>
              )}
            </div>
          </div>

          {/* External link icon */}
          <div className="flex-shrink-0 self-start">
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default LinkPreview
