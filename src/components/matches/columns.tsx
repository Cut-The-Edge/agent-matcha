"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MoreVertical, ArrowUpDown } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Id } from "../../../convex/_generated/dataModel"

export type MatchRow = {
  _id: Id<"matches">
  _creationTime: number
  memberAId: Id<"members">
  memberBId: Id<"members">
  memberAName: string
  memberBName: string
  status: string
  triggeredBy: Id<"admins">
  triggeredByName: string
  createdAt: number
  updatedAt: number
  smaIntroId?: string
  groupChatId?: string
}

// §7.1 Match Status Values
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  rejected: {
    label: "Rejected",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  },
  past: {
    label: "Past",
    className: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800",
  },
  pending: {
    label: "Pending",
    className: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  expired: {
    label: "Expired",
    className: "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  },
}

export const columns: ColumnDef<MatchRow>[] = [
  {
    id: "matchPair",
    accessorFn: (row) => `${row.memberAName} & ${row.memberBName}`,
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Match Pair
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.memberAName}</span>
        <span className="text-muted-foreground text-xs">
          & {row.original.memberBName}
        </span>
      </div>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status
      const config = STATUS_CONFIG[status] ?? {
        label: status,
        className: "bg-gray-100 text-gray-700 border-gray-200",
      }
      return (
        <Badge variant="outline" className={config.className}>
          {config.label}
        </Badge>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: "triggeredByName",
    header: "Triggered By",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.triggeredByName}
      </span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <Button
        variant="ghost"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Created
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {formatDistanceToNow(new Date(row.original.createdAt), {
          addSuffix: true,
        })}
      </span>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
            size="icon"
          >
            <MoreVertical className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem>View details</DropdownMenuItem>
          <DropdownMenuItem>View conversation</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Resend message</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">
            Cancel match
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
