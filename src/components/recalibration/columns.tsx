"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { ArrowUpDown, RotateCcw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"

export interface RecalibrationMember {
  _id: string
  firstName: string
  lastName?: string
  email?: string
  phone?: string
  tier: "free" | "member" | "vip"
  rejectionCount: number
  lastRejectionAt: number | null
  topRejectionReason: string | null
}

export interface RecalibrationTableMeta {
  onReactivate: (memberId: string) => void
  reactivatingId: string | null
}

const tierConfig: Record<string, { label: string; className: string }> = {
  free: {
    label: "Free",
    className: "bg-secondary text-secondary-foreground",
  },
  member: {
    label: "Member",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  vip: {
    label: "VIP",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
}

export const columns: ColumnDef<RecalibrationMember>[] = [
  {
    id: "name",
    accessorFn: (row) =>
      `${row.firstName}${row.lastName ? ` ${row.lastName}` : ""}`,
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Name
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.firstName}
        {row.original.lastName ? ` ${row.original.lastName}` : ""}
      </span>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.email || "---"}
      </span>
    ),
  },
  {
    accessorKey: "phone",
    header: "Phone",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.phone || "---"}
      </span>
    ),
  },
  {
    accessorKey: "tier",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Tier
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const tier = row.original.tier
      const config = tierConfig[tier]
      return (
        <Badge
          variant="outline"
          className={`border-transparent ${config.className}`}
        >
          {config.label}
        </Badge>
      )
    },
  },
  {
    accessorKey: "rejectionCount",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Rejections
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="tabular-nums">{row.original.rejectionCount}</span>
    ),
  },
  {
    id: "lastRejectionAt",
    accessorFn: (row) => row.lastRejectionAt,
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Last Rejection
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const ts = row.original.lastRejectionAt
      if (!ts) return <span className="text-muted-foreground">---</span>
      return (
        <span className="text-muted-foreground">
          {formatDistanceToNow(new Date(ts), { addSuffix: true })}
        </span>
      )
    },
  },
  {
    id: "topRejectionReason",
    accessorFn: (row) => row.topRejectionReason,
    header: "Top Reason",
    cell: ({ row }) => {
      const reason = row.original.topRejectionReason
      if (!reason) return <span className="text-muted-foreground">---</span>
      return <span className="capitalize">{reason}</span>
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const meta = table.options.meta as RecalibrationTableMeta | undefined
      const isReactivating = meta?.reactivatingId === row.original._id
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={isReactivating}
          onClick={() => meta?.onReactivate(row.original._id)}
        >
          {isReactivating ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <RotateCcw className="mr-1 size-3" />
          )}
          Reactivate
        </Button>
      )
    },
    enableHiding: false,
  },
]
