"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Shield, 
  Users, 
  UserPlus,
  Edit,
  Trash2,
  Crown,
  Building2,
  Activity,
  User
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";

interface UserWithRole {
  _id: Id<"users">;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  onboarded: boolean;
  _creationTime: number;
}

const roleColumns: ColumnDef<UserWithRole>[] = [
  {
    accessorKey: "firstName",
    header: "Name",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            <span className="text-sm font-medium">
              {(user.firstName?.[0] || '') + (user.lastName?.[0] || '')}
            </span>
          </div>
          <div>
            <div className="font-medium">{user.firstName || ''} {user.lastName || ''}</div>
            <div className="text-sm text-muted-foreground">{user.email || 'No email'}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "role",
    header: "Current Role",
    cell: ({ row }) => {
      const role = row.getValue("role") as string;
      const roleColors = {
        admin: "bg-red-100 text-red-800",
        clinic_owner: "bg-blue-100 text-blue-800",
        physiotherapist: "bg-green-100 text-green-800",
        patient: "bg-purple-100 text-purple-800",
      };
      const roleIcons = {
        admin: Crown,
        clinic_owner: Building2,
        physiotherapist: Activity,
        patient: User,
      };
      const Icon = roleIcons[role as keyof typeof roleIcons] || User;
      
      return (
        <Badge className={roleColors[role as keyof typeof roleColors] || "bg-gray-100 text-gray-800"}>
          <Icon className="h-3 w-3 mr-1" />
          {role?.replace('_', ' ') || 'Unassigned'}
        </Badge>
      );
    },
  },
  {
    accessorKey: "onboarded",
    header: "Status",
    cell: ({ row }) => {
      const onboarded = row.getValue("onboarded") as boolean;
      return (
        <Badge variant={onboarded ? "default" : "secondary"}>
          {onboarded ? "Active" : "Pending"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "_creationTime",
    header: "Joined",
    cell: ({ row }) => {
      const timestamp = row.getValue("_creationTime") as number;
      return format(new Date(timestamp), 'MMM dd, yyyy');
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const user = row.original;
      return (
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm">
            <Edit className="h-4 w-4" />
          </Button>
          {user.role !== 'admin' && (
            <Button variant="ghost" size="sm">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      );
    },
  },
];

export default function AdminRolesPage() {
  const allUsers = useQuery(api.users.getAllUsers);
  const [selectedRole, setSelectedRole] = useState<string>("all");

  const filteredUsers = allUsers?.filter(user => 
    selectedRole === "all" || user.role === selectedRole
  ) || [];

  const roleStats = allUsers ? {
    admin: allUsers.filter(u => u.role === 'admin').length,
    clinic_owner: allUsers.filter(u => u.role === 'clinic_owner').length,
    physiotherapist: allUsers.filter(u => u.role === 'physiotherapist').length,
    patient: allUsers.filter(u => u.role === 'patient').length,
    unassigned: allUsers.filter(u => !u.role).length,
  } : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
          <p className="text-muted-foreground">
            Manage user roles and permissions across the platform
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Assign Role
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign User Role</DialogTitle>
              <DialogDescription>
                Select a user and assign them a new role
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user">Select User</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {allUsers?.map(user => (
                      <SelectItem key={user._id} value={user._id}>
                        {user.firstName} {user.lastName} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">New Role</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="clinic_owner">Clinic Owner</SelectItem>
                    <SelectItem value="physiotherapist">Physiotherapist</SelectItem>
                    <SelectItem value="patient">Patient</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full">Assign Role</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Role Statistics */}
      <div className="grid gap-4 md:grid-cols-5">
        {roleStats ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Administrators</CardTitle>
                <Crown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roleStats.admin}</div>
                <p className="text-xs text-muted-foreground">System admins</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Clinic Owners</CardTitle>
                <Building2 className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roleStats.clinic_owner}</div>
                <p className="text-xs text-muted-foreground">Facility managers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Physiotherapists</CardTitle>
                <Activity className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roleStats.physiotherapist}</div>
                <p className="text-xs text-muted-foreground">Healthcare providers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Patients</CardTitle>
                <User className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roleStats.patient}</div>
                <p className="text-xs text-muted-foreground">Care recipients</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
                <Users className="h-4 w-4 text-gray-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roleStats.unassigned}</div>
                <p className="text-xs text-muted-foreground">No role assigned</p>
              </CardContent>
            </Card>
          </>
        ) : (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Role Filter and User Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <Shield className="mr-2 h-5 w-5" />
                User Roles
              </CardTitle>
              <CardDescription>
                View and manage user role assignments
              </CardDescription>
            </div>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">Administrators</SelectItem>
                <SelectItem value="clinic_owner">Clinic Owners</SelectItem>
                <SelectItem value="physiotherapist">Physiotherapists</SelectItem>
                <SelectItem value="patient">Patients</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {allUsers ? (
            <DataTable 
              data={filteredUsers} 
              columns={roleColumns}
              searchKey="firstName"
            />
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading users...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 