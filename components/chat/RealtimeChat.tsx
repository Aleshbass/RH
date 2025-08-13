

'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from 'convex/react'
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
  File, 
  Loader2, 
  MessageSquare, 
  MoreVertical, 
  Paperclip, 
  Reply, 
  Send
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Id } from '@/convex/_generated/dataModel'
import { TypingStatus, ChatMessage } from '@/types/chat'
import { useFileUpload } from '@/lib/hooks/useFileUpload'
import MessageContent from './MessageContent'
import MessageStatus from './MessageStatus'

type ChatProps = {
  recipientId: Id<"users">;
  className?: string;
};

const RealtimeChat = ({ recipientId, className }: ChatProps) => {
  // Use Convex query instead of auth store for reliable user data
  const currentUser = useQuery(api.users.getMyUser)
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

  const { uploadFile, isUploading } = useFileUpload({
    onSuccess: () => {
      toast.success("File uploaded successfully");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Get or create conversation with recipient
  const getOrCreateConversation = useMutation(api.chat.getOrCreateConversation)
  const markMessagesAsRead = useMutation(api.chat.markMessagesAsRead)
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
        toast({
          description: "Failed to initialize chat. Please try again.",
          variant: "destructive",
        });
      }
    }
    initConversation()
  }, [recipientId, getOrCreateConversation, currentUser?._id])

  // Get messages for this conversation
  const messages = useQuery(
    api.chat.getMessages,
    conversationId ? { conversationId, limit: 50 } : 'skip'
  );

  // Auto-mark messages as read when conversation is loaded and visible
  useEffect(() => {
    if (conversationId && messages?.items?.length > 0) {
      // Mark messages as read after a short delay to simulate "viewing"
      const timer = setTimeout(() => {
        markMessagesAsRead({ conversationId })
          .catch((error) => {
            console.error('Failed to mark messages as read:', error);
          });
      }, 1000); // 1 second delay to simulate user viewing messages

      return () => clearTimeout(timer);
    }
  }, [conversationId, messages?.items?.length, markMessagesAsRead]);

  // Memoize paginated messages to prevent unnecessary re-renders
  // Get recipient user information
  const recipientUser = useQuery(api.users.getUserById, { userId: recipientId });

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
    const transformedItems = messages.items
      .map((message: { _id: string; senderId: string; content: string; timestamp: number; isDelivered?: boolean; isReadByReceiver?: boolean }) => ({
        ...message,
        senderName: message.senderId === currentUser?._id ? 'You' : recipientUser?.firstName || 'User'
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
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
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
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;
        
        if (isNearBottom) {
          setShowNewMessageIndicator(false);
        }
      }
    }
  };

  // Get typing status
  const typingStatusResult = useQuery(
    api.chat.getTypingStatus,
    conversationId ? { conversationId } : 'skip'
  );

  const typingStatus: TypingStatus = typingStatusResult ?? {
    isOtherUserTyping: false,
  };

  const sendMessage = useMutation(api.chat.sendMessage)
  const setTypingStatus = useMutation(api.chat.setTyping)

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
      toast.error("Failed to send message. Please try again.");
    }
  };

  // Handle message reply
  const handleReplyToMessage = (message: ChatMessage) => {
    setReplyingTo(message);
    inputRef.current?.focus();
  };

  // Handle message selection
  const handleMessageClick = (messageId: string) => {
    setSelectedMessage(selectedMessage === messageId ? null : messageId);
  };

  // Get user initials for avatar fallback
  const getUserInitials = (user: { firstName?: string; lastName?: string } | null) => {
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

  // Mark messages as read when they become visible
  useEffect(() => {
    if (!conversationId || !paginatedMessages.items.length) return;

    const unreadMessages = paginatedMessages.items.filter(
      (msg) => !msg.isReadByReceiver && msg.senderId === recipientId
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
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <CardTitle>Chat</CardTitle>
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
            {paginatedMessages.items.map((message) => {
              const isOwnMessage = message.senderId === currentUser?._id;
              const senderUser = isOwnMessage ? currentUser : recipientUser;
              const isSelected = selectedMessage === message._id;
              
              return (
                <div
                  key={message._id}
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
                    {message.replyToMessageId && (
                      <div className={cn(
                        "mb-1 px-3 py-2 rounded-lg border-l-4 bg-muted/50 text-xs",
                        isOwnMessage ? "border-l-primary" : "border-l-muted-foreground"
                      )}>
                        <p className="font-medium opacity-70">Replying to message</p>
                      </div>
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
                      onClick={() => handleMessageClick(message._id)}
                    >
                      {message.contentType === "text" ? (
                        <MessageContent 
                          content={message.content}
                          isOwnMessage={isOwnMessage}
                          className="text-sm leading-relaxed"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <File className="h-4 w-4" />
                          <span className="text-sm">{message.content}</span>
                          {message.metadata?.fileUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="p-0 h-auto"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(message.metadata.fileUrl, '_blank');
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
                      </div>
                      
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
            <div className="flex-1">
              <Input
                ref={inputRef}
                placeholder="Type a message..."
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
              disabled={!newMessage.trim() || isUploading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RealtimeChat;