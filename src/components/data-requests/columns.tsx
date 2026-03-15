"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Send, Loader2, Copy, ExternalLink } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { format } from "date-fns"

export interface DataRequestRow {
  _id: string
  memberId: string
  firstName: string
  lastName?: string
  phone?: string
  email?: string
  missingFields: string[]
  latestRequestStatus: "pending" | "completed" | "expired" | null
  latestRequestSentAt: number | null
  latestRequestToken: string | null
  completedAt?: number | null
}

export interface DataRequestTableMeta {
  onSendForm?: (row: DataRequestRow) => void
  onCopyLink?: () => void
  sendingMemberId?: string | null
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  expired: {
    label: "Expired",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
}

const fieldBadgeConfig: Record<string, { label: string; className: string }> = {
  email: { label: "Email", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  location: { label: "Location", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  profilePicture: { label: "Photo", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  instagram: { label: "IG", className: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  tiktok: { label: "TT", className: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  linkedin: { label: "LI", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
}

export const columns: ColumnDef<DataRequestRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "name",
    accessorFn: (row) => `${row.firstName}${row.lastName ? ` ${row.lastName}` : ""}`,
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Member
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
    accessorKey: "phone",
    header: "Phone",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.phone || "---"}
      </span>
    ),
  },
  {
    id: "missingFields",
    header: "Missing Fields",
    cell: ({ row }) => {
      const fields = row.original.missingFields
      if (fields.length === 0) return <span className="text-muted-foreground text-xs">None</span>
      return (
        <div className="flex flex-wrap gap-0.5">
          {fields.map((field) => {
            const config = fieldBadgeConfig[field] ?? { label: field, className: "bg-gray-100 text-gray-600" }
            return (
              <Badge
                key={field}
                variant="outline"
                className={`border-transparent px-1.5 py-0 text-[11px] leading-snug ${config.className}`}
              >
                {config.label}
              </Badge>
            )
          })}
        </div>
      )
    },
  },
  {
    id: "status",
    accessorFn: (row) => row.latestRequestStatus,
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.latestRequestStatus
      if (!status) return <span className="text-muted-foreground text-xs">Not sent</span>
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
    filterFn: (row, id, value) => {
      if (!value || value === "all") return true
      return row.original.latestRequestStatus === value
    },
  },
  {
    id: "sentAt",
    accessorFn: (row) => row.latestRequestSentAt,
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        className="-ml-3"
      >
        Sent At
        <ArrowUpDown className="ml-2 size-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const sentAt = row.original.latestRequestSentAt
      if (!sentAt) return <span className="text-muted-foreground text-xs">---</span>
      return (
        <span className="text-muted-foreground tabular-nums text-sm">
          {format(new Date(sentAt), "MMM d, yyyy")}
        </span>
      )
    },
  },
  {
    id: "actions",
    header: "",
    cell: ({ row, table }) => {
      const meta = table.options.meta as DataRequestTableMeta | undefined
      const isSending = meta?.sendingMemberId === row.original._id
      const hasPhone = !!row.original.phone
      const isPending = row.original.latestRequestStatus === "pending"
      const token = row.original.latestRequestToken
      const formUrl = token ? `${window.location.origin}/form/${token}` : null

      return (
        <div className="flex items-center gap-1">
          {formUrl && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => {
                      navigator.clipboard.writeText(formUrl)
                      meta?.onCopyLink?.()
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Copy form link</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {formUrl && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => window.open(formUrl, "_blank")}
                  >
                    <ExternalLink className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Open form in new tab</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={isSending || !hasPhone || isPending}
                    onClick={() => meta?.onSendForm?.(row.original)}
                  >
                    {isSending ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <Send className="mr-1 size-3" />
                    )}
                    Send Form
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasPhone && (
                <TooltipContent>
                  <p>Member has no phone number</p>
                </TooltipContent>
              )}
              {isPending && hasPhone && (
                <TooltipContent>
                  <p>A form is already pending for this member</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      )
    },
    enableHiding: false,
  },
]
