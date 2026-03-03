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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  },
  sent_a: {
    label: "Sent A",
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  sent_b: {
    label: "Sent B",
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  a_interested: {
    label: "A Interested",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800",
  },
  b_interested: {
    label: "B Interested",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-800",
  },
  mutual_interest: {
    label: "Mutual Interest",
    className: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:border-purple-800",
  },
  group_created: {
    label: "Group Created",
    className: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800",
  },
  a_declined: {
    label: "A Declined",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  },
  b_declined: {
    label: "B Declined",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  },
  a_passed: {
    label: "A Passed",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  },
  b_passed: {
    label: "B Passed",
    className: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800",
  },
  personal_outreach_a: {
    label: "Outreach A",
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
  },
  personal_outreach_b: {
    label: "Outreach B",
    className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800",
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
