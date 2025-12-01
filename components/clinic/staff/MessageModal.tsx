'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Send, User } from 'lucide-react'
import { format } from 'date-fns'
import type { Id } from '@/convex/_generated/dataModel'

interface MessageModalProps {
    recipientId: Id<'users'> | null
    recipientName: string
    isOpen: boolean
    onClose: () => void
}

export default function MessageModal({ recipientId, recipientName, isOpen, onClose }: MessageModalProps) {
    const [newMessage, setNewMessage] = useState('')
    const scrollRef = useRef<HTMLDivElement>(null)

    const messages = useQuery(api.messages.getConversation,
        recipientId ? { otherUserId: recipientId } : "skip"
    )

    const sendMessage = useMutation(api.messages.sendMessage)
    const markAsRead = useMutation(api.messages.markAsRead)

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    // Mark as read when opening
    useEffect(() => {
        if (isOpen && messages && messages.length > 0) {
            const conversationId = messages[0].conversationId
            markAsRead({ conversationId })
        }
    }, [isOpen, messages, markAsRead])

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!newMessage.trim() || !recipientId) return

        try {
            await sendMessage({
                receiverId: recipientId,
                content: newMessage,
                contentType: 'text',
            })
            setNewMessage('')
        } catch (error) {
            console.error("Failed to send message", error)
        }
    }

    if (!recipientId) return null

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback>
                                {recipientName[0]}
                            </AvatarFallback>
                        </Avatar>
                        <span>{recipientName}</span>
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                    <div className="space-y-4">
                        {messages?.length === 0 && (
                            <div className="text-center text-gray-500 py-8 text-sm">
                                No messages yet. Start the conversation!
                            </div>
                        )}
                        {messages?.map((msg: any) => {
                            const isMe = msg.senderId !== recipientId
                            return (
                                <div
                                    key={msg._id}
                                    className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${isMe
                                            ? 'bg-primary text-primary-foreground'
                                            : 'bg-gray-100 text-gray-900'
                                            }`}
                                    >
                                        <p>{msg.content}</p>
                                        <span className={`text-[10px] block mt-1 ${isMe ? 'text-primary-foreground/70' : 'text-gray-500'
                                            }`}>
                                            {format(new Date(msg.timestamp), 'HH:mm')}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>

                <form onSubmit={handleSend} className="p-4 border-t flex gap-2">
                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={!newMessage.trim()}>
                        <Send className="h-4 w-4" />
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    )
}
