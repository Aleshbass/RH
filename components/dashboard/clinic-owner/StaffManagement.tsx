'use client';

import { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog';
import { 
  Plus, 
  Users, 
  Mail, 
  Calendar, 
  Clock, 
  CheckCircle, 
  Copy,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export function StaffManagement() {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    name: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get invitations and staff
  const invitations = useQuery(api.clinics.getClinicInvitations) || [];
  const staff = useQuery(api.clinics.getClinicStaff) || [];

  // Mutations
  const invitePhysiotherapist = useMutation(api.clinics.invitePhysiotherapist);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteForm.email) {
      toast.error('Email is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await invitePhysiotherapist({
        inviteeEmail: inviteForm.email,
        inviteeName: inviteForm.name || undefined,
        message: inviteForm.message || undefined,
      });

      toast.success('Invitation sent successfully!');
      setInviteForm({ email: '', name: '', message: '' });
      setIsInviteModalOpen(false);
      
      // Copy invitation link to clipboard
      const inviteUrl = `${window.location.origin}/clinic-invite/${result.code}`;
      await navigator.clipboard.writeText(inviteUrl);
      toast.info('Invitation link copied to clipboard');
      
    } catch (error) {
      console.error('Error sending invitation:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyInviteLink = async (code: string) => {
    const inviteUrl = `${window.location.origin}/clinic-invite/${code}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success('Invitation link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const getStatusBadge = (status: string, isExpired: boolean) => {
    if (isExpired) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'accepted':
        return <Badge variant="default" className="bg-green-100 text-green-800">Accepted</Badge>;
      case 'declined':
        return <Badge variant="destructive">Declined</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Staff Management</h2>
          <p className="text-gray-600">Manage your clinic&apos;s physiotherapist team</p>
        </div>
        <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Invite Physiotherapist
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Physiotherapist</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="physiotherapist@example.com"
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor="name">Name (Optional)</Label>
                <Input
                  id="name"
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="John Doe"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <Label htmlFor="message">Personal Message (Optional)</Label>
                <Textarea
                  id="message"
                  value={inviteForm.message}
                  onChange={(e) => setInviteForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Welcome to our clinic! We're excited to have you join our team..."
                  rows={3}
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={isSubmitting} className="flex-1">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Sending...
                    </>
                  ) : (
                    'Send Invitation'
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsInviteModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Current Staff */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Current Staff ({staff.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {staff.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No staff members yet</h3>
              <p className="text-gray-600 mb-4">Invite physiotherapists to join your clinic</p>
            </div>
          ) : (
            <div className="space-y-4">
              {staff.map((member) => (
                <div key={member._id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium">
                        {member.user?.firstName} {member.user?.lastName}
                      </h4>
                      <p className="text-sm text-gray-600">{member.user?.email}</p>
                      {member.specializations && member.specializations.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {member.specializations.slice(0, 2).map((spec, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {spec}
                            </Badge>
                          ))}
                          {member.specializations.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{member.specializations.length - 2} more
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      Active
                    </Badge>
                    {member.yearsOfExperience && (
                      <p className="text-xs text-gray-500 mt-1">
                        {member.yearsOfExperience} years experience
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Pending Invitations ({invitations.filter(inv => inv.status === 'pending' && !inv.isExpired).length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No invitations sent</h3>
              <p className="text-gray-600">Invitations you send will appear here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <div key={invitation._id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium">
                        {invitation.inviteeName || invitation.inviteeEmail}
                      </h4>
                      <p className="text-sm text-gray-600">{invitation.inviteeEmail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(invitation.status, invitation.isExpired)}
                      {invitation.status === 'pending' && !invitation.isExpired && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyInviteLink(invitation.code)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`/clinic-invite/${invitation.code}`, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      <span>Sent: {new Date(invitation.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      <span>Expires: {new Date(invitation.expiresAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {invitation.message && (
                    <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                      <strong>Message:</strong> {invitation.message}
                    </div>
                  )}

                  {invitation.status === 'accepted' && invitation.acceptedBy && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      <span>Accepted and joined your clinic</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 