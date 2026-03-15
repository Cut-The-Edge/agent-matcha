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
  type RowSelectionState,
} from "@tanstack/react-table"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Send,
  Loader2,
} from "lucide-react"

import { useAuthQuery, useAuthMutation } from "@/hooks/use-auth-query"
import { toast } from "sonner"
import { api } from "../../../convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { columns, type DataRequestRow, type DataRequestTableMeta } from "./columns"
import { SendFormDialog } from "./send-form-dialog"
import { BulkSendDialog } from "./bulk-send-dialog"
import { SendAllDialog } from "./send-all-dialog"
import type { Id } from "../../../convex/_generated/dataModel"

function DataRequestTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            {["", "Member", "Phone", "Missing Fields", "Status", "Sent At", ""].map(
              (header, i) => (
                <TableHead key={i}>{header}</TableHead>
              )
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="size-4 rounded" /></TableCell>
              <TableCell><Skeleton className="h-4 w-28" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-5 w-32 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              <TableCell><Skeleton className="h-4 w-24" /></TableCell>
              <TableCell><Skeleton className="h-7 w-20" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function DataRequestList() {
  const membersWithMissing = useAuthQuery(api.dataRequests.queries.getMembersWithMissingData, {})
  const stats = useAuthQuery(api.dataRequests.queries.getDashboardStats, {})
  const { mutateWithAuth: createAndSend } = useAuthMutation(api.dataRequests.mutations.createAndSend)
  const { mutateWithAuth: createBulkSend } = useAuthMutation(api.dataRequests.mutations.createBulkSend)
  const { mutateWithAuth: sendToAllMissing } = useAuthMutation(api.dataRequests.mutations.sendToAllMissing)

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 20 })

  // Dialog state
  const [sendingMemberId, setSendingMemberId] = React.useState<string | null>(null)
  const [singleSendTarget, setSingleSendTarget] = React.useState<DataRequestRow | null>(null)
  const [showBulkDialog, setShowBulkDialog] = React.useState(false)
  const [showSendAllDialog, setShowSendAllDialog] = React.useState(false)
  const [isSending, setIsSending] = React.useState(false)

  // Map backend data to table rows
  const tableData: DataRequestRow[] = React.useMemo(() => {
    if (!membersWithMissing) return []
    return membersWithMissing.map((m: any) => ({
      _id: m._id,
      memberId: m._id,
      firstName: m.firstName,
      lastName: m.lastName,
      phone: m.phone,
      email: m.email,
      missingFields: m.missingFields,
      latestRequestStatus: m.latestRequestStatus,
      latestRequestSentAt: m.latestRequestSentAt,
      latestRequestToken: m.latestRequestToken,
    }))
  }, [membersWithMissing])

  const handleSendForm = async (row: DataRequestRow) => {
    setSingleSendTarget(row)
  }

  const handleConfirmSingle = async () => {
    if (!singleSendTarget) return
    setIsSending(true)
    setSendingMemberId(singleSendTarget._id)
    try {
      await createAndSend({ memberId: singleSendTarget._id as Id<"members"> })
      toast.success(`Form sent to ${singleSendTarget.firstName}`)
      setSingleSendTarget(null)
    } catch (err: any) {
      toast.error(err?.message || "Failed to send form")
    } finally {
      setIsSending(false)
      setSendingMemberId(null)
    }
  }

  const handleConfirmBulk = async () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows
    const memberIds = selectedRows.map((r) => r.original._id as Id<"members">)
    setIsSending(true)
    try {
      const result = await createBulkSend({ memberIds })
      toast.success(`Sent: ${result.sent}, Skipped: ${result.skipped}${result.errors.length > 0 ? `, Errors: ${result.errors.length}` : ""}`)
      setRowSelection({})
      setShowBulkDialog(false)
    } catch (err: any) {
      toast.error(err?.message || "Bulk send failed")
    } finally {
      setIsSending(false)
    }
  }

  const handleConfirmSendAll = async () => {
    setIsSending(true)
    try {
      const result = await sendToAllMissing({})
      toast.success(`Sent: ${result.sent}, Skipped: ${result.skipped}`)
      setShowSendAllDialog(false)
    } catch (err: any) {
      toast.error(err?.message || "Send all failed")
    } finally {
      setIsSending(false)
    }
  }

  const tableMeta: DataRequestTableMeta = {
    onSendForm: handleSendForm,
    onCopyLink: () => toast.success("Link copied to clipboard"),
    sendingMemberId,
  }

  const table = useReactTable({
    data: tableData,
    columns,
    meta: tableMeta,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
  })

  const selectedCount = table.getFilteredSelectedRowModel().rows.length

  if (membersWithMissing === undefined) {
    return <DataRequestTableSkeleton />
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatsCard label="Total Members" value={stats.totalMembers} />
          <StatsCard label="Missing Data" value={stats.missingDataCount} />
          <StatsCard label="Sent (Pending)" value={stats.sentCount} />
          <StatsCard label="Completed" value={stats.completedCount} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <Input
            placeholder="Search members..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 max-w-sm"
          />
          <Select
            value={(columnFilters.find((f) => f.id === "status")?.value as string) ?? "all"}
            onValueChange={(value) => {
              if (value === "all") {
                setColumnFilters((prev) => prev.filter((f) => f.id !== "status"))
              } else {
                setColumnFilters((prev) => [
                  ...prev.filter((f) => f.id !== "status"),
                  { id: "status", value },
                ])
              }
            }}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="font-normal">
            {table.getFilteredRowModel().rows.length} member
            {table.getFilteredRowModel().rows.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBulkDialog(true)}
            >
              <Send className="mr-1 size-4" />
              Send to Selected ({selectedCount})
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setShowSendAllDialog(true)}
            disabled={!stats || stats.missingDataCount === 0}
          >
            <Send className="mr-1 size-4" />
            Send to All Missing
          </Button>
        </div>
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
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No members with missing data.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-muted-foreground hidden text-sm lg:block">
          {selectedCount > 0
            ? `${selectedCount} of ${table.getFilteredRowModel().rows.length} selected`
            : `${table.getFilteredRowModel().rows.length} total`}
        </div>
        <div className="flex w-full items-center gap-8 lg:w-fit">
          <div className="hidden items-center gap-2 lg:flex">
            <Label htmlFor="dr-rows-per-page" className="text-sm font-medium">
              Rows per page
            </Label>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-20" id="dr-rows-per-page">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
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
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
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

      {/* Dialogs */}
      <SendFormDialog
        open={!!singleSendTarget}
        onOpenChange={(open) => { if (!open) setSingleSendTarget(null) }}
        memberName={singleSendTarget ? `${singleSendTarget.firstName}${singleSendTarget.lastName ? ` ${singleSendTarget.lastName}` : ""}` : ""}
        isSending={isSending}
        onConfirm={handleConfirmSingle}
      />
      <BulkSendDialog
        open={showBulkDialog}
        onOpenChange={setShowBulkDialog}
        count={selectedCount}
        isSending={isSending}
        onConfirm={handleConfirmBulk}
      />
      <SendAllDialog
        open={showSendAllDialog}
        onOpenChange={setShowSendAllDialog}
        missingCount={stats?.missingDataCount ?? 0}
        isSending={isSending}
        onConfirm={handleConfirmSendAll}
      />
    </div>
  )
}

function StatsCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
