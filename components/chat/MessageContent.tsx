// @ts-nocheck - Disable type checking due to deep type instantiation issues with Convex types

'use client'

import React from 'react'
import LinkPreview from './LinkPreview'
import { parseTextWithUrls, type TextPart } from '@/lib/utils/linkDetection'
import { cn } from '@/lib/utils'

interface MessageContentProps {
  content: string
  className?: string
  isOwnMessage?: boolean
}

const MessageContent: React.FC<MessageContentProps> = ({ 
  content, 
  className,
  isOwnMessage = false 
}) => {
  const textParts = parseTextWithUrls(content)
  
  // If there are no URLs, just render the text
  if (textParts.length === 1 && textParts[0].type === 'text') {
    return (
      <div className={className}>
        <p className="whitespace-pre-wrap break-words">{content}</p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Render text parts */}
      <div className="whitespace-pre-wrap break-words">
        {textParts.map((part, index) => {
          if (part.type === 'text') {
            return <span key={index}>{part.content}</span>
          } else {
            // For URLs in text, show them as clickable links
            return (
              <a
                key={index}
                href={part.content}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-600 underline break-all"
              >
                {part.content}
              </a>
            )
          }
        })}
      </div>

      {/* Render link previews for URLs */}
      {textParts
        .filter(part => part.type === 'url')
        .map((urlPart, index) => (
          <LinkPreview
            key={`preview-${index}`}
            url={urlPart.content}
            className={cn(
              "mt-2",
              isOwnMessage ? "ml-auto" : "mr-auto"
            )}
          />
        ))
      }
    </div>
  )
}

export default MessageContent
