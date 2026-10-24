import { query, mutation, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { getUserByIdOrThrow } from "./users";
import { assertPatientInClinic } from "./clinicTools";
import { 
  ChatMessage, 
  ChatConversation, 
  ChatFilter, 
  ChatPaginationResult,
  TypingStatus 
} from "../types/chat";
import { QueryBuilder } from "convex/server";

/**
 * Real-time chat system for patient-physiotherapist communication
 * Following PRD: Secure messaging between patients and PTs
 */

// ─────────────────────────────────────────────────────────────────────────────
// Who may message whom (shared with messages.ts)
// ─────────────────────────────────────────────────────────────────────────────

const CLINIC_TEAM_ROLES = new Set(["clinic_owner", "clinic_staff", "physiotherapist"]);

/** The clinic a team member works in: the owner's clinic, or the clinic a physio or front desk belongs to. */
async function clinicIdOf(ctx: QueryCtx, user: Doc<"users">): Promise<Id<"clinics"> | null> {
  if (user.role === "clinic_owner") {
    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .first();
    return clinic?._id ?? null;
  }
  if (user.role === "clinic_staff") return user.clinicId ?? null;
  if (user.role === "physiotherapist") {
    if (user.clinicId) return user.clinicId;
    const profile = await ctx.db
      .query("physiotherapistProfiles")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
    return profile?.clinicId ?? null;
  }
  return null;
}

/** The patient is (or was) under this physio's care: a care relationship or a booking with them. */
async function hasCareLink(ctx: QueryCtx, patientId: Id<"users">, physioId: Id<"users">) {
  const relationship = await ctx.db
    .query("patientPhysiotherapistRelationships")
    .withIndex("by_patient_and_physiotherapist", (q) => q.eq("patientId", patientId).eq("physiotherapistId", physioId))
    .first();
  if (relationship) return true;
  const appointment = await ctx.db
    .query("appointments")
    .withIndex("by_patient_id_and_time", (q) => q.eq("patientId", patientId))
    .filter((q) => q.eq(q.field("physiotherapistId"), physioId))
    .first();
  return Boolean(appointment);
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** A link to open an attachment: full URLs pass through, storage ids are resolved (null if gone). */
async function attachmentUrl(ctx: QueryCtx, fileUrl: string | undefined): Promise<string | null> {
  if (!fileUrl) return null;
  if (/^https?:\/\//.test(fileUrl)) return fileUrl;
  try {
    return await ctx.storage.getUrl(fileUrl as Id<"_storage">);
  } catch {
    return null; // not a storage id
  }
}

async function isClinicPatient(ctx: QueryCtx, clinicId: Id<"clinics">, patientId: Id<"users">) {
  const clinic = await ctx.db.get(clinicId);
  if (!clinic) return false;
  try {
    await assertPatientInClinic(ctx, clinic, patientId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Messaging needs a care link, whichever side starts it:
 * - a patient and a physiotherapist who treats (or treated) them, or who works in the patient's clinic;
 * - a patient and the owner or front desk of a clinic the patient belongs to;
 * - members of the same clinic team;
 * - Rehabify admins, with anyone (support).
 * Everyone else (partners, doctors, other clinics, other patients) is refused.
 */
export async function assertCanMessage(ctx: QueryCtx, me: Doc<"users">, other: Doc<"users">) {
  if (me._id === other._id) throw new ConvexError("You can't send a message to yourself.");
  if (me.role === "admin" || other.role === "admin") return;

  const patient = me.role === "patient" ? me : other.role === "patient" ? other : null;
  const staff = patient === me ? other : me;
  if (patient && staff.role !== "patient") {
    if (staff.role === "physiotherapist" && (await hasCareLink(ctx, patient._id, staff._id))) return;
    if (staff.role && CLINIC_TEAM_ROLES.has(staff.role)) {
      const clinicId = await clinicIdOf(ctx, staff);
      if (clinicId && (await isClinicPatient(ctx, clinicId, patient._id))) return;
    }
    throw new ConvexError(
      patient === me
        ? "You can only message a physiotherapist or clinic that's treating you."
        : "You can only message patients you're treating, or patients of your clinic."
    );
  }

  if (me.role && other.role && CLINIC_TEAM_ROLES.has(me.role) && CLINIC_TEAM_ROLES.has(other.role)) {
    const [mine, theirs] = await Promise.all([clinicIdOf(ctx, me), clinicIdOf(ctx, other)]);
    if (mine && mine === theirs) return;
    throw new ConvexError("You can only message members of your own clinic team.");
  }
  throw new ConvexError("Messages are for patients and their care team.");
}

/**
 * Get or create conversation between patient and physiotherapist
 */
export const getOrCreateConversation = mutation({
  args: {
    participantId: v.id("users"), // The other participant (patient or PT)
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    isNew: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const otherUser = await ctx.db.get(args.participantId);
    if (!otherUser) {
      throw new ConvexError("This person's account couldn't be found.");
    }

    // Needs a care link (or clinic team / admin), checked for existing conversations too, so
    // ones opened before this check can't be reused by people with no link
    await assertCanMessage(ctx, currentUser, otherUser);

    // Check if conversation already exists (either participant order)
    const existingConversation =
      (await ctx.db
        .query("conversations")
        .withIndex("by_participants", (q) => q.eq("participant1Id", currentUser._id).eq("participant2Id", args.participantId))
        .first()) ??
      (await ctx.db
        .query("conversations")
        .withIndex("by_participants", (q) => q.eq("participant1Id", args.participantId).eq("participant2Id", currentUser._id))
        .first());

    if (existingConversation) {
      return {
        conversationId: existingConversation._id,
        isNew: false,
      };
    }

    // Create new conversation
    const conversationId = await ctx.db.insert("conversations", {
      participant1Id: currentUser._id,
      participant2Id: args.participantId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastMessageAt: Date.now(),
      unreadCount1: 0,
      unreadCount2: 0,
    });

    return {
      conversationId,
      isNew: true,
    };
  },
});

/**
 * Toggle a reaction on a message for the current user
 */
export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    type: v.string(), // e.g., "👍", "❤️", "😂"
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    // Verify user is part of the conversation
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.participant1Id !== user._id && conversation.participant2Id !== user._id) {
      throw new Error("Access denied");
    }

    const reactions = (message.reactions as Array<{ userId: Id<"users">; type: string; timestamp: number }>) || [];
    const existingIndex = reactions.findIndex(r => r.userId === user._id);

    if (existingIndex !== -1) {
      // Same type => remove, different type => replace
      if (reactions[existingIndex].type === args.type) {
        reactions.splice(existingIndex, 1);
      } else {
        reactions[existingIndex] = { userId: user._id, type: args.type, timestamp: Date.now() };
      }
    } else {
      reactions.push({ userId: user._id, type: args.type, timestamp: Date.now() });
    }

    await ctx.db.patch(args.messageId, { reactions, updatedAt: Date.now() });
    return { success: true };
  },
});

/**
 * Edit a message (sender only)
 */
export const editMessage = mutation({
  args: {
    messageId: v.id("messages"),
    newContent: v.string(),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== user._id) throw new Error("Only the sender can edit this message");
    if (message.isDeleted) throw new Error("Cannot edit a deleted message");

    await ctx.db.patch(args.messageId, {
      content: args.newContent,
      editedAt: Date.now(),
      editedBy: user._id,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Soft-delete a message (sender only)
 */
export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    if (message.senderId !== user._id) throw new Error("Only the sender can delete this message");

    await ctx.db.patch(args.messageId, {
      isDeleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Star/Unstar a message for current user
 */
export const toggleStar = mutation({
  args: { messageId: v.id("messages") },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    // Verify user is part of the conversation
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.participant1Id !== user._id && conversation.participant2Id !== user._id) {
      throw new Error("Access denied");
    }

    const starredBy: Id<"users">[] = (message.starredBy as Id<"users">[]) || [];
    const idx = starredBy.findIndex((u) => u === user._id);
    if (idx >= 0) starredBy.splice(idx, 1); else starredBy.push(user._id);
    await ctx.db.patch(args.messageId, { starredBy, updatedAt: Date.now() });
    return { success: true };
  },
});

/**
 * Get starred messages by current user in a conversation
 */
export const getStarredMessages = query({
  args: { conversationId: v.id("conversations") },
  returns: v.object({
    items: v.array(v.any()),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.participant1Id !== user._id && conversation.participant2Id !== user._id) {
      throw new Error("Access denied");
    }

    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .order("desc")
      .collect();

    const starred = msgs.filter((m: any) => Array.isArray(m.starredBy) && m.starredBy.includes(user._id));

    // Load reply context for each starred message
    const items = await Promise.all(starred.map(async (m) => {
      const replyToMessage = m.replyToMessageId ? await ctx.db.get(m.replyToMessageId) : null;
      return { ...m, replyToMessage };
    }));

    return { items, total: items.length };
  },
});

/**
 * Send a message in a conversation
 */
export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    contentType: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("file"),
      v.literal("audio")
    ),
    fileUrl: v.optional(v.string()),
    replyToMessageId: v.optional(v.id("messages")),
    metadata: v.optional(v.object({
      originalName: v.optional(v.string()),
      fileSize: v.optional(v.number()),
      mimeType: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    // Verify conversation exists and user is participant
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.participant1Id !== user._id && conversation.participant2Id !== user._id) {
      throw new ConvexError("You're not part of this conversation.");
    }

    // Get receiver ID (the participant that's not the sender)
    const receiverId = conversation.participant1Id === user._id
      ? conversation.participant2Id
      : conversation.participant1Id;
    const receiver = await ctx.db.get(receiverId);
    if (!receiver) throw new ConvexError("This person's account no longer exists.");
    await assertCanMessage(ctx, user, receiver);
    if (!args.content.trim() && !args.fileUrl) throw new ConvexError("Write a message first.");
    if (args.contentType !== "text") {
      if (!args.fileUrl) throw new ConvexError("Attach a file first.");
      const storageId = ctx.db.system.normalizeId("_storage", args.fileUrl);
      const file = storageId ? await ctx.db.system.get(storageId) : null;
      if (!/^https?:\/\//.test(args.fileUrl) && !file) {
        throw new ConvexError("The file didn't finish uploading. Please try again.");
      }
      if (file && file.size > MAX_ATTACHMENT_BYTES) throw new ConvexError("Files can be up to 25 MB.");
    }

    const message = {
      conversationId: args.conversationId,
      senderId: user._id,
      receiverId,
      content: args.content,
      contentType: args.contentType,
      fileUrl: args.fileUrl,
      replyToMessageId: args.replyToMessageId,
      metadata: args.metadata,
      timestamp: Date.now(),
      // WhatsApp-style status: sent (one tick) until the other person's app receives it
      // (markDelivered: two ticks), then read when they open the chat (two blue ticks)
      isDelivered: false,
      isReadByReceiver: false,
      isRead: false, // Legacy field
      readAt: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const messageId = await ctx.db.insert("messages", message);

    // Update conversation's unread counts and last message time
    const isParticipant1 = conversation.participant1Id === user._id;
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
      unreadCount1: isParticipant1 ? conversation.unreadCount1 : conversation.unreadCount1 + 1,
      unreadCount2: isParticipant1 ? conversation.unreadCount2 + 1 : conversation.unreadCount2,
    });

    return messageId;
  },
});

/**
 * Get conversations for the current user
 */
export const getMyConversations = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("conversations"),
    otherParticipant: v.object({
      _id: v.id("users"),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      role: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      isOnline: v.boolean(),
    }),
    lastMessage: v.optional(v.object({
      content: v.string(),
      timestamp: v.number(),
      senderName: v.string(),
    })),
    unreadCount: v.number(),
    updatedAt: v.number(),
  })),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Through the participant indexes: a scan of the whole conversations table re-ran for every
    // user whenever anyone on the platform sent a message
    const [asFirst, asSecond] = await Promise.all([
      ctx.db.query("conversations").withIndex("by_participant1", (q: any) => q.eq("participant1Id", currentUser._id)).take(300),
      ctx.db.query("conversations").withIndex("by_participant2", (q: any) => q.eq("participant2Id", currentUser._id)).take(300),
    ]);
    const conversations = [...asFirst, ...asSecond];

    const conversationsWithDetails = [];
    for (const conversation of conversations) {
        // Get other participant
        const otherParticipantId = conversation.participant1Id === currentUser._id 
          ? conversation.participant2Id 
          : conversation.participant1Id;
        
        const otherParticipant = await ctx.db.get(otherParticipantId);
        if (!otherParticipant) continue;

        // Get last message
        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversation_id", (q: any) => q.eq("conversationId", conversation._id))
          .order("desc")
          .first();

        const unreadCount = currentUser._id === conversation.participant1Id
          ? conversation.unreadCount1
          : conversation.unreadCount2;

        conversationsWithDetails.push({
          _id: conversation._id,
          otherParticipant: {
            _id: otherParticipant._id,
            firstName: otherParticipant.firstName,
            lastName: otherParticipant.lastName,
            role: otherParticipant.role,
            imageUrl: otherParticipant.imageUrl,
            isOnline: isUserOnline(otherParticipant.lastLoginAt),
          },
          lastMessage: lastMessage ? {
            content: lastMessage.content,
            timestamp: lastMessage._creationTime,
            senderName: `${otherParticipant.firstName || ""} ${otherParticipant.lastName || ""}`.trim(),
          } : undefined,
          unreadCount,
          updatedAt: conversation.updatedAt,
        });
    }

    // Remove any null entries (shouldn't happen but for type safety)
    const nonNull = conversationsWithDetails.filter((conv): conv is NonNullable<typeof conv> => conv !== null)
    // Sort by updatedAt descending
    const sorted = nonNull.sort((a, b) => b.updatedAt - a.updatedAt)
    return sorted
  },
});

/**
 * Get messages in a conversation
 */
export const getMessages = query({
  args: {
    conversationId: v.id("conversations"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(v.any()),
    nextCursor: v.optional(v.string()),
    hasMore: v.boolean(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    // Verify user is part of conversation
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) throw new Error("Conversation not found");
    if (conversation.participant1Id !== user._id && conversation.participant2Id !== user._id) {
      throw new Error("Not authorized to view this conversation");
    }

    const { page, isDone, continueCursor } = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id_and_timestamp", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .order("desc")
      .paginate({ cursor: args.cursor ?? null, numItems: args.limit || 50 });

    // Transform messages to include reply context, and a download link for attachments (their
    // fileUrl holds the storage id, which the browser can't open by itself)
    const messagesWithReplies = await Promise.all(
      page.map(async (message) => {
        let replyToMessage = null;
        if (message.replyToMessageId) {
          replyToMessage = await ctx.db.get(message.replyToMessageId);
        }
        return {
          ...message,
          replyToMessage,
          fileDownloadUrl: await attachmentUrl(ctx, message.contentType === "text" ? undefined : message.fileUrl),
        };
      })
    );

    return {
      items: messagesWithReplies,
      nextCursor: isDone ? undefined : continueCursor,
      hasMore: !isDone,
      total: messagesWithReplies.length,
    };
  },
});

/**
 * Mark messages as read
 */
export const markMessagesAsRead = mutation({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Verify user is part of this conversation
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || 
        (conversation.participant1Id !== currentUser._id && 
         conversation.participant2Id !== currentUser._id)) {
      throw new Error("Access denied");
    }

    // Mark unread messages as read
    const unreadMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_id", (q) =>
        q.eq("conversationId", args.conversationId)
      )
      .filter((q) => 
        q.and(
          q.eq(q.field("receiverId"), currentUser._id),
          q.eq(q.field("isReadByReceiver"), false)
        )
      )
      .collect();

    const now = Date.now();
    for (const message of unreadMessages) {
      await ctx.db.patch(message._id, {
        isReadByReceiver: true,
        isRead: true, // Update legacy field too
        readAt: now,
        // Read implies delivered
        ...(message.isDelivered === false ? { isDelivered: true, deliveredAt: now } : {}),
        updatedAt: now,
      });
    }

    // Reset unread count for this user, only when there was something unread: a write here
    // re-runs everyone's conversation and message queries
    const isParticipant1 = conversation.participant1Id === currentUser._id;
    const myUnread = isParticipant1 ? conversation.unreadCount1 : conversation.unreadCount2;
    if (myUnread > 0 || unreadMessages.length > 0) {
      await ctx.db.patch(conversation._id, {
        unreadCount1: isParticipant1 ? 0 : conversation.unreadCount1,
        unreadCount2: isParticipant1 ? conversation.unreadCount2 : 0,
      });
    }

    return {
      success: true,
      message: "Messages marked as read",
    };
  },
});

/**
 * Helper function to check if user is online
 */
function isUserOnline(lastActiveAt?: number): boolean {
  if (!lastActiveAt) return false;
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  return lastActiveAt > fiveMinutesAgo;
}

/**
 * Get conversation details with participant information
 */
export const getConversation = query({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Verify user is participant
    if (conversation.participant1Id !== currentUser._id && conversation.participant2Id !== currentUser._id) {
      throw new Error("Access denied");
    }

    // Get other participant
    const otherParticipantId = conversation.participant1Id === currentUser._id 
      ? conversation.participant2Id 
      : conversation.participant1Id;
    
    const otherParticipant = await ctx.db.get(otherParticipantId);

    return {
      ...conversation,
      otherParticipant,
    };
  },
});

/**
 * Set typing status for a conversation
 */
export const setTyping = mutation({
  args: {
    conversationId: v.id("conversations"),
    isTyping: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Verify user is participant
    if (conversation.participant1Id !== currentUser._id && conversation.participant2Id !== currentUser._id) {
      throw new Error("Access denied");
    }

    // Store typing status in a separate table or update user status
    // For now, we'll store it temporarily with expiration
    // One row per person per conversation, refreshed while they type (it used to add a row on
    // every keystroke and never clean up)
    const rows = await ctx.db
      .query("typingStatus")
      .withIndex("by_conversation_id_and_user", q => q.eq("conversationId", args.conversationId).eq("userId", currentUser._id))
      .take(50);
    const [current, ...leftovers] = rows;
    for (const row of leftovers) await ctx.db.delete(row._id);
    if (args.isTyping) {
      const now = Date.now();
      if (current) {
        await ctx.db.patch(current._id, { isTyping: true, timestamp: now, expiresAt: now + 5000 });
      } else {
        await ctx.db.insert("typingStatus", {
          conversationId: args.conversationId,
          userId: currentUser._id,
          isTyping: true,
          timestamp: now,
          expiresAt: now + 5000, // 5 seconds
        });
      }
    } else if (current) {
      await ctx.db.delete(current._id);
    }
  },
});

/**
 * Get typing status for a conversation
 */
export const getTypingStatus = query({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.object({
    isOtherUserTyping: v.boolean(),
    userId: v.optional(v.id("users")),
    timestamp: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser) {
      throw new Error("User not found");
    }

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Get other participant ID
    const otherParticipantId = conversation.participant1Id === currentUser._id 
      ? conversation.participant2Id 
      : conversation.participant1Id;

    // Check if other user is typing (and not expired)
    const now = Date.now();
    const typingStatus = await ctx.db
      .query("typingStatus")
      .withIndex("by_conversation_user_typing", q => 
        q.eq("conversationId", args.conversationId)
         .eq("userId", otherParticipantId)
         .eq("isTyping", true)
      )
      .filter(q => q.gt(q.field("expiresAt"), now))
      .first();

    return {
      isOtherUserTyping: !!typingStatus,
      userId: typingStatus?.userId,
      timestamp: typingStatus?.timestamp,
      expiresAt: typingStatus?.expiresAt,
    };
  },
});

/**
 * Get total unread messages count for current user
 */
export const getUnreadCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q: any) => q.eq("clerkId", identity.subject))
      .unique();
    if (!currentUser) {
      throw new Error("User not found");
    }
    // Sum unread counts in conversations where current user is participant1 or 2 (by index)
    const [asFirst, asSecond] = await Promise.all([
      ctx.db.query("conversations").withIndex("by_participant1", (q: any) => q.eq("participant1Id", currentUser._id)).take(300),
      ctx.db.query("conversations").withIndex("by_participant2", (q: any) => q.eq("participant2Id", currentUser._id)).take(300),
    ]);
    const conversations = [...asFirst, ...asSecond];

    let total = 0;
    conversations.forEach((conv: any) => {
      if (conv.participant1Id === currentUser._id) {
        total += conv.unreadCount1 ?? 0;
      } else {
        total += conv.unreadCount2 ?? 0;
      }
    });
    return total;
  },
});

interface ConversationWithLastMessage {
  _id: Id<"conversations">;
  participant1Id: Id<"users">;
  participant2Id: Id<"users">;
  lastMessageAt: number;
  unreadCount1: number;
  unreadCount2: number;
  createdAt: number;
  updatedAt: number;
  lastMessage?: {
    _id: Id<"messages">;
    content: string;
    contentType: "text" | "image" | "file";
    timestamp: number;
  };
  otherParticipant: {
    _id: Id<"users">;
    firstName?: string;
    lastName?: string;
    imageUrl?: string;
    lastActiveAt?: number;
    isOnline: boolean;
  };
}

/**
 * Get conversations for a user
 */
export const getConversations = query({
  args: {
    searchTerm: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      participant1Id: v.id("users"),
      participant2Id: v.id("users"),
      lastMessageAt: v.number(),
      unreadCount1: v.number(),
      unreadCount2: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
      lastMessage: v.optional(
        v.object({
          _id: v.id("messages"),
          content: v.string(),
          contentType: v.union(
            v.literal("text"),
            v.literal("image"),
            v.literal("file"),
            v.literal("audio")
          ),
          timestamp: v.number(),
        })
      ),
      otherParticipant: v.object({
        _id: v.id("users"),
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        lastActiveAt: v.optional(v.number()),
        isOnline: v.boolean(),
      }),
    })
  ),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    const cap = Math.min(Math.max(args.limit ?? 300, 1), 300);
    const [asFirst, asSecond] = await Promise.all([
      ctx.db.query("conversations").withIndex("by_participant1", (q) => q.eq("participant1Id", user._id)).take(cap),
      ctx.db.query("conversations").withIndex("by_participant2", (q) => q.eq("participant2Id", user._id)).take(cap),
    ]);
    const conversations = [...asFirst, ...asSecond].slice(0, cap);

    // Get last message and other participant for each conversation
    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conv: any) => {
        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversation_id_and_timestamp", (q) => 
            q.eq("conversationId", conv._id)
          )
          .order("desc")
          .first();

        // Get other participant
        const otherParticipantId = conv.participant1Id === user._id 
          ? conv.participant2Id 
          : conv.participant1Id;
        
        const otherParticipantUser: any = await ctx.db.get(otherParticipantId);
        
        return {
          ...conv,
          lastMessage: lastMessage ? {
            _id: lastMessage._id,
            content: lastMessage.content,
            contentType: lastMessage.contentType,
            timestamp: lastMessage.timestamp,
          } : undefined,
          otherParticipant: {
            _id: otherParticipantId,
            firstName: otherParticipantUser?.firstName || undefined,
            lastName: otherParticipantUser?.lastName || undefined,
            imageUrl: otherParticipantUser?.imageUrl || undefined,
            lastActiveAt: otherParticipantUser?.lastLoginAt || undefined,
            isOnline: isUserOnline(otherParticipantUser?.lastLoginAt),
          },
        };
      })
    );

    return conversationsWithMessages;
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Delivery receipts: the second tick
// ─────────────────────────────────────────────────────────────────────────────

async function signedInUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .first();
}

/**
 * The oldest message for the signed-in person that their app hasn't confirmed yet (null if none).
 * An id rather than a yes/no, so a message landing while the last confirmation was saving still
 * shows up as a change.
 */
export const firstUndeliveredMessage = query({
  args: {},
  handler: async (ctx) => {
    const user = await signedInUser(ctx);
    if (!user) return null;
    const first = await ctx.db
      .query("messages")
      .withIndex("by_receiver_and_delivered", (q) => q.eq("receiverId", user._id).eq("isDelivered", false))
      .first();
    return first?._id ?? null;
  },
});

/** Called by the receiver's app while it's open: their messages have reached their device. */
export const markDelivered = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await signedInUser(ctx);
    if (!user) return 0;
    const waiting = await ctx.db
      .query("messages")
      .withIndex("by_receiver_and_delivered", (q) => q.eq("receiverId", user._id).eq("isDelivered", false))
      .take(200);
    const now = Date.now();
    for (const message of waiting) await ctx.db.patch(message._id, { isDelivered: true, deliveredAt: now });
    return waiting.length;
  },
});
