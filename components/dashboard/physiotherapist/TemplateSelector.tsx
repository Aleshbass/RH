'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, FileText } from 'lucide-react'
import { useNotesTemplates } from '@/hooks/useNotesTemplates'
import type { Id } from '@/convex/_generated/dataModel'

interface Template {
  _id: string
  title: string
  content: string
  category?: string
  tags?: string[]
}

interface TemplateSelectorProps {
  onSelect: (content: string) => void
  patientName?: string
  clinicId?: Id<"clinics">
  scope?: 'system' | 'clinic' | 'user_physio'
}

export function TemplateSelector({
  onSelect,
  patientName = '',
  clinicId,
  scope = 'user_physio',
}: TemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  const { templates, processTemplate } = useNotesTemplates({ scope, clinicId })
  
  // Filter templates based on search
  const filteredTemplates = templates?.filter((template: Template) => 
    template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    template.tags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  )
  
  const handleSelectTemplate = (template: Template) => {
    const processedContent = processTemplate(template.content, {
      patientName,
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString(),
    })
    onSelect(processedContent)
    setIsOpen(false)
  }
  
  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="w-full"
      >
        <FileText className="mr-2 h-4 w-4" />
        Insert Template
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Select Template</DialogTitle>
            <DialogDescription>
              Choose a template to insert into your notes
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {filteredTemplates?.map((template: Template) => (
                  <Card
                    key={template._id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{template.title}</CardTitle>
                      {template.category && (
                        <Badge variant="secondary">{template.category}</Badge>
                      )}
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.content}
                      </p>
                      {template.tags && template.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {template.tags.map((tag: string) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                
                {filteredTemplates?.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No templates found
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
} 