"use client"

import { useState } from "react"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import { ArrowUpDown, Phone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import { LeadApproveDialog } from "./lead-approve-dialog"
import { LeadDenyDialog } from "./lead-deny-dialog"

type LeadRow = {
  _id: string
  prospectName: string
  tierInterest: "member" | "vip"
  prospectPhone?: string
  callId?: string
  callDate?: number
  status: "pending" | "approved" | "denied" | "expired"
  createdAt: number
  slaDeadline: number
  daysRemaining: number
  resolvedBy?: string
  adminNotes?: string
  whatsappMessageSent: boolean
  smaNoteSynced: boolean
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return "Just now"
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "default",
  approved: "secondary",
  denied: "destructive",
  expired: "outline",
}

const TIER_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  vip: "default",
  member: "secondary",
}

const columns: ColumnDef<LeadRow>[] = [
  {
    accessorKey: "prospectName",
    header: "Name",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.prospectName}</span>
    ),
  },
  {
    accessorKey: "tierInterest",
    header: "Tier",
    cell: ({ row }) => (
      <Badge variant={TIER_VARIANT[row.original.tierInterest] || "secondary"}>
        {row.original.tierInterest === "vip" ? "VIP" : "Member"}
      </Badge>
    ),
  },
  {
    accessorKey: "prospectPhone",
    header: "Phone",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.prospectPhone || "—"}
      </span>
    ),
  },
  {
    accessorKey: "callDate",
    header: "Source Call",
    cell: ({ row }) => {
      if (!row.original.callId) return <span className="text-muted-foreground">—</span>
      return (
        <a
          href={`/dashboard/calls/${row.original.callId}`}
          className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
        >
          <Phone className="h-3 w-3" />
          {row.original.callDate ? formatDate(row.original.callDate) : "View"}
        </a>
      )
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Submitted
        <ArrowUpDown className="ml-1 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-sm">{formatRelative(row.original.createdAt)}</span>
    ),
  },
  {
    accessorKey: "daysRemaining",
    header: "SLA",
    cell: ({ row }) => {
      const { status, daysRemaining } = row.original
      if (status !== "pending") return <span className="text-muted-foreground text-sm">—</span>
      if (daysRemaining <= 0) return <Badge variant="destructive">Expired</Badge>
      if (daysRemaining <= 1) return <Badge variant="destructive">{daysRemaining}d left</Badge>
      return <Badge variant="outline">{daysRemaining}d left</Badge>
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status] || "secondary"}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      if (row.original.status !== "pending") {
        return (
          <span className="text-muted-foreground text-xs">
            {row.original.resolvedBy ? `by ${row.original.resolvedBy}` : ""}
          </span>
        )
      }
      return (
        <div className="flex gap-1">
          <LeadApproveDialog leadId={row.original._id as any} prospectName={row.original.prospectName} />
          <LeadDenyDialog leadId={row.original._id as any} prospectName={row.original.prospectName} />
        </div>
      )
    },
  },
]

export function LeadTable() {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const leads = useAuthQuery(
    api.membershipLeads.queries.list,
    statusFilter === "all"
      ? {}
      : { status: statusFilter as any }
  )

  const table = useReactTable({
    data: (leads ?? []) as LeadRow[],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: { sorting, globalFilter },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Search leads..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="denied">Denied</TabsTrigger>
            <TabsTrigger value="expired">Expired</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
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
                  {leads === undefined ? "Loading..." : "No leads found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
