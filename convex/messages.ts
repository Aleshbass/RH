import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Send a message between users
export const sendMessage = mutation({
    args: {
        receiverId: v.id("users"),
        content: v.string(),
        contentType: v.union(
            v.literal("text"),
            v.literal("image"),
            v.literal("file"),
            v.literal("audio")
        ),
        fileUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const sender = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!sender) throw new Error("User not found");

        // Check if conversation exists, or create one
        let conversation = await ctx.db
            .query("conversations")
            .withIndex("by_participants", (q) =>
                q.eq("participant1Id", sender._id).eq("participant2Id", args.receiverId)
            )
            .first();

        if (!conversation) {
            conversation = await ctx.db
                .query("conversations")
                .withIndex("by_participants", (q) =>
                    q.eq("participant1Id", args.receiverId).eq("participant2Id", sender._id)
                )
                .first();
        }

        let conversationId;

        if (!conversation) {
            conversationId = await ctx.db.insert("conversations", {
                participant1Id: sender._id,
                participant2Id: args.receiverId,
                lastMessageAt: Date.now(),
                unreadCount1: 0,
                unreadCount2: 1, // Receiver has 1 unread
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        } else {
            conversationId = conversation._id;
            // Update conversation timestamp and unread count
            const isParticipant1 = conversation.participant1Id === sender._id;
            await ctx.db.patch(conversationId, {
                lastMessageAt: Date.now(),
                unreadCount1: isParticipant1 ? conversation.unreadCount1 : conversation.unreadCount1 + 1,
                unreadCount2: isParticipant1 ? conversation.unreadCount2 + 1 : conversation.unreadCount2,
                updatedAt: Date.now(),
            });
        }

        // Insert message
        const messageId = await ctx.db.insert("messages", {
            conversationId,
            senderId: sender._id,
            receiverId: args.receiverId,
            content: args.content,
            contentType: args.contentType,
            fileUrl: args.fileUrl,
            timestamp: Date.now(),
            isReadByReceiver: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // Log to audit logs
        await ctx.db.insert("auditLogs", {
            actorUserId: sender._id,
            action: "message_sent",
            timestamp: Date.now(),
            targetEntityType: "user",
            targetEntityId: args.receiverId,
            details: { conversationId, messageId },
        });

        return messageId;
    },
});

// Get messages for a conversation with a specific user
export const getConversation = query({
    args: {
        otherUserId: v.id("users"),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return [];

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!user) return [];

        // Find conversation
        let conversation = await ctx.db
            .query("conversations")
            .withIndex("by_participants", (q) =>
                q.eq("participant1Id", user._id).eq("participant2Id", args.otherUserId)
            )
            .first();

        if (!conversation) {
            conversation = await ctx.db
                .query("conversations")
                .withIndex("by_participants", (q) =>
                    q.eq("participant1Id", args.otherUserId).eq("participant2Id", user._id)
                )
                .first();
        }

        if (!conversation) return [];

        const messages = await ctx.db
            .query("messages")
            .withIndex("by_conversation_id_and_timestamp", (q) =>
                q.eq("conversationId", conversation._id)
            )
            .order("desc")
            .take(args.limit || 50);

        return messages.reverse();
    },
});

// Mark messages as read
export const markAsRead = mutation({
    args: {
        conversationId: v.id("conversations"),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
            .first();

        if (!user) throw new Error("User not found");

        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation) throw new Error("Conversation not found");

        // Verify participant
        if (conversation.participant1Id !== user._id && conversation.participant2Id !== user._id) {
            throw new Error("Unauthorized");
        }

        // Reset unread count for this user
        const isParticipant1 = conversation.participant1Id === user._id;
        await ctx.db.patch(args.conversationId, {
            unreadCount1: isParticipant1 ? 0 : conversation.unreadCount1,
            unreadCount2: isParticipant1 ? conversation.unreadCount2 : 0,
        });

        // Mark messages as read
        const unreadMessages = await ctx.db
            .query("messages")
            .withIndex("by_conversation_and_receiver_and_read", (q) =>
                q.eq("conversationId", args.conversationId)
                    .eq("receiverId", user._id)
                    .eq("isReadByReceiver", false)
            )
            .collect();

        for (const msg of unreadMessages) {
            await ctx.db.patch(msg._id, {
                isReadByReceiver: true,
                readAt: Date.now(),
            });
        }
    },
});
