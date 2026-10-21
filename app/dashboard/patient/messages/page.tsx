'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import RealtimeChat from '@/components/chat/RealtimeChat'
import { Card, CardContent } from '@/components/ui/card'
import { MessageSquare, Users, Plus, Search, ChevronLeft } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Id } from '@/convex/_generated/dataModel'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { programError } from '@/components/exercise-programs/errors'

// Shape returned by api.chat.getMyConversations
interface ConversationWithParticipant {
  _id: Id<"conversations">;
  otherParticipant: {
    _id: Id<"users">;
    firstName?: string;
    lastName?: string;
    role?: string;
    imageUrl?: string;
    isOnline?: boolean;
  };
  lastMessage?: {
    content: string;
    timestamp: number;
    senderName: string;
  };
  unreadCount: number;
  updatedAt: number;
}

const ROLE_LABELS: Record<string, string> = {
  physiotherapist: 'Physiotherapist',
  clinic_owner: 'Clinic',
  clinic_staff: 'Clinic team',
  admin: 'Rehabify support',
}

// Shape returned by api.patientInvitations.getMyPhysiotherapists (only the fields used here)
type MyPhysiotherapist = { _id: Id<"users">; firstName?: string; lastName?: string; clinic?: { name?: string } | null }

export default function PatientMessagesPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | null>(null)
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false)
  const [newConversationPtId, setNewConversationPtId] = useState<Id<"users"> | ''>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')

  // Current user
  const currentUser = useQuery(api.users.getMyUser)

  // Conversations
  const conversations = useQuery(
    api.chat.getMyConversations,
    currentUser ? {} : 'skip'
  ) as ConversationWithParticipant[] | undefined

  // The patient's physiotherapists (the query is patients only, so wait for the account)
  const myPhysiotherapists = useQuery(
    api.patientInvitations.getMyPhysiotherapists,
    currentUser?.role === 'patient' ? {} : 'skip'
  ) as MyPhysiotherapist[] | undefined
  const physiotherapists = useMemo(
    () =>
      (myPhysiotherapists ?? []).map((p) => ({
        physiotherapistId: p._id,
        name: [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Your physiotherapist',
        clinicName: p.clinic?.name ?? null,
      })),
    [myPhysiotherapists]
  )

  const getOrCreateConversation = useMutation(api.chat.getOrCreateConversation)

  // Get the selected recipient's ID
  const selectedRecipientId = useMemo(() => {
    if (!selectedConversationId || !conversations) return null;
    const conversation = conversations.find(c => c._id === selectedConversationId);
    return conversation?.otherParticipant._id;
  }, [selectedConversationId, conversations]);

  // Get selected conversation details
  const selectedConversation = useMemo(() => {
    if (!selectedConversationId || !conversations) return null;
    return conversations.find(c => c._id === selectedConversationId);
  }, [selectedConversationId, conversations]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    if (!conversations) return [];
    if (!searchTerm) return conversations;
    return conversations.filter(c =>
      c.otherParticipant.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.otherParticipant.lastName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [conversations, searchTerm]);

  // Handle back button on mobile
  const handleBackToList = () => {
    setMobileView('list');
    // Optional: clear selection if you want to reset state completely
    // setSelectedConversationId(null); 
  };

  // Handle conversation selection
  const handleSelectConversation = (id: Id<"conversations">) => {
    setSelectedConversationId(id);
    setMobileView('chat');
  };

  if (!currentUser) return (
    <div className="flex items-center justify-center h-[calc(100vh-100px)]">
      <div className="animate-pulse flex flex-col items-center">
        <div className="h-12 w-12 bg-gray-200 rounded-full mb-4"></div>
        <div className="h-4 w-32 bg-gray-200 rounded"></div>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-8rem)] max-w-6xl mx-auto md:p-4 overflow-hidden">
      <div className="bg-white md:rounded-2xl shadow-sm border border-gray-200 h-full flex overflow-hidden relative">

        {/* Left Sidebar (Conversation List) */}
        <div className={cn(
          "w-full md:w-80 lg:w-96 flex flex-col border-r border-gray-100 bg-white absolute md:relative z-10 h-full transition-transform duration-300 ease-in-out",
          mobileView === 'chat' ? "-translate-x-full md:translate-x-0" : "translate-x-0"
        )}>
          {/* Header */}
          <div className="p-3 md:p-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-20">
            <h1 className="text-lg md:text-xl font-bold text-gray-900">Messages</h1>
            <Dialog open={isNewConversationOpen} onOpenChange={setIsNewConversationOpen}>
              <DialogTrigger asChild>
                <Button size="icon" className="rounded-full h-8 w-8 bg-gray-900 hover:bg-black text-white shadow-sm">
                  <Plus className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[400px] rounded-2xl">
                <DialogHeader>
                  <DialogTitle>New Message</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {myPhysiotherapists !== undefined && physiotherapists.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      You can message a physiotherapist once you&apos;re under their care. Book a session or accept your physio&apos;s invitation first.
                    </p>
                  ) : (
                    <Select value={newConversationPtId || undefined} onValueChange={(value) => setNewConversationPtId(value as Id<"users">)}>
                      <SelectTrigger className="w-full rounded-xl">
                        <SelectValue placeholder={myPhysiotherapists === undefined ? 'Loading…' : 'Select a physiotherapist'} />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {physiotherapists.map((p) => (
                          <SelectItem key={p.physiotherapistId} value={p.physiotherapistId}>
                            {p.name}
                            {p.clinicName ? ` · ${p.clinicName}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button
                  disabled={!newConversationPtId}
                  onClick={async () => {
                    if (!newConversationPtId) return;
                    try {
                      const res = await getOrCreateConversation({ participantId: newConversationPtId })
                      handleSelectConversation(res.conversationId)
                      toast.success('Conversation started')
                      setIsNewConversationOpen(false)
                      setNewConversationPtId('')
                    } catch (err) {
                      toast.error(programError(err, 'Couldn’t start the conversation. Please try again.'))
                      console.error(err)
                    }
                  }}
                  className="w-full rounded-xl bg-gray-900 text-white"
                >
                  Start Chat
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="p-2 md:p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search messages..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-gray-50 border-transparent focus:bg-white transition-all rounded-xl h-9 md:h-10"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="h-8 w-8 text-gray-300" />
                </div>
                <p className="font-medium text-gray-900">No messages</p>
                <p className="text-sm mt-1">Start a conversation with your physiotherapist.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filteredConversations.map((conversation) => {
                  const other = conversation.otherParticipant
                  const isSelected = selectedConversationId === conversation._id

                  return (
                    <motion.div
                      key={conversation._id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => handleSelectConversation(conversation._id)}
                      className={cn(
                        "p-3 md:p-4 cursor-pointer hover:bg-gray-50 transition-colors flex gap-3 items-start",
                        isSelected && "bg-blue-50/50 hover:bg-blue-50/70"
                      )}
                    >
                      <div className="relative shrink-0">
                        <Avatar className="h-12 w-12 border border-gray-100">
                          <AvatarImage src={other.imageUrl} />
                          <AvatarFallback className="bg-brand/10 text-brand font-medium">
                            {other.firstName?.[0]}{other.lastName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        {other.isOnline && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <h3 className={cn("font-semibold truncate text-sm", isSelected ? "text-blue-900" : "text-gray-900")}>
                            {other.firstName} {other.lastName}
                          </h3>
                          {conversation.lastMessage?.timestamp && (
                            <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                              {formatDistanceToNow(conversation.lastMessage.timestamp, { addSuffix: false })}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-center">
                          <p className={cn("text-sm truncate pr-2", conversation.unreadCount > 0 ? "font-medium text-gray-900" : "text-gray-500")}>
                            {conversation.lastMessage?.content || "No messages yet"}
                          </p>
                          {conversation.unreadCount > 0 && (
                            <span className="bg-brand text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center shrink-0">
                              {conversation.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col bg-white absolute md:relative w-full h-full transition-transform duration-300 ease-in-out z-20",
          mobileView === 'chat' ? "translate-x-0" : "translate-x-full md:translate-x-0"
        )}>
          {selectedConversationId && selectedRecipientId ? (
            <>
              {/* Chat Header */}
              <div className="h-16 border-b border-gray-100 flex items-center justify-between px-4 bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden -ml-2 text-gray-500"
                    onClick={handleBackToList}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>

                  <div className="flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-gray-100">
                      <AvatarImage src={selectedConversation?.otherParticipant.imageUrl} />
                      <AvatarFallback className="bg-brand/10 text-brand text-xs">
                        {selectedConversation?.otherParticipant.firstName?.[0]}
                        {selectedConversation?.otherParticipant.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="font-semibold text-sm text-gray-900">
                        {selectedConversation?.otherParticipant.firstName} {selectedConversation?.otherParticipant.lastName}
                      </h2>
                      {selectedConversation?.otherParticipant.role && (
                        <p className="text-xs text-gray-500">
                          {ROLE_LABELS[selectedConversation.otherParticipant.role] ?? 'Care team'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 min-h-0 overflow-hidden bg-gray-50/30 relative">
                <RealtimeChat key={selectedRecipientId} recipientId={selectedRecipientId} embedded />
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center bg-gray-50/30 text-center p-8">
              <div className="bg-white p-6 rounded-full shadow-sm mb-6">
                <MessageSquare className="h-12 w-12 text-brand/40" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Your Messages</h3>
              <p className="text-gray-500 max-w-xs mx-auto mb-8">
                Select a conversation from the list to start chatting with your physiotherapist.
              </p>
              <Button
                onClick={() => setIsNewConversationOpen(true)}
                className="md:hidden rounded-xl bg-gray-900 text-white"
              >
                Start New Conversation
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
