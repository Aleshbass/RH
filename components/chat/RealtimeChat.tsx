

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
} from 'lucide-react'
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

type ChatProps = {
  recipientId: Id<"users">;
  className?: string;
};

const RealtimeChat = ({ recipientId, className }: ChatProps) => {
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

  const { uploadFile, isUploading } = useFileUpload({
    onSuccess: () => {
      toast.success("File uploaded successfully");
    },
    onError: (error) => {
      toast.error(error.message);
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
        toast.error("Failed to initialize chat. Please try again.")
      }
    }
    initConversation()
  }, [recipientId, getOrCreateConversation, currentUser?._id])

  // Get messages for this conversation
  const messages = useQueryUntyped(
    chatModule['getMessages'],
    conversationId ? { conversationId, limit: 50 } : 'skip'
  );

  // Auto-mark messages as read when conversation is loaded and visible
  useEffect(() => {
    if (conversationId && messages?.items && messages.items.length > 0) {
      // Mark messages as read after a short delay to simulate "viewing"
      const timer = setTimeout(() => {
        markMessagesAsRead({ conversationId })
          .catch((error: unknown) => {
            console.error('Failed to mark messages as read:', error)
          });
      }, 1000); // 1 second delay to simulate user viewing messages

      return () => clearTimeout(timer);
    }
  }, [conversationId, messages?.items?.length, markMessagesAsRead, messages?.items]);

  // Memoize paginated messages to prevent unnecessary re-renders
  // Get recipient user information
  const recipientUser = useQueryUntyped(usersModule['getUserById'], { userId: recipientId });

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
        await setTypingStatus({ conversationId, isTyping: false })
      } catch (error) {
        console.error('Failed to edit message:', error)
        toast.error('Failed to edit message')
      }
      return
    }

    if (!newMessage.trim() || !conversationId || !currentUser) return;

    try {
      await sendMessage({
        conversationId,
        content: newMessage.trim(),
        contentType: "text",
        replyToMessageId: replyingTo?._id,
      });
      setNewMessage('');
      setReplyingTo(null);
      
      // Clear typing status
      await setTypingStatus({
        conversationId,
        isTyping: false,
      });
    } catch (error: unknown) {
      console.error('Failed to send message:', error);
    }
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

    // Set typing status to true
    setTypingStatus({ conversationId, isTyping: true });

    // Set timeout to clear typing status
    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatus({ conversationId, isTyping: false });
    }, 3000); // Clear after 3 seconds of no typing

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

    const unreadMessages = paginatedMessages.items.filter(
      (msg: ChatMessage) => !msg.isReadByReceiver && msg.senderId === recipientId
    );

    if (unreadMessages.length > 0) {
      markMessagesAsRead({ conversationId });
    }
  }, [conversationId, paginatedMessages, markMessagesAsRead, recipientId]);

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
    <Card className={cn("w-full h-[600px] flex flex-col", className)}>
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
      <CardContent className="flex-1 flex flex-col gap-4 p-4">
        <div className="relative flex-1">
          <ScrollArea 
            ref={scrollAreaRef} 
            className="h-[400px] w-full rounded-md border bg-background/50"
            onScrollCapture={handleScroll}
          >
            <div className="space-y-2 p-4 min-h-[400px]">
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
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md",
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
                          {(message.fileUrl || (message.metadata as { fileUrl?: string })?.fileUrl) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-0 h-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                const url = (message.metadata as { fileUrl?: string })?.fileUrl || message.fileUrl;
                                if (url) window.open(url, '_blank');
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
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
              className="bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 rounded-full px-4 py-2 text-sm"
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
                className="rounded-full border-2 focus:border-primary transition-colors"
              />
            </div>
            <Button
              variant="default"
              size="icon"
              className="shrink-0 rounded-full"
              onClick={handleSendMessage}
              disabled={(!!editingMessage && !newMessage.trim()) || (!editingMessage && !newMessage.trim()) || isUploading || isRecording}
            >
              <Send className="h-4 w-4" />
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