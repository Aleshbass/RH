import { Id } from "../convex/_generated/dataModel";

export interface ChatMessage {
  _id: Id<"messages">;
  conversationId: Id<"conversations">;
  senderId: Id<"users">;
  receiverId: Id<"users">;
  content: string;
  contentType: "text" | "image" | "file";
  fileUrl?: string;
  metadata?: {
    originalName?: string;
    fileSize?: number;
    mimeType?: string;
  };
  timestamp: number;
  isReadByReceiver: boolean;
  readAt?: number;
  isRead: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatConversation {
  _id: Id<"conversations">;
  participantIds: Id<"users">[];
  lastMessageId?: Id<"messages">;
  lastMessageAt: number;
  createdAt: number;
  updatedAt: number;
  metadata?: {
    title?: string;
    type?: "direct" | "group";
    groupId?: string;
    isArchived?: boolean;
    customData?: Record<string, unknown>;
  };
}

export interface ChatParticipant {
  _id: Id<"users">;
  name: string;
  role: string;
  avatarUrl?: string;
  isOnline?: boolean;
  lastSeenAt?: number;
}

export interface ChatAttachment {
  fileId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadStatus: "pending" | "uploading" | "complete" | "failed";
  progress?: number;
  error?: string;
}

export interface ChatMessageDraft {
  conversationId: Id<"conversations">;
  content: string;
  attachments?: ChatAttachment[];
  metadata?: Record<string, unknown>;
}

export interface ChatFilter {
  searchTerm?: string;
  participantId?: Id<"users">;
  startDate?: number;
  endDate?: number;
  isUnread?: boolean;
  limit?: number;
}

export interface ChatPaginationResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  total: number;
}

export interface TypingStatus {
  isOtherUserTyping: boolean;
  userId?: Id<"users">;
  timestamp?: number;
  expiresAt?: number;
} 