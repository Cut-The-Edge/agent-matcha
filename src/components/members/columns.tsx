"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Check, X, ArrowUpDown, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Doc } from "../../../convex/_generated/dataModel"
import { format } from "date-fns"

export interface MemberTableMeta {
  onEdit?: (member: Member) => void
}

type Member = Doc<"members">

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

const statusConfig: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  paused: {
    label: "Paused",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  recalibrating: {
    label: "Recalibrating",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
}

export const columns: ColumnDef<Member>[] = [
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
    cell: ({ row }) => {
      const firstName = row.original.firstName
      const lastName = row.original.lastName
      return (
        <span className="font-medium">
          {firstName}
          {lastName ? ` ${lastName}` : ""}
        </span>
      )
    },
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
    header: "Tier",
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
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status
      const config = statusConfig[status]
      return (
        <Badge
          variant="outline"
          className={`border-transparent ${config.className}`}
        >
          {config.label}
        </Badge>
      )
    },
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
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
    accessorKey: "profileComplete",
    header: "Profile",
    cell: ({ row }) =>
      row.original.profileComplete ? (
        <Check className="size-4 text-green-600 dark:text-green-400" />
      ) : (
        <X className="size-4 text-muted-foreground" />
      ),
  },
  {
    accessorKey: "lastSyncedAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Last Synced
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground tabular-nums">
        {format(new Date(row.original.lastSyncedAt), "MMM d, yyyy")}
      </span>
    ),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const meta = table.options.meta as MemberTableMeta | undefined
      return (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => meta?.onEdit?.(row.original)}
        >
          <Pencil className="mr-1 size-3" />
          Edit
        </Button>
      )
    },
    enableHiding: false,
  },
]
