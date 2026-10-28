

'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
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
  Smile,
  RotateCcw,
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

/** A file on its way: shown straight away with progress, kept with a Retry if it fails. */
type PendingAttachment = {
  localId: string
  file: File
  status: 'uploading' | 'failed'
  error?: string
}

const MAX_FILE_BYTES = 25 * 1024 * 1024

function fileSizeLabel(bytes: number | undefined) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Phone photos are often 3–10 MB: shrink them to at most 2000 px (JPEG) before upload, so they
 * send quickly on mobile data. Anything that can't be decoded here is sent as it is.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600_000) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff' // transparent PNGs get a white background in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
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
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  // Only mark messages read while this chat is really in front of the person
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const update = () => setOnScreen(document.visibilityState === 'visible' && document.hasFocus())
    update()
    window.addEventListener('focus', update)
    window.addEventListener('blur', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.removeEventListener('focus', update)
      window.removeEventListener('blur', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  // Upload progress and errors show on the file's own bubble, not as toasts
  const { uploadFile, progress: uploadProgress } = useFileUpload();

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

  /** Upload a file and send it as a message. Photos are shrunk first and shown as pictures. */
  const sendAttachment = async (original: File, localId = `file-${Date.now()}`) => {
    if (!conversationId) return;
    setAttachment({ localId, file: original, status: 'uploading' });
    const file = original.type.startsWith('image/') ? await shrinkImage(original) : original;
    const contentType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file';

    let storageId: string;
    try {
      const result = await uploadFile(file);
      if (!result?.storageId) throw new Error('No file id came back');
      storageId = String(result.storageId);
    } catch {
      setAttachment({ localId, file: original, status: 'failed', error: "Couldn't upload. Check your connection and try again." });
      playSound('error');
      return;
    }

    try {
      await sendMessage({
        conversationId,
        content: original.name,
        contentType,
        fileUrl: storageId,
        metadata: { originalName: original.name, fileSize: file.size, mimeType: file.type },
      });
      setAttachment(null);
      playSound('send');
    } catch (error) {
      setAttachment({ localId, file: original, status: 'failed', error: programError(error, "Uploaded, but the message didn't send. Try again.") });
      playSound('error');
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
    const file = event.target.files?.[0];
    // Clear the picker so choosing the same file again (e.g. after a failure) still works
    event.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`${file.name} is ${fileSizeLabel(file.size)}. Files can be up to 25 MB.`);
      playSound('error');
      return;
    }
    void sendAttachment(file);
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
    if (!conversationId || !onScreen || messages === undefined) return;

    // Once when the conversation opens (that also clears an unread count with nothing behind it,
    // which otherwise kept the Messages badge up), then once per new set of unread messages.
    // The server only writes when something was unread.
    const unreadMessages = paginatedMessages.items.filter(
      (msg: ChatMessage) => !msg.isReadByReceiver && msg.senderId !== currentUser?._id
    );
    const opened = markedReadKeyRef.current?.split(':')[0] === conversationId;
    if (opened && unreadMessages.length === 0) return;
    const key = `${conversationId}:${unreadMessages.map((m: ChatMessage) => m._id).join(',')}`;
    if (markedReadKeyRef.current === key) return;
    markedReadKeyRef.current = key;
    markMessagesAsRead({ conversationId }).catch(() => {
      markedReadKeyRef.current = null;
    });
  }, [conversationId, messages, paginatedMessages, markMessagesAsRead, currentUser?._id, onScreen]);

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
                            : "bg-rh-lime text-rh-ink rounded-br-md dark:bg-rh-lime dark:text-rh-ink"
                          : isPatient
                            ? "bg-pt-sunken text-pt-ink rounded-bl-md"
                            : "bg-rh-canvas text-rh-ink rounded-bl-md dark:bg-white/[0.06] dark:text-neutral-100",
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
                      ) : message.contentType === "image" && downloadUrlOf(message) ? (
                        <button
                          type="button"
                          className="-mx-2 -mt-1 block overflow-hidden rounded-xl"
                          aria-label={`Open ${message.content}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(downloadUrlOf(message)!, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <Image
                            src={downloadUrlOf(message)!}
                            alt={message.content}
                            width={260}
                            height={200}
                            unoptimized
                            className="h-auto max-h-64 w-full max-w-[260px] object-cover"
                          />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!downloadUrlOf(message)}
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = downloadUrlOf(message);
                            if (url) window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                          className={cn(
                            "-mx-1 flex min-w-[200px] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition",
                            isOwnMessage ? (isPatient ? "bg-white/10 hover:bg-white/15" : "bg-black/[0.06] hover:bg-black/10") : "bg-white hover:bg-white/80 dark:bg-white/[0.06]"
                          )}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 text-rh-ink dark:bg-white/10 dark:text-white">
                            <FileIcon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{message.content}</span>
                            <span className="block text-[11px] opacity-70">
                              {downloadUrlOf(message)
                                ? [fileSizeLabel((message.metadata as { fileSize?: number } | undefined)?.fileSize), 'Tap to open'].filter(Boolean).join(' · ')
                                : 'No longer available'}
                            </span>
                          </span>
                          {downloadUrlOf(message) && <Download className="h-4 w-4 shrink-0 opacity-60" />}
                        </button>
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
                          variant={variant}
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
                          : "bg-rh-lime/60 text-rh-ink"
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

            {/* A file on its way, or one that didn't go through */}
            {attachment && (
              <div className="flex flex-row-reverse items-end gap-2">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarImage src={currentUser?.imageUrl} />
                  <AvatarFallback className="text-xs">{getUserInitials(currentUser)}</AvatarFallback>
                </Avatar>
                <div className="flex max-w-[70%] flex-col items-end">
                  <div
                    className={cn(
                      "w-60 rounded-2xl rounded-br-md px-3 py-2.5",
                      attachment.status === 'failed'
                        ? "border border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-400/40 dark:bg-rose-400/10 dark:text-rose-100"
                        : isPatient
                          ? "bg-pt-primary/80 text-pt-on-primary"
                          : "bg-rh-lime/60 text-rh-ink"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <FileIcon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{attachment.file.name}</span>
                        <span className="block text-[11px] opacity-70">{fileSizeLabel(attachment.file.size)}</span>
                      </span>
                    </div>
                    {attachment.status === 'uploading' && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/10">
                        <div className="h-full rounded-full bg-current transition-[width] duration-300" style={{ width: `${Math.max(5, uploadProgress)}%` }} />
                      </div>
                    )}
                  </div>
                  {attachment.status === 'uploading' ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Sending file… {uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : ''}
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex flex-wrap items-center justify-end gap-2 text-[11px] text-rose-600 dark:text-rose-300">
                      {attachment.error}
                      <button type="button" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2" onClick={() => void sendAttachment(attachment.file, attachment.localId)}>
                        <RotateCcw className="h-3 w-3" /> Retry
                      </button>
                      <button type="button" className="text-muted-foreground underline underline-offset-2" onClick={() => setAttachment(null)}>
                        Discard
                      </button>
                    </span>
                  )}
                </div>
              </div>
            )}

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
                  : "bg-rh-lime text-rh-ink shadow-lg hover:shadow-xl"
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
              aria-label="Attach a photo or file"
              title="Attach a photo or file (up to 25 MB)"
              disabled={!conversationId || attachment?.status === 'uploading'}
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
              disabled={!newMessage.trim() || !conversationId || sending || isRecording}
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