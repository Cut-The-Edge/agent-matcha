"use client"

import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  ChevronDown,
  Users,
  UserPlus,
  Pencil,
  Loader2,
  RefreshCw,
} from "lucide-react"

import { useAuthQuery, useAuthMutation, useAuthAction } from "@/hooks/use-auth-query"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { columns, type MemberTableMeta } from "./columns"
import { IntroDetailSheet } from "./intro-detail-sheet"
import type { Doc } from "../../../convex/_generated/dataModel"

function MemberTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            {["Name", "Email", "Phone", "Tier", "Status", "Intros", "Rejections", "Profile", "Last Synced"].map(
              (header) => (
                <TableHead key={header}>{header}</TableHead>
              )
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="h-4 w-28" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-36" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-20 rounded-full" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-8" />
              </TableCell>
              <TableCell>
                <Skeleton className="size-4 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function MemberEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
      <Users className="text-muted-foreground mb-4 size-12" />
      <h3 className="mb-1 text-lg font-semibold">No members yet</h3>
      <p className="text-muted-foreground mb-4 text-sm">
        Add a test member to get started with sandbox testing.
      </p>
      <Button onClick={onAdd}>
        <UserPlus className="mr-1 size-4" />
        Add Test Member
      </Button>
    </div>
  )
}

export function MemberList() {
  const members = useAuthQuery(api.members.queries.list, {})
  const { mutateWithAuth: createMember } = useAuthMutation(api.members.mutations.create)
  const { mutateWithAuth: updateMember } = useAuthMutation(api.members.mutations.update)
  const { actionWithAuth: syncMemberAction } = useAuthAction(api.integrations.smartmatchapp.actions.syncMember)
  const { mutateWithAuth: startSyncAll } = useAuthMutation(api.members.mutations.startSyncAll)
  const syncStatus = useAuthQuery(api.members.queries.getSyncStatus, {})
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [isAdding, setIsAdding] = React.useState(false)
  const [editingMember, setEditingMember] = React.useState<Doc<"members"> | null>(null)
  const [isEditing, setIsEditing] = React.useState(false)
  const [syncingMemberId, setSyncingMemberId] = React.useState<string | null>(null)
  const [selectedMemberForIntros, setSelectedMemberForIntros] = React.useState<Doc<"members"> | null>(null)
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] =
    React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const handleAddMember = async (fd: FormData) => {
    setIsAdding(true)
    try {
      await createMember({
        smaId: `test-${Date.now()}`,
        firstName: fd.get("firstName") as string,
        lastName: (fd.get("lastName") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        whatsappId: (fd.get("whatsappId") as string) || undefined,
        email: (fd.get("email") as string) || undefined,
        profileLink: (fd.get("profileLink") as string) || undefined,
        tier: "free",
      })
      setAddDialogOpen(false)
    } catch (err) {
      console.error("Failed to create member:", err)
    } finally {
      setIsAdding(false)
    }
  }

  const handleEditMember = async (fd: FormData) => {
    if (!editingMember) return
    setIsEditing(true)
    try {
      await updateMember({
        memberId: editingMember._id,
        firstName: (fd.get("firstName") as string) || undefined,
        lastName: (fd.get("lastName") as string) || undefined,
        phone: (fd.get("phone") as string) || undefined,
        whatsappId: (fd.get("whatsappId") as string) || undefined,
        email: (fd.get("email") as string) || undefined,
        profileLink: (fd.get("profileLink") as string) || undefined,
        tier: (fd.get("tier") as "free" | "member" | "vip") || undefined,
      })
      setEditingMember(null)
    } catch (err) {
      console.error("Failed to update member:", err)
    } finally {
      setIsEditing(false)
    }
  }

  const handleSyncMember = async (member: Doc<"members">) => {
    if (!member.smaId || !/^\d+$/.test(member.smaId)) return
    setSyncingMemberId(member._id)
    try {
      const result = await syncMemberAction({ smaClientId: Number(member.smaId) })
      toast.success(`Synced ${member.firstName} (${result.action})`)
    } catch (err) {
      console.error("Sync failed:", err)
      toast.error(`Failed to sync ${member.firstName}`)
    } finally {
      setSyncingMemberId(null)
    }
  }

  const isSyncingAll = syncStatus?.status === "running"

  // Show toast when sync completes
  const prevSyncStatusRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    const currentStatus = syncStatus?.status ?? null
    if (prevSyncStatusRef.current === "running" && currentStatus === "completed") {
      try {
        const result = syncStatus?.result ? JSON.parse(syncStatus.result) : {}
        toast.success(`Synced ${result.synced ?? 0} member${result.synced !== 1 ? "s" : ""}${result.errors ? `, ${result.errors} error${result.errors !== 1 ? "s" : ""}` : ""}`)
      } catch {
        toast.success("Sync completed")
      }
    } else if (prevSyncStatusRef.current === "running" && currentStatus === "failed") {
      toast.error("Sync failed")
    }
    prevSyncStatusRef.current = currentStatus
  }, [syncStatus?.status, syncStatus?.result])

  const handleSyncAll = async () => {
    try {
      const { alreadyRunning } = await startSyncAll({})
      if (alreadyRunning) {
        toast.info("Sync is already running")
      } else {
        toast.info("Sync started in background")
      }
    } catch (err) {
      console.error("Failed to start sync:", err)
      toast.error("Failed to start sync")
    }
  }

  const tableMeta: MemberTableMeta = {
    onEdit: (member) => setEditingMember(member),
    onSync: handleSyncMember,
    onViewIntros: (member) => setSelectedMemberForIntros(member),
    syncingMemberId,
  }

  const table = useReactTable({
    data: members ?? [],
    columns,
    meta: tableMeta,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // Loading state
  if (members === undefined) {
    return <MemberTableSkeleton />
  }

  // Empty state — still show Add Member
  if (members.length === 0) {
    return (
      <>
        <MemberEmptyState onAdd={() => setAddDialogOpen(true)} />
        <AddMemberDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          isAdding={isAdding}
          onSubmit={handleAddMember}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search members..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 max-w-sm"
          />
          <div className="text-muted-foreground hidden text-sm sm:block">
            <Badge variant="secondary" className="font-normal">
              {table.getFilteredRowModel().rows.length} member
              {table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="size-4" />
              <span className="hidden lg:inline">Columns</span>
              <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {table
              .getAllColumns()
              .filter(
                (column) =>
                  typeof column.accessorFn !== "undefined" &&
                  column.getCanHide()
              )
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) =>
                    column.toggleVisibility(!!value)
                  }
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncAll}
          disabled={isSyncingAll}
        >
          {isSyncingAll ? (
            <Loader2 className="mr-1 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 size-4" />
          )}
          {isSyncingAll && syncStatus?.progress != null && syncStatus?.total
            ? `Syncing ${syncStatus.progress}/${syncStatus.total}`
            : "Sync All"}
        </Button>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <UserPlus className="mr-1 size-4" />
          Add Member
        </Button>
        <AddMemberDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          isAdding={isAdding}
          onSubmit={handleAddMember}
        />
        <EditMemberDialog
          member={editingMember}
          open={!!editingMember}
          onOpenChange={(open) => { if (!open) setEditingMember(null) }}
          isSaving={isEditing}
          onSubmit={handleEditMember}
        />
        <IntroDetailSheet
          member={selectedMemberForIntros}
          open={!!selectedMemberForIntros}
          onOpenChange={(open) => { if (!open) setSelectedMemberForIntros(null) }}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} colSpan={header.colSpan}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-muted-foreground hidden text-sm lg:block">
          {table.getFilteredRowModel().rows.length} total member
          {table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}
        </div>
        <div className="flex w-full items-center gap-8 lg:w-fit">
          <div className="hidden items-center gap-2 lg:flex">
            <Label htmlFor="rows-per-page" className="text-sm font-medium">
              Rows per page
            </Label>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                <SelectValue
                  placeholder={table.getState().pagination.pageSize}
                />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-fit items-center justify-center text-sm font-medium">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button
              variant="outline"
              className="hidden size-8 lg:flex"
              size="icon"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              className="hidden size-8 lg:flex"
              size="icon"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddMemberDialog({
  open,
  onOpenChange,
  isAdding,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdding: boolean
  onSubmit: (fd: FormData) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Test Member</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            await onSubmit(new FormData(form))
            form.reset()
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName" className="text-xs">First Name *</Label>
              <Input id="firstName" name="firstName" required className="mt-1" placeholder="Adi" />
            </div>
            <div>
              <Label htmlFor="lastName" className="text-xs">Last Name</Label>
              <Input id="lastName" name="lastName" className="mt-1" placeholder="Doe" />
            </div>
          </div>
          <div>
            <Label htmlFor="phone" className="text-xs">Phone</Label>
            <Input id="phone" name="phone" className="mt-1" placeholder="+972546642546" />
          </div>
          <div>
            <Label htmlFor="whatsappId" className="text-xs">WhatsApp ID</Label>
            <Input id="whatsappId" name="whatsappId" className="mt-1" placeholder="whatsapp:+972546642546" />
          </div>
          <div>
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input id="email" name="email" type="email" className="mt-1" placeholder="adi@example.com" />
          </div>
          <div>
            <Label htmlFor="profileLink" className="text-xs">Profile Link</Label>
            <Input id="profileLink" name="profileLink" className="mt-1" placeholder="https://smartmatchapp.com/profile/..." />
          </div>
          <Button type="submit" className="w-full" disabled={isAdding}>
            {isAdding ? <Loader2 className="mr-1 size-4 animate-spin" /> : <UserPlus className="mr-1 size-4" />}
            Create Member
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditMemberDialog({
  member,
  open,
  onOpenChange,
  isSaving,
  onSubmit,
}: {
  member: Doc<"members"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
  isSaving: boolean
  onSubmit: (fd: FormData) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
        </DialogHeader>
        {member && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await onSubmit(new FormData(e.currentTarget))
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="edit-firstName" className="text-xs">First Name</Label>
                <Input id="edit-firstName" name="firstName" defaultValue={member.firstName} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="edit-lastName" className="text-xs">Last Name</Label>
                <Input id="edit-lastName" name="lastName" defaultValue={member.lastName ?? ""} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-phone" className="text-xs">Phone</Label>
              <Input id="edit-phone" name="phone" defaultValue={member.phone ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-whatsappId" className="text-xs">WhatsApp ID</Label>
              <Input id="edit-whatsappId" name="whatsappId" defaultValue={member.whatsappId ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-email" className="text-xs">Email</Label>
              <Input id="edit-email" name="email" type="email" defaultValue={member.email ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="edit-profileLink" className="text-xs">Profile Link</Label>
              <Input id="edit-profileLink" name="profileLink" defaultValue={member.profileLink ?? ""} className="mt-1" placeholder="https://smartmatchapp.com/profile/..." />
            </div>
            <div>
              <Label htmlFor="edit-tier" className="text-xs">Tier</Label>
              <select id="edit-tier" name="tier" defaultValue={member.tier} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
                <option value="free">Free</option>
                <option value="member">Member</option>
                <option value="vip">VIP</option>
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Pencil className="mr-1 size-4" />}
              Save Changes
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
