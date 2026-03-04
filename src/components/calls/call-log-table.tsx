"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table"
import {
  PhoneIncoming,
  PhoneOutgoing,
  ArrowUpDown,
} from "lucide-react"
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
import { useAuthQuery } from "@/hooks/use-auth-query"
import { api } from "../../../convex/_generated/api"
import { CallQualityFlags } from "./call-quality-flags"

type CallRow = {
  _id: string
  direction: "inbound" | "outbound"
  phone?: string
  memberName?: string | null
  status: string
  duration?: number
  profileAction?: string
  smaSyncStatus?: string
  qualityFlags?: string[]
  startedAt: number
  createdAt: number
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return "—"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  in_progress: "default",
  completed: "secondary",
  transferred: "outline",
  failed: "destructive",
  no_answer: "secondary",
}

const columns: ColumnDef<CallRow>[] = [
  {
    accessorKey: "startedAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Date/Time
        <ArrowUpDown className="ml-1 size-3" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-sm">{formatDate(row.original.startedAt)}</span>
    ),
  },
  {
    accessorKey: "memberName",
    header: "Caller",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">
          {row.original.memberName ?? "Unknown"}
        </span>
        {row.original.phone && (
          <span className="text-xs text-muted-foreground">
            {row.original.phone}
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "direction",
    header: "Type",
    cell: ({ row }) =>
      row.original.direction === "inbound" ? (
        <div className="flex items-center gap-1 text-sm">
          <PhoneIncoming className="size-3 text-green-600" />
          In
        </div>
      ) : (
        <div className="flex items-center gap-1 text-sm">
          <PhoneOutgoing className="size-3 text-blue-600" />
          Out
        </div>
      ),
  },
  {
    accessorKey: "duration",
    header: "Duration",
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">
        {formatDuration(row.original.duration)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status] ?? "outline"}>
        {row.original.status.replace("_", " ")}
      </Badge>
    ),
  },
  {
    accessorKey: "profileAction",
    header: "Profile",
    cell: ({ row }) => {
      const action = row.original.profileAction
      if (!action || action === "none") return <span className="text-sm text-muted-foreground">—</span>
      return (
        <Badge variant={action === "created" ? "default" : "secondary"}>
          {action}
        </Badge>
      )
    },
  },
  {
    accessorKey: "smaSyncStatus",
    header: "SMA",
    cell: ({ row }) => {
      const status = row.original.smaSyncStatus
      if (!status) return <span className="text-sm text-muted-foreground">—</span>
      const variant =
        status === "synced"
          ? "secondary"
          : status === "failed"
            ? "destructive"
            : "outline"
      return <Badge variant={variant}>{status}</Badge>
    },
  },
  {
    accessorKey: "qualityFlags",
    header: "Flags",
    cell: ({ row }) => (
      <CallQualityFlags flags={row.original.qualityFlags} />
    ),
  },
]

export function CallLogTable() {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>([
    { id: "startedAt", desc: true },
  ])
  const [globalFilter, setGlobalFilter] = useState("")

  const calls = useAuthQuery(api.voice.queries.getCallLog, {})

  const table = useReactTable({
    data: (calls ?? []) as CallRow[],
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
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search calls..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
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
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/dashboard/calls/${row.original._id}`)
                  }
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
                  {calls === undefined ? "Loading calls..." : "No calls yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
