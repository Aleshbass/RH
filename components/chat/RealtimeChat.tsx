

'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'

import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import { 
  Download, 
  File as FileIcon, 
  Loader2, 
  MessageSquare, 
  MoreVertical, 
  Paperclip, 
  Reply, 
  Send,
  Star,
  StarOff,
  Edit,
  Trash,
  Mic,
  MicOff,
  Smile
} from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import StorageAudio from '@/components/media/StorageAudio'
import { Id } from '@/convex/_generated/dataModel'
import { TypingStatus, ChatMessage } from '@/types/chat'
import { useFileUpload } from '@/lib/hooks/useFileUpload'
import MessageContent from './MessageContent'
import MessageStatus from './MessageStatus'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'
import { playSound } from '@/lib/sounds'
import { programError } from '@/components/exercise-programs/errors'

/** A text message not confirmed by the server yet. */
type PendingMessage = {
  localId: string
  content: string
  replyToMessageId?: Id<'messages'>
  status: 'sending' | 'failed'
  createdAt: number
}

/** getMessages adds a link to open each attachment (fileUrl holds a storage id). */
const downloadUrlOf = (message: ChatMessage) => (message as ChatMessage & { fileDownloadUrl?: string | null }).fileDownloadUrl ?? null

type ChatProps = {
  recipientId: Id<"users">;
  className?: string;
  /** Fill the parent (e.g. the Messages page pane) with no card or header of its own */
  embedded?: boolean;
  /** "patient" uses the patient portal's ink + lime colours; the default keeps the clinician look */
  variant?: 'default' | 'patient';
};

const RealtimeChat = ({ recipientId, className, embedded = false, variant = 'default' }: ChatProps) => {
  const isPatient = variant === 'patient'
  // Access Convex API modules via unknown-indexers to avoid deep generic instantiation
  const apiUntyped = api as unknown as Record<string, unknown>
  const usersModule = apiUntyped['users'] as Record<string, unknown>
  const chatModule = apiUntyped['chat'] as Record<string, unknown>
  // Use Convex query instead of auth store for reliable user data
  const currentUser = useQueryUntyped(usersModule['getMyUser'])
  const [newMessage, setNewMessage] = useState('')
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null)
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false)
  const [lastMessageCount, setLastMessageCount] = useState(0)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Using this ref in a useEffect for typing indicators
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const typingSentAtRef = useRef(0)
  const markedReadKeyRef = useRef<string | null>(null)
  // Map of messageId -> DOM node for scrolling/highlighting
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  // Voice note recording
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  // Edit state
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null)
  // Starred dialog
  const [starredOpen, setStarredOpen] = useState(false)
  // Text messages on their way to the server: shown straight away as "Sending…", kept as
  // "Failed" with a Retry if the send doesn't go through
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  const { uploadFile, isUploading } = useFileUpload({
    onSuccess: () => {
      toast.success("File uploaded successfully");
    },
    onError: (error) => {
      toast.error(programError(error, "Couldn't upload that file. Please try again."));
    },
  });

  // Get or create conversation with recipient
  const getOrCreateConversation = useMutationUntyped(chatModule['getOrCreateConversation'])
  const markMessagesAsRead = useMutationUntyped(chatModule['markMessagesAsRead'])
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null)

  // Get conversation ID on mount
  useEffect(() => {
    const initConversation = async () => {
      if (!currentUser?._id) return;
      try {
        const result = await getOrCreateConversation({ participantId: recipientId })
        setConversationId(result.conversationId)
      } catch (error: unknown) {
        console.error('Failed to get/create conversation:', error)
        toast.error(programError(error, "Couldn't open this chat. Please try again."))
      }
    }
    initConversation()
  }, [recipientId, getOrCreateConversation, currentUser?._id])

  // Get messages for this conversation
  const messages = useQueryUntyped(
    chatModule['getMessages'],
    conversationId ? { conversationId, limit: 50 } : 'skip'
  );

  // Soft sound when a new message arrives from the other person (not on first load)
  const newestSeenId = useRef<string | null>(null)
  useEffect(() => {
    const newest = (messages?.items as ChatMessage[] | undefined)?.[0]
    if (!newest) return
    if (newestSeenId.current && newest._id !== newestSeenId.current && newest.senderId !== currentUser?._id) {
      playSound('receive')
    }
    newestSeenId.current = newest._id
  }, [messages?.items, currentUser?._id])


  // Memoize paginated messages to prevent unnecessary re-renders
  // Get recipient user information
  const recipientUser = useQueryUntyped(usersModule['getUserPublicProfile'], { userId: recipientId });

  const paginatedMessages = useMemo(() => {
    if (!messages) {
      return {
        items: [],
        nextCursor: undefined,
        hasMore: false,
        total: 0,
      };
    }
    
    // Transform messages to include senderName and reverse order for WhatsApp-like display
    // Keep all original fields (including replyToMessage) by not narrowing the type
    const transformedItems = (messages.items as ChatMessage[])
      .map((message: ChatMessage) => ({
        ...message,
        senderName: message.senderId === currentUser?._id ? 'You' : recipientUser?.firstName || 'User',
      }))
      .reverse(); // Reverse to show oldest first (WhatsApp style)
    
    return {
      ...messages,
      items: transformedItems,
    };
  }, [messages, currentUser, recipientUser]);

  // Auto-scroll to bottom when new messages arrive (only if user is near bottom)
  useEffect(() => {
    if (messagesEndRef.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (scrollContainer) {
        const sc = scrollContainer as HTMLElement;
        const { scrollTop, scrollHeight, clientHeight } = sc;
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100; // 100px threshold
        
        // Check if new messages arrived
        const currentMessageCount = paginatedMessages.items.length;
        const hasNewMessages = currentMessageCount > lastMessageCount;
        
        if (hasNewMessages) {
          if (isNearBottom) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            setShowNewMessageIndicator(false);
          } else {
            // Show new message indicator if user is not at bottom
            setShowNewMessageIndicator(true);
          }
          setLastMessageCount(currentMessageCount);
        }
      }
    }
  }, [paginatedMessages.items, lastMessageCount]);

  // Handle scroll to bottom when clicking new message indicator
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShowNewMessageIndicator(false);
    }
  };

  // Hide new message indicator when user scrolls to bottom manually
  const handleScroll = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (scrollContainer) {
        const sc = scrollContainer as HTMLElement;
        const { scrollTop, scrollHeight, clientHeight } = sc;
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;
        
        if (isNearBottom) {
          setShowNewMessageIndicator(false);
        }
      }
    }
  };

  // Get typing status
  const typingStatusResult = useQueryUntyped(
    chatModule['getTypingStatus'],
    conversationId ? { conversationId } : 'skip'
  );

  const typingStatus: TypingStatus = typingStatusResult ?? {
    isOtherUserTyping: false,
  };

  const sendMessage = useMutationUntyped(chatModule['sendMessage'])
  const toggleReaction = useMutationUntyped(chatModule['toggleReaction'])
  const editMessageMut = useMutationUntyped(chatModule['editMessage'])
  const deleteMessageMut = useMutationUntyped(chatModule['deleteMessage'])
  const toggleStar = useMutationUntyped(chatModule['toggleStar'])
  const setTypingStatus = useMutationUntyped(chatModule['setTyping'])

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    try {
      const result = await uploadFile(file);
      if (!result?.storageId || !conversationId) return;

      // Send message with file
      await sendMessage({
        conversationId,
        content: file.name,
        contentType: "file",
        fileUrl: result.storageId.toString(),
        metadata: {
          originalName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to upload file:', error);
      toast.error("Failed to upload file. Please try again.");
    }
  };

  // Handle message send
  const handleSendMessage = async () => {
    if (editingMessage && conversationId) {
      try {
        await editMessageMut({ messageId: editingMessage.id as Id<"messages">, newContent: newMessage.trim() })
        setEditingMessage(null)
        setNewMessage('')
        typingSentAtRef.current = 0
        await setTypingStatus({ conversationId, isTyping: false })
      } catch (error) {
        console.error('Failed to edit message:', error)
        toast.error('Failed to edit message')
      }
      return
    }

    if (!newMessage.trim() || !conversationId || !currentUser) return;
    // A second tap or Enter while a message is on its way would send it twice
    if (sendingRef.current) return;

    const item: PendingMessage = {
      localId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: newMessage.trim(),
      replyToMessageId: replyingTo?._id,
      status: 'sending',
      createdAt: Date.now(),
    };
    setPending((current) => [...current, item]);
    setNewMessage('');
    setReplyingTo(null);
    await deliver(item);

    // Clear typing status
    typingSentAtRef.current = 0
    setTypingStatus({ conversationId, isTyping: false }).catch(() => {});
  };

  /** Sends one pending message; on failure it stays in the list as "Failed" with a Retry. */
  const deliver = async (item: PendingMessage) => {
    if (!conversationId) return;
    sendingRef.current = true;
    setSending(true);
    try {
      await sendMessage({
        conversationId,
        content: item.content,
        contentType: "text",
        replyToMessageId: item.replyToMessageId,
      });
      playSound('send');
      setPending((current) => current.filter((p) => p.localId !== item.localId));
    } catch (error: unknown) {
      console.error('Failed to send message:', error);
      setPending((current) => current.map((p) => (p.localId === item.localId ? { ...p, status: 'failed' } : p)));
      playSound('error');
      toast.error(programError(error, "Your message wasn't sent. Check your connection and tap Retry."));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const retry = (localId: string) => {
    if (sendingRef.current) return;
    const item = pending.find((p) => p.localId === localId);
    if (!item) return;
    setPending((current) => current.map((p) => (p.localId === localId ? { ...p, status: 'sending' } : p)));
    void deliver({ ...item, status: 'sending' });
  };

  // Handle message reply
  const handleReply = (message: ChatMessage) => {
    setReplyingTo(message);
    inputRef.current?.focus();
  };

  // Handle edit
  const handleEdit = (message: ChatMessage) => {
    setEditingMessage({ id: message._id, content: message.content })
    setNewMessage(message.content)
    inputRef.current?.focus()
  }

  const handleStartEdit = (message: ChatMessage) => {
    handleEdit(message)
  }

  const handleReplyToMessage = (message: ChatMessage) => {
    handleReply(message)
  }

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await deleteMessageMut({ messageId: messageId as Id<'messages'> })
    } catch (error) {
      console.error('Failed to delete message:', error)
      toast.error('Failed to delete message')
    }
  }

  // Reactions
  const EMOJI_OPTIONS = ['👍','❤️','😂','🎉','😮','🙏']
  const handleToggleReaction = async (messageId: string, type: string) => {
    try {
      await toggleReaction({ messageId: messageId as Id<'messages'>, type })
    } catch (error) {
      console.error('Failed to toggle reaction:', error)
    }
  }

  // Starred
  const handleToggleStar = async (messageId: string) => {
    try {
      await toggleStar({ messageId: messageId as Id<'messages'> })
    } catch (error) {
      console.error('Failed to toggle star:', error)
    }
  }


  // Get user initials for avatar fallback
  const getUserInitials = (user: { firstName?: string; lastName?: string } | null | undefined) => {
    if (!user) return 'U';
    return `${user.firstName?.charAt(0) || ''}${user.lastName?.charAt(0) || ''}`.toUpperCase();
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    handleFileUpload(file);
  };

  // Handle typing status
  useEffect(() => {
    if (!conversationId || !newMessage) return;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // "Typing" is sent at most every 3 s, not on every keystroke (each send is a write that
    // queues ahead of the message itself)
    const now = Date.now();
    if (now - typingSentAtRef.current > 3000) {
      typingSentAtRef.current = now;
      setTypingStatus({ conversationId, isTyping: true }).catch(() => {});
    }

    // 3 s after the last keystroke, say they've stopped (once)
    typingTimeoutRef.current = setTimeout(() => {
      if (typingSentAtRef.current) {
        typingSentAtRef.current = 0;
        setTypingStatus({ conversationId, isTyping: false }).catch(() => {});
      }
    }, 3000);

    // Cleanup
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [newMessage, conversationId, setTypingStatus]);

  // Voice recording handlers
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error('Microphone not supported in this browser');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      recordedChunksRef.current = []
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data)
      }
      mr.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, { type: 'audio/webm' })
          const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' })
          const result = await uploadFile(file)
          if (result?.storageId && conversationId) {
            await sendMessage({
              conversationId,
              content: file.name,
              contentType: 'audio',
              fileUrl: String(result.storageId),
              metadata: { originalName: file.name, fileSize: file.size, mimeType: file.type },
            })
          }
        } catch (err) {
          console.error('Failed to send voice note', err)
          toast.error('Failed to send voice note')
        } finally {
          setIsRecording(false)
          stream.getTracks().forEach(t => t.stop())
        }
      }
      mediaRecorderRef.current = mr
      mr.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Mic access error', err)
      toast.error('Microphone permission denied')
    }
  }

  const stopRecording = () => {
    try {
      mediaRecorderRef.current?.stop()
    } catch {}
  }

  // Mark messages as read when they become visible
  useEffect(() => {
    if (!conversationId || !paginatedMessages.items.length) return;

    // Only when something from the other person is unread, and once per set of unread messages
    const unreadMessages = paginatedMessages.items.filter(
      (msg: ChatMessage) => !msg.isReadByReceiver && msg.senderId !== currentUser?._id
    );
    if (unreadMessages.length === 0) return;
    const key = `${conversationId}:${unreadMessages.map((m: ChatMessage) => m._id).join(',')}`;
    if (markedReadKeyRef.current === key) return;
    markedReadKeyRef.current = key;
    markMessagesAsRead({ conversationId }).catch(() => {
      markedReadKeyRef.current = null;
    });
  }, [conversationId, paginatedMessages, markMessagesAsRead, currentUser?._id]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollArea = scrollAreaRef.current;
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [paginatedMessages]);

  // Show loading if user data isn't available yet
  if (currentUser === undefined) {
    return (
      <Card className={cn("w-full h-[600px] flex flex-col", className)}>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading chat...
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show error if user is not found
  if (currentUser === null) {
    return (
      <Card className={cn("w-full h-[600px] flex flex-col", className)}>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">Authentication required</p>
            <p className="text-sm">Please sign in to access chat</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        embedded ? "flex h-full w-full flex-col rounded-none border-0 bg-transparent shadow-none" : "w-full h-[600px] flex flex-col",
        className
      )}
    >
      {embedded ? (
        <div className="flex justify-end px-3 pt-2">
          <Button variant="ghost" size="sm" onClick={() => setStarredOpen(true)} className="h-8 rounded-lg text-neutral-500">
            <Star className="h-4 w-4 mr-1" /> Starred
          </Button>
        </div>
      ) : (
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2 justify-between">
          <MessageSquare className="h-5 w-5" />
          <CardTitle>Chat</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStarredOpen(true)} className="h-8">
              <Star className="h-4 w-4 mr-1" /> Starred
            </Button>
          </div>
        </div>
      </CardHeader>
      )}
      <CardContent className={cn("flex-1 flex flex-col gap-4", embedded ? "min-h-0 p-3 pt-1" : "p-4")}>
        <div className={cn("relative flex-1", embedded && "min-h-0")}>
          <ScrollArea 
            ref={scrollAreaRef} 
            className={cn("w-full", embedded ? "h-full" : "h-[400px] rounded-md border bg-background/50")}
            onScrollCapture={handleScroll}
          >
            <div className={cn("space-y-2 p-4", !embedded && "min-h-[400px]")}>
            {paginatedMessages.items.map((message: ChatMessage) => {
              const isOwnMessage = message.senderId === currentUser?._id;
              const senderUser = isOwnMessage ? currentUser : recipientUser;
              const isSelected = selectedMessage === message._id;
              const isDeleted = !!message.isDeleted;
              const isStarred = Array.isArray(message.starredBy) && currentUser?._id && message.starredBy.includes(currentUser._id);
              
              return (
                <div
                  key={message._id}
                  ref={(el) => { messageRefs.current[String(message._id)] = el }}
                  className={cn(
                    "flex items-end gap-2 group",
                    isOwnMessage ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={senderUser?.imageUrl} />
                    <AvatarFallback className="text-xs">
                      {getUserInitials(senderUser)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className={cn("flex flex-col max-w-[70%]", isOwnMessage ? "items-end" : "items-start")}>
                    {/* Reply context */}
                    {(message.replyToMessage || message.replyToMessageId) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const targetId = String(message.replyToMessage?._id || message.replyToMessageId);
                          const el = targetId ? messageRefs.current[targetId] : null;
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setSelectedMessage(targetId);
                            setTimeout(() => setSelectedMessage(null), 2000);
                          }
                        }}
                        className={cn(
                          "mb-1 px-3 py-2 rounded-lg border-l-4 bg-muted/50 text-left",
                          "hover:bg-muted/70 transition-colors",
                          isOwnMessage ? "border-l-primary" : "border-l-muted-foreground"
                        )}
                      >
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Replying to</p>
                        <p className="text-xs font-medium opacity-80">
                          {message.replyToMessage
                            ? (message.replyToMessage.senderId === currentUser?._id ? 'You' : (recipientUser?.firstName || 'User'))
                            : 'Message'}
                        </p>
                        {message.replyToMessage?.content && (
                          <p className="text-xs line-clamp-2 opacity-80">
                            {message.replyToMessage.content}
                          </p>
                        )}
                      </button>
                    )}
                    
                    <div
                      className={cn(
                        "relative rounded-2xl px-4 py-2 cursor-pointer transition-all duration-200",
                        isOwnMessage
                          ? isPatient
                            ? "bg-pt-primary text-pt-on-primary rounded-br-md"
                            : "bg-rh-teal text-white rounded-br-md dark:bg-rh-aqua dark:text-rh-night"
                          : isPatient
                            ? "bg-pt-sunken text-pt-ink rounded-bl-md"
                            : "bg-rh-canvas text-rh-night rounded-bl-md dark:bg-white/[0.06] dark:text-neutral-100",
                        isSelected && "ring-2 ring-primary/50 shadow-lg scale-[1.02]",
                        "hover:shadow-md"
                      )}
                        onClick={() => handleReply(message)}
                    >
                      {isDeleted ? (
                        <div className="text-xs italic opacity-70">This message was deleted</div>
                      ) : message.contentType === "text" ? (
                        <MessageContent 
                          content={message.content}
                          isOwnMessage={isOwnMessage}
                          className="text-sm leading-relaxed"
                        />
                      ) : message.contentType === "audio" ? (
                        <div className="w-64">
                          <StorageAudio storageId={message.fileUrl} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <FileIcon className="h-4 w-4" />
                          <span className="text-sm">{message.content}</span>
                          {downloadUrlOf(message) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-0 h-auto"
                              aria-label={`Download ${message.content}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const url = downloadUrlOf(message);
                                if (url) window.open(url, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          ) : message.fileUrl ? (
                            <span className="text-[11px] opacity-70">File no longer available</span>
                          ) : null}
                        </div>
                      )}
                      
                      <div className={cn(
                        "flex items-center gap-1 mt-1",
                        isOwnMessage ? "justify-end" : "justify-start"
                      )}>
                        <MessageStatus
                          isDelivered={message.isDelivered ?? true}
                          isReadByReceiver={message.isReadByReceiver ?? false}
                          timestamp={message.timestamp}
                          isOwnMessage={isOwnMessage}
                        />
                        {message.editedAt && !isDeleted && (
                          <span className="ml-2 text-[10px] opacity-70">(edited)</span>
                        )}
                        {isStarred && (
                          <Star className="h-3 w-3 ml-1 text-yellow-400" />
                        )}
                      </div>
                      {/* Reactions row */}
                      {!isDeleted && Array.isArray(message.reactions) && message.reactions.length > 0 && (
                        <div className={cn("mt-1 flex gap-1 flex-wrap", isOwnMessage ? 'justify-end' : 'justify-start')}>
                          {Object.entries(
                            (message.reactions ?? []).reduce((acc: Record<string, number>, r) => {
                              acc[r.type] = (acc[r.type] || 0) + 1; return acc
                            }, {} as Record<string, number>)
                          ).map(([type, count]) => (
                            <button
                              key={type}
                              className="text-xs px-2 py-0.5 rounded-full bg-background/70 border hover:bg-background"
                              onClick={(e) => { e.stopPropagation(); handleToggleReaction(message._id, type) }}
                            >
                              {type} <span className="ml-1 opacity-70">{count as number}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      
                      {/* Message actions dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "absolute -top-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 p-0",
                              isOwnMessage ? "-left-8" : "-right-8"
                            )}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => handleReplyToMessage(message)}>
                            <Reply className="h-4 w-4 mr-2" />
                            Reply
                          </DropdownMenuItem>
                          {!isDeleted && (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <Smile className="h-4 w-4 mr-2" /> React
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {EMOJI_OPTIONS.map((e) => (
                                  <DropdownMenuItem key={e} onClick={() => handleToggleReaction(message._id, e)}>
                                    {e}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          )}
                          {!isDeleted && isOwnMessage && message.contentType === 'text' && (
                            <DropdownMenuItem onClick={() => handleStartEdit(message)}>
                              <Edit className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                          )}
                          {isOwnMessage && (
                            <DropdownMenuItem onClick={() => handleDeleteMessage(message._id)}>
                              <Trash className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleToggleStar(message._id)}>
                            {isStarred ? <StarOff className="h-4 w-4 mr-2" /> : <Star className="h-4 w-4 mr-2" />}
                            {isStarred ? 'Unstar' : 'Star'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Messages on their way, or that didn't go through */}
            {pending.map((item) => (
              <div key={item.localId} className="flex flex-row-reverse items-end gap-2">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={currentUser?.imageUrl} />
                  <AvatarFallback className="text-xs">{getUserInitials(currentUser)}</AvatarFallback>
                </Avatar>
                <div className="flex max-w-[70%] flex-col items-end">
                  <div
                    className={cn(
                      "rounded-2xl rounded-br-md px-4 py-2",
                      item.status === 'failed'
                        ? "border border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-100"
                        : isPatient
                          ? "bg-pt-primary/70 text-pt-on-primary"
                          : "bg-rh-teal/70 text-white dark:bg-rh-aqua/70 dark:text-rh-night"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.content}</p>
                  </div>
                  {item.status === 'sending' ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Sending…
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex items-center gap-2 text-[11px] text-rose-600 dark:text-rose-300">
                      Failed
                      <button type="button" className="font-semibold underline underline-offset-2" onClick={() => retry(item.localId)} disabled={sending}>
                        Retry
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground underline underline-offset-2"
                        onClick={() => setPending((current) => current.filter((p) => p.localId !== item.localId))}
                      >
                        Discard
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}

            {typingStatus.isOtherUserTyping && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-4">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={recipientUser?.imageUrl} />
                  <AvatarFallback className="text-xs">
                    {getUserInitials(recipientUser)}
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-2xl px-4 py-2 rounded-bl-md">
                  <div className="flex items-center gap-1">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        
        {/* New message indicator */}
        {showNewMessageIndicator && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
            <Button
              onClick={scrollToBottom}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition-all duration-200",
                isPatient
                  ? "bg-pt-primary text-pt-on-primary shadow-pt-lift hover:bg-pt-primary-hover"
                  : "bg-rh-teal text-white shadow-lg hover:shadow-xl"
              )}
              size="sm"
            >
              ↓ New messages
            </Button>
          </div>
        )}
      </div>
        <div className="px-4 pb-4">
          {/* Reply preview */}
          {replyingTo && (
            <div className="mb-2 p-3 bg-muted/50 rounded-lg border-l-4 border-l-primary">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Replying to {replyingTo.senderId === currentUser?._id ? 'yourself' : recipientUser?.firstName || 'User'}
                  </p>
                  <p className="text-sm truncate max-w-[300px]">{replyingTo.content}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReplyingTo(null)}
                  className="h-6 w-6 p-0"
                >
                  ×
                </Button>
              </div>
            </div>
          )}
          
          <div className="flex items-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="mb-1"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant={isRecording ? 'destructive' : 'ghost'}
              size="icon"
              onClick={() => (isRecording ? stopRecording() : startRecording())}
              className="mb-1"
              title={isRecording ? 'Stop recording' : 'Record voice note'}
            >
              {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            <div className="flex-1">
              <Input
                ref={inputRef}
                placeholder={editingMessage ? 'Edit your message...' : 'Type a message...'}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className={cn(
                  "rounded-full border-2 transition-colors",
                  isPatient ? "border-pt-line-strong bg-pt-surface text-pt-ink placeholder:text-pt-faint focus:border-pt-ink" : "focus:border-primary"
                )}
              />
            </div>
            <Button
              variant="default"
              size="icon"
              className={cn("shrink-0 rounded-full", isPatient && "bg-pt-primary text-pt-on-primary hover:bg-pt-primary-hover")}
              onClick={handleSendMessage}
              aria-label={sending ? 'Sending' : 'Send'}
              disabled={!newMessage.trim() || !conversationId || sending || isUploading || isRecording}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          {editingMessage && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Editing message</span>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => { setEditingMessage(null); setNewMessage('') }}>Cancel</Button>
            </div>
          )}
        </div>
      </CardContent>

      {/* Starred messages dialog */}
      <StarredMessagesDialog
        open={starredOpen}
        onOpenChange={setStarredOpen}
        conversationId={conversationId}
        onGoToMessage={(id) => {
          setStarredOpen(false)
          setTimeout(() => {
            const el = id ? messageRefs.current[String(id)] : null
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' })
              setSelectedMessage(String(id))
              setTimeout(() => setSelectedMessage(null), 2000)
            }
          }, 200)
        }}
      />
    </Card>
  );
};

export default RealtimeChat;

// Starred dialog component (local)
function StarredMessagesDialog({ open, onOpenChange, conversationId, onGoToMessage }: { open: boolean; onOpenChange: (o: boolean) => void; conversationId: Id<'conversations'> | null; onGoToMessage: (id: string) => void }) {
  const apiUntyped = api as unknown as Record<string, unknown>
  const chatModuleLocal = apiUntyped['chat'] as Record<string, unknown>
  const result = useQueryUntyped(
    chatModuleLocal['getStarredMessages'],
    open && conversationId ? { conversationId } : 'skip'
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Starred messages</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto space-y-3">
          {result === undefined && (
            <div className="text-sm text-muted-foreground">Loading...</div>
          )}
          {result?.items?.length === 0 && (
            <div className="text-sm text-muted-foreground">No starred messages</div>
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {result?.items?.map((m: any) => (
            <div key={m._id} className="p-3 border rounded-lg bg-background/50">
              {m.replyToMessage && (
                <div className="mb-1 px-3 py-2 rounded-lg border-l-4 bg-muted/50 text-xs border-l-muted-foreground">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Replying to</p>
                  <p className="text-xs opacity-80 line-clamp-1">{m.replyToMessage.content}</p>
                </div>
              )}
              <div className="text-sm">{m.content}</div>
              <div className="mt-2">
                <Button variant="ghost" size="sm" onClick={() => onGoToMessage(m._id)}>Go to message</Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}