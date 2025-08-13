'use client'

import { useState } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Edit, Trash2, Search } from 'lucide-react'
import { NotesTemplate, TemplateFormData } from '@/types/templates'
import { Id } from '@/convex/_generated/dataModel'

export default function NotesTemplatesPage() {
  const [selectedScope, setSelectedScope] = useState<'user_physio' | 'clinic' | 'system'>('user_physio')
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<NotesTemplate | null>(null)
  
  // Form state
  const [formData, setFormData] = useState<TemplateFormData>({
    title: '',
    content: '',
    category: '',
    tags: []
  })
  
  // Get templates
  const templates = useQuery(api.notesTemplates.getTemplates, {
    scope: selectedScope,
    clinicId: undefined // TODO: Get from user context when dealing with clinic templates
  })
  
  // Mutations
  const createTemplate = useMutation(api.notesTemplates.createTemplate)
  const updateTemplate = useMutation(api.notesTemplates.updateTemplate)
  const deleteTemplate = useMutation(api.notesTemplates.deleteTemplate)
  
  // Filter templates based on search
  const filteredTemplates = templates?.filter((template: { title: string; content: string; category?: string; tags?: string[]; scope: string }) => {
    const matchesSearch = template.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags?.some((tag: string) => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesScope = template.scope === selectedScope
    
    return matchesSearch && matchesScope
  })
  
  const handleCreateTemplate = async () => {
    try {
      await createTemplate({
        title: formData.title,
        content: formData.content,
        category: formData.category || undefined,
        tags: formData.tags,
        scope: selectedScope
      })
      toast.success('Template created successfully')
      setIsCreateModalOpen(false)
      setFormData({ title: '', content: '', category: '', tags: [] })
    } catch (error) {
      toast.error('Failed to create template')
      console.error(error)
    }
  }
  
  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return
    
    try {
      await updateTemplate({
        templateId: selectedTemplate._id,
        title: formData.title,
        content: formData.content,
        category: formData.category || undefined,
        tags: formData.tags
      })
      toast.success('Template updated successfully')
      setSelectedTemplate(null)
      setFormData({ title: '', content: '', category: '', tags: [] })
    } catch (error) {
      toast.error('Failed to update template')
      console.error(error)
    }
  }
  
  const handleDeleteTemplate = async (templateId: Id<"notesTemplates">) => {
    try {
      await deleteTemplate({ templateId })
      toast.success('Template deleted successfully')
    } catch (error) {
      toast.error('Failed to delete template')
      console.error(error)
    }
  }
  
  const handleScopeChange = (value: string) => {
    setSelectedScope(value as 'user_physio' | 'clinic' | 'system')
  }
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Notes Templates</h1>
          <p className="text-muted-foreground">Manage your quick-fill templates for patient notes</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create Template
        </Button>
      </div>
      
      <div className="flex space-x-4">
        <div className="flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={selectedScope} onValueChange={handleScopeChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user_physio">My Templates</SelectItem>
            <SelectItem value="clinic">Clinic Templates</SelectItem>
            <SelectItem value="system">System Templates</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates?.map((template: { _id: string; title: string; content: string; category?: string; tags?: string[] }) => (
          <Card key={template._id}>
            <CardHeader>
              <CardTitle className="flex justify-between items-start">
                <span>{template.title}</span>
                <div className="flex space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSelectedTemplate(template)
                      setFormData({
                        title: template.title,
                        content: template.content,
                        category: template.category || '',
                        tags: template.tags || [],
                      })
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteTemplate(template._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardTitle>
              {template.category && (
                <Badge variant="secondary">{template.category}</Badge>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-3">
                {template.content}
              </p>
              {template.tags && template.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
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
      </div>
      
      {/* Create/Edit Modal */}
      <Dialog 
        open={isCreateModalOpen || !!selectedTemplate} 
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateModalOpen(false)
            setSelectedTemplate(null)
            setFormData({ title: '', content: '', category: '', tags: [] })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedTemplate ? 'Edit Template' : 'Create New Template'}
            </DialogTitle>
            <DialogDescription>
              {selectedTemplate 
                ? 'Update your existing template'
                : 'Create a new quick-fill template for your notes'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Template title..."
              />
            </div>
            
            <div>
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Template content... Use {{patientName}} for dynamic placeholders"
                rows={6}
              />
            </div>
            
            <div>
              <Label htmlFor="category">Category (Optional)</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="e.g., Initial Assessment, Follow-up..."
              />
            </div>
            
            <div>
              <Label htmlFor="tags">Tags (Optional)</Label>
              <Input
                id="tags"
                value={formData.tags.join(', ')}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  tags: e.target.value.split(',').map(tag => tag.trim()).filter(Boolean)
                }))}
                placeholder="Enter tags separated by commas..."
              />
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreateModalOpen(false)
                  setSelectedTemplate(null)
                  setFormData({ title: '', content: '', category: '', tags: [] })
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={selectedTemplate ? handleUpdateTemplate : handleCreateTemplate}
              >
                {selectedTemplate ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 