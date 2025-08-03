'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import RealtimeChat from '@/components/chat/RealtimeChat'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Users, Plus } from 'lucide-react'
import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Id } from '@/convex/_generated/dataModel'

interface Physiotherapist {
  physiotherapistId: Id<"users">;
  name: string;
}

type ConversationWithParticipant = {
  _id: Id<"conversations">;
  otherParticipant: {
    _id: Id<"users">;
    firstName?: string;
    lastName?: string;
  };
  lastMessage?: {
    content: string;
  };
  unreadCount: number;
};

export default function PatientMessagesPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations">>()
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false)
  const [newConversationPtId, setNewConversationPtId] = useState<Id<"users"> | ''>('')

  // Current user
  const currentUser = useQuery(api.users.getMyUser as any)

  // Conversations
  const conversations = useQuery(
    api.chat.getMyConversations,
    currentUser ? {} : 'skip'
  ) as ConversationWithParticipant[] | undefined

  // Get physiotherapists list
  const physiotherapists = useQuery(api.patientInvitations.getMyPhysiotherapists, {})

  const getOrCreateConversation = useMutation(api.chat.getOrCreateConversation)

  // Get the selected recipient's ID
  const selectedRecipientId = useMemo(() => {
    if (!selectedConversationId || !conversations) return null;
    const conversation = conversations.find(c => c._id === selectedConversationId);
    return conversation?.otherParticipant._id;
  }, [selectedConversationId, conversations]);

  if (!currentUser) return <div>Loading...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Messages</h1>
          <p className="text-muted-foreground">Communicate with your physiotherapist</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-200px)]">
        {/* Conversation list */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Conversations
            </CardTitle>
            <Dialog open={isNewConversationOpen} onOpenChange={setIsNewConversationOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="ml-auto">
                  <Plus className="h-4 w-4 mr-1" /> New
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>Start New Conversation</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Select onValueChange={(value) => setNewConversationPtId(value as Id<"users">)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a physiotherapist" />
                    </SelectTrigger>
                    <SelectContent>
                      {physiotherapists?.map((p: any) => (
                        <SelectItem key={p._id} value={p._id}>
                          {`${p.firstName || ''} ${p.lastName || ''}`.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  disabled={!newConversationPtId}
                  onClick={async () => {
                    if (!newConversationPtId) return;
                    try {
                      const res = await getOrCreateConversation({ participantId: newConversationPtId })
                      setSelectedConversationId(res.conversationId)
                      toast.success('Conversation started')
                      setIsNewConversationOpen(false)
                      setNewConversationPtId('')
                    } catch (err) {
                      toast.error('Failed to start conversation')
                      console.error(err)
                    }
                  }}
                  className="w-full"
                >
                  Start Chat
                </Button>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-2">
              {conversations?.map((conversation) => {
                const other = conversation.otherParticipant
                return (
                  <div
                    key={conversation._id}
                    onClick={() => setSelectedConversationId(conversation._id)}
                    className={`p-3 cursor-pointer hover:bg-gray-50 border-b ${
                      selectedConversationId === conversation._id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                        {other?.firstName?.[0] || 'P'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {other?.firstName} {other?.lastName}
                        </p>
                        {conversation.lastMessage && (
                          <p className="text-sm text-gray-500 truncate">
                            {conversation.lastMessage.content}
                          </p>
                        )}
                      </div>
                      {conversation.unreadCount > 0 && (
                        <div className="bg-blue-500 text-white text-xs rounded-full px-2 py-1 min-w-5 text-center">
                          {conversation.unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {(!conversations || conversations.length === 0) && (
                <div className="p-6 text-center text-gray-500">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No conversations yet</p>
                  <p className="text-sm">Start messaging your physiotherapist</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat area */}
        <Card className="lg:col-span-3">
          <CardContent className="p-0 h-full">
            {selectedRecipientId ? (
              <RealtimeChat recipientId={selectedRecipientId} className="h-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">Select a conversation</p>
                  <p className="text-sm">Choose a conversation from the list or start a new one</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
