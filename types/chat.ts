import { Id } from "../convex/_generated/dataModel";

export interface ChatMessage {
  _id: Id<"messages">;
  conversationId: Id<"conversations">;
  senderId: Id<"users">;
  receiverId: Id<"users">;
  content: string;
  contentType: "text" | "image" | "file" | "audio";
  fileUrl?: string; // storageId string
  metadata?: {
    originalName?: string;
    fileSize?: number;
    mimeType?: string;
  };
  replyToMessageId?: Id<"messages">;
  replyToMessage?: ChatMessage | null; // denormalized in queries
  timestamp: number;
  isReadByReceiver: boolean;
  readAt?: number;
  isRead: boolean;
  createdAt: number;
  updatedAt: number;
  // Delivery status (WhatsApp-style)
  isDelivered?: boolean;
  deliveredAt?: number;
  // Reactions
  reactions?: Array<{
    userId: Id<"users">;
    type: string; // emoji code or key
    timestamp: number;
  }>;
  // Edit/Delete
  isDeleted?: boolean;
  deletedAt?: number;
  editedAt?: number;
  editedBy?: Id<"users">;
  // Starring
  starredBy?: Id<"users">[];
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