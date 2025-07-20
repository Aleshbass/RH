'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  MessageSquare, 
  Send, 
  Paperclip,
  User,
  CheckCheck,
  Clock,
  File,
  Download,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import { useFileUpload } from '@/lib/hooks/useFileUpload'
import { Id } from '@/convex/_generated/dataModel'
import { ChatPaginationResult, TypingStatus, ChatMessage } from '@/types/chat'

type Message = Omit<ChatMessage, 'isRead' | 'createdAt' | 'updatedAt'> & {
  senderName: string;
};

type ChatProps = {
  recipientId: Id<"users">;
  className?: string;
};

const RealtimeChat = ({ recipientId, className }: ChatProps) => {
  // Use Convex query instead of auth store for reliable user data
  const currentUser = useQuery(api.users.getMyUser)
  const { toast } = useToast()
  const [newMessage, setNewMessage] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<File[]>([])
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout>()

  const { uploadFile, isUploading } = useFileUpload({
    onSuccess: () => {
      toast({
        title: "Success",
        description: "File uploaded successfully",
        variant: "default",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get or create conversation with recipient
  const getOrCreateConversation = useMutation(api.chat.getOrCreateConversation)
  const [conversationId, setConversationId] = useState<Id<"conversations"> | null>(null)

  // Get conversation ID on mount
  useEffect(() => {
    const initConversation = async () => {
      if (!currentUser?._id) return;
      try {
        const result = await getOrCreateConversation({ participantId: recipientId })
        setConversationId(result.conversationId)
      } catch (error) {
        console.error('Failed to get/create conversation:', error)
        toast({
          title: "Error",
          description: "Failed to initialize chat. Please try again.",
          variant: "destructive",
        });
      }
    }
    initConversation()
  }, [recipientId, getOrCreateConversation, toast, currentUser?._id])

  // Get messages for the conversation
  const messages = useQuery(
    api.chat.getMessages,
    conversationId ? { conversationId, limit: 50 } : 'skip'
  );

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
    
    // Transform messages to include senderName
    const transformedItems = messages.items.map((message: any) => ({
      ...message,
      senderName: message.senderId === currentUser?._id ? 
        `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim() || 'You' :
        `${recipientUser?.firstName || ''} ${recipientUser?.lastName || ''}`.trim() || 'Other User'
    }));
    
    return {
      ...messages,
      items: transformedItems,
    };
  }, [messages, currentUser, recipientUser]);

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
  const markMessagesAsRead = useMutation(api.chat.markMessagesAsRead)

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
      toast({
        title: "Error",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle message send
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversationId) return;

    try {
      await sendMessage({
        conversationId,
        content: newMessage,
        contentType: "text",
      });
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
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
      (msg: any) => !msg.isReadByReceiver && msg.senderId === recipientId
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
        <ScrollArea ref={scrollAreaRef} className="flex-1">
          {paginatedMessages.items.map((message: any) => (
            <div
              key={message._id}
              className={cn(
                "flex items-start gap-2 mb-4",
                message.senderId === recipientId ? "flex-row" : "flex-row-reverse"
              )}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  "rounded-lg p-3 max-w-[70%]",
                  message.senderId === recipientId
                    ? "bg-muted"
                    : "bg-primary text-primary-foreground"
                )}
              >
                {message.contentType === "text" ? (
                  <p className="text-sm">{message.content}</p>
                ) : (
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4" />
                    <span className="text-sm">{message.content}</span>
                    {message.fileUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="p-0"
                        onClick={() => window.open(message.fileUrl, '_blank')}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs opacity-50">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </span>
                  {message.senderId !== recipientId && (
                    message.isReadByReceiver ? (
                      <CheckCheck className="h-3 w-3 text-blue-500" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
          {typingStatus.isOtherUserTyping && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Typing...
            </div>
          )}
        </ScrollArea>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
          />
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
          />
          <Button
            variant="default"
            size="icon"
            className="shrink-0"
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isUploading}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RealtimeChat;