"use client"

import { useState } from "react"
import { useAuthQuery, useAuthMutation, useAuthAction } from "@/hooks/use-auth-query"
import { api } from "../../../../convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import {
  UserPlus,
  Trash2,
  Pencil,
  KeyRound,
  Loader2,
  MoreVertical,
  ShieldCheck,
  Shield,
  Code,
  Users,
  UserCircle,
  Check,
  X,
} from "lucide-react"

// ============================================================================
// Types
// ============================================================================

interface Admin {
  _id: string
  _creationTime: number
  email: string
  name: string
  role: "developer" | "super_admin" | "admin"
  status?: "active" | "inactive"
  isActive?: boolean
  createdAt: number
  lastLoginAt?: number
  lastPasswordChange?: number
}

// ============================================================================
// Helpers
// ============================================================================

function getRoleBadge(role: string) {
  if (role === "developer") {
    return (
      <Badge variant="destructive" className="flex w-fit items-center gap-0.5 bg-purple-600">
        <Code className="h-3 w-3 mr-1" />
        developer
      </Badge>
    )
  }
  if (role === "super_admin") {
    return (
      <Badge variant="destructive" className="flex w-fit items-center gap-0.5">
        <ShieldCheck className="h-3 w-3 mr-1" />
        super admin
      </Badge>
    )
  }
  return (
    <Badge variant="default" className="flex w-fit items-center gap-0.5">
      <Shield className="h-3 w-3 mr-1" />
      admin
    </Badge>
  )
}

function getStatusBadge(admin: Admin) {
  const isActive = admin.status === "active" || admin.isActive !== false
  return (
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? "Active" : "Inactive"}
    </Badge>
  )
}

function getPasswordChecks(password: string) {
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
  ]
}

function isPasswordValid(password: string) {
  return getPasswordChecks(password).every((c) => c.met)
}

function PasswordChecklist({ password }: { password: string }) {
  const checks = getPasswordChecks(password)
  if (!password) {
    return (
      <p className="text-xs text-muted-foreground">
        Must contain uppercase, lowercase, and number
      </p>
    )
  }
  return (
    <div className="space-y-1 mt-1">
      {checks.map((check) => (
        <div key={check.label} className="flex items-center gap-1.5 text-xs">
          {check.met ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <X className="h-3.5 w-3.5 text-red-500" />
          )}
          <span className={check.met ? "text-green-600" : "text-red-500"}>
            {check.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Page
// ============================================================================

export default function UsersPage() {
  const admins = useAuthQuery(api.auth.admins.list, {}) as Admin[] | undefined
  const currentUser = useAuthQuery(api.auth.admins.me, {}) as Admin | undefined

  const adminsApi = api.auth.admins as any
  const { actionWithAuth: createAdmin } = useAuthAction(adminsApi.create)
  const { mutateWithAuth: updateAdmin } = useAuthMutation(api.auth.admins.update)
  const { mutateWithAuth: deleteAdminMut } = useAuthMutation(api.auth.admins.deleteAdmin)
  const { actionWithAuth: resetPassword } = useAuthAction(adminsApi.resetPassword)

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false)
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Create form
  const [newAdmin, setNewAdmin] = useState({
    email: "",
    name: "",
    password: "",
    role: "admin" as "developer" | "super_admin" | "admin",
  })

  // Edit form
  const [editForm, setEditForm] = useState({
    name: "",
    role: "admin" as "developer" | "super_admin" | "admin",
    isActive: true,
  })

  // Password reset form
  const [newPassword, setNewPassword] = useState("")

  // ---- Handlers ----

  const handleCreateAdmin = async () => {
    if (!newAdmin.email || !newAdmin.name || !newAdmin.password) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsSubmitting(true)
    try {
      await createAdmin({
        email: newAdmin.email,
        name: newAdmin.name,
        password: newAdmin.password,
        role: newAdmin.role,
      })
      toast.success("Admin created successfully")
      setIsCreateOpen(false)
      setNewAdmin({ email: "", name: "", password: "", role: "admin" })
    } catch (error: any) {
      toast.error(error.message || "Failed to create admin")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateAdmin = async () => {
    if (!selectedAdmin) return

    setIsSubmitting(true)
    try {
      await updateAdmin({
        adminId: selectedAdmin._id as any,
        name: editForm.name,
        role: editForm.role,
        isActive: editForm.isActive,
      })
      toast.success("Admin updated successfully")
      setIsEditOpen(false)
      setSelectedAdmin(null)
    } catch (error: any) {
      toast.error(error.message || "Failed to update admin")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!selectedAdmin || !newPassword) {
      toast.error("Please enter a new password")
      return
    }

    setIsSubmitting(true)
    try {
      await resetPassword({
        adminId: selectedAdmin._id as any,
        newPassword,
      })
      toast.success("Password reset successfully")
      setIsResetPasswordOpen(false)
      setNewPassword("")
      setSelectedAdmin(null)
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteAdmin = async (admin: Admin) => {
    if (admin._id === currentUser?._id) {
      toast.error("Cannot delete your own account")
      return
    }

    if (!confirm(`Are you sure you want to delete ${admin.name}?`)) return

    try {
      await deleteAdminMut({ adminId: admin._id as any })
      toast.success("Admin deleted successfully")
    } catch (error: any) {
      toast.error(error.message || "Failed to delete admin")
    }
  }

  const openEditDialog = (admin: Admin) => {
    setSelectedAdmin(admin)
    setEditForm({
      name: admin.name,
      role: admin.role,
      isActive: admin.status === "active" || admin.isActive !== false,
    })
    setIsEditOpen(true)
  }

  const openResetPasswordDialog = (admin: Admin) => {
    setSelectedAdmin(admin)
    setNewPassword("")
    setIsResetPasswordOpen(true)
  }

  const isLoading = admins === undefined

  const activeCount = admins?.filter(
    (a) => a.status === "active" || a.isActive !== false
  ).length ?? 0

  const inactiveCount = admins?.filter(
    (a) => a.status === "inactive" || a.isActive === false
  ).length ?? 0

  return (
    <div className="flex flex-col gap-6 py-6 md:gap-8 md:py-8 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-start px-4 lg:px-6">
        <div>
          <h2 className="page-heading flex items-center gap-2.5">
            <Users className="h-6 w-6" />
            User Management
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage admin users and their permissions
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Admin
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Admin</DialogTitle>
              <DialogDescription>
                Add a new administrator to the system
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="create-email">Email *</Label>
                <Input
                  id="create-email"
                  type="email"
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  placeholder="admin@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-name">Name *</Label>
                <Input
                  id="create-name"
                  value={newAdmin.name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Password *</Label>
                <Input
                  id="create-password"
                  type="password"
                  value={newAdmin.password}
                  onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                  placeholder="Minimum 8 characters"
                />
                <PasswordChecklist password={newAdmin.password} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-role">Role</Label>
                <Select
                  value={newAdmin.role}
                  onValueChange={(value: "developer" | "super_admin" | "admin") =>
                    setNewAdmin({ ...newAdmin, role: value })
                  }
                >
                  <SelectTrigger id="create-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currentUser?.role === "developer" && (
                      <SelectItem value="developer">
                        <div className="flex items-center gap-2">
                          <Code className="h-4 w-4 text-purple-600" />
                          Developer (Full Access + Dev Tools)
                        </div>
                      </SelectItem>
                    )}
                    <SelectItem value="super_admin">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-destructive" />
                        Super Admin (Full Access)
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Admin
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateAdmin}
                disabled={
                  isSubmitting ||
                  !isPasswordValid(newAdmin.password) ||
                  !newAdmin.email ||
                  !newAdmin.name
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Admin"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="stagger grid grid-cols-1 md:grid-cols-3 gap-4 px-4 lg:px-6">
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Admins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">{admins?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight text-green-600">{activeCount}</div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight text-muted-foreground">{inactiveCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Administrators</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {admins?.map((admin) => (
                    <TableRow key={admin._id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserCircle className="h-5 w-5 text-muted-foreground" />
                          {admin.name}
                          {admin._id === currentUser?._id && (
                            <Badge variant="outline" className="text-xs">You</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{admin.email}</TableCell>
                      <TableCell>{getRoleBadge(admin.role)}</TableCell>
                      <TableCell>{getStatusBadge(admin)}</TableCell>
                      <TableCell>
                        {new Date(admin.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(admin)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openResetPasswordDialog(admin)}>
                              <KeyRound className="h-4 w-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteAdmin(admin)}
                              className="text-destructive"
                              disabled={admin._id === currentUser?._id}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {admins?.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No administrators found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Admin Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Admin</DialogTitle>
            <DialogDescription>
              Update administrator details for {selectedAdmin?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value: "developer" | "super_admin" | "admin") =>
                  setEditForm({ ...editForm, role: value })
                }
                disabled={selectedAdmin?._id === currentUser?._id}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentUser?.role === "developer" && (
                    <SelectItem value="developer">Developer</SelectItem>
                  )}
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              {selectedAdmin?._id === currentUser?._id && (
                <p className="text-xs text-muted-foreground">
                  You cannot change your own role
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={editForm.isActive ? "active" : "inactive"}
                onValueChange={(value) =>
                  setEditForm({ ...editForm, isActive: value === "active" })
                }
                disabled={selectedAdmin?._id === currentUser?._id}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              {selectedAdmin?._id === currentUser?._id && (
                <p className="text-xs text-muted-foreground">
                  You cannot deactivate your own account
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateAdmin} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {selectedAdmin?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
              <PasswordChecklist password={newPassword} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={isSubmitting || !isPasswordValid(newPassword)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
