// @ts-nocheck - Disable type checking due to deep type instantiation issues with Convex types

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useState, useCallback } from 'react'
import type { Id } from '@/convex/_generated/dataModel'

interface UseNotesTemplatesProps {
  scope?: 'system' | 'clinic' | 'user_physio'
  clinicId?: Id<"clinics">
}

export function useNotesTemplates({ scope = 'user_physio', clinicId }: UseNotesTemplatesProps = {}) {
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
  
  // Get templates from Convex
  const templates = useQuery(api.notesTemplates.getTemplates, {
    scope,
    clinicId,
  })
  
  // Process template content by replacing placeholders with actual values
  const processTemplate = useCallback((content: string, values: Record<string, string>) => {
    let processedContent = content
    
    // Replace all placeholders ({{key}}) with their values
    Object.entries(values).forEach(([key, value]) => {
      const placeholder = new RegExp(`{{${key}}}`, 'g')
      processedContent = processedContent.replace(placeholder, value)
    })
    
    return processedContent
  }, [])
  
  // Insert template content at cursor position
  const insertTemplate = useCallback((
    templateContent: string,
    values: Record<string, string>,
    textAreaElement: HTMLTextAreaElement
  ) => {
    const processedContent = processTemplate(templateContent, values)
    const cursorPosition = textAreaElement.selectionStart
    
    const currentContent = textAreaElement.value
    const beforeCursor = currentContent.substring(0, cursorPosition)
    const afterCursor = currentContent.substring(cursorPosition)
    
    // Add newlines if needed
    const newContent = beforeCursor + 
      (beforeCursor && !beforeCursor.endsWith('\n') ? '\n' : '') +
      processedContent +
      (!processedContent.endsWith('\n') ? '\n' : '') +
      afterCursor
    
    // Update textarea value
    textAreaElement.value = newContent
    
    // Trigger change event
    const event = new Event('input', { bubbles: true })
    textAreaElement.dispatchEvent(event)
    
    // Set cursor position after inserted content
    const newPosition = cursorPosition + processedContent.length + 
      (beforeCursor && !beforeCursor.endsWith('\n') ? 1 : 0) +
      (!processedContent.endsWith('\n') ? 1 : 0)
    textAreaElement.setSelectionRange(newPosition, newPosition)
    textAreaElement.focus()
  }, [processTemplate])
  
  return {
    templates,
    selectedTemplate,
    setSelectedTemplate,
    processTemplate,
    insertTemplate,
  }
} 