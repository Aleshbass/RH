import { Id } from "../convex/_generated/dataModel";

export interface NotesTemplate {
  _id: Id<"notesTemplates">;
  _creationTime: number;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  createdByUserId?: Id<"users">;
  scope: 'user_physio' | 'clinic' | 'system';
  clinicId?: Id<"clinics">;
}

export interface TemplateFormData {
  title: string;
  content: string;
  category: string;
  tags: string[];
} 